// Puts one copy of the Worker on Cloudflare from GitHub Actions, and rolls it
// back when the live host does not answer as it should.
//   bun scripts/deploy/run.ts <staging|production> [--dry-run] [--drill-rollback]

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import { parseArgs } from 'node:util'

import { z } from 'zod'

import { smokeCheck, type SmokeResult } from './smoke'
import { seedStaging } from './staging-seed'

export type Target = 'staging' | 'production'

export interface Command {
  argv: readonly string[]
  /** Set over the inherited environment. */
  env?: Record<string, string>
  /** Whether the command may read the Cloudflare token and account. */
  credentials: boolean
  /** Keeps the output out of the log, for one that names an account. */
  quiet?: boolean
}

export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

/** What a build says about the copy it belongs to. */
export interface Build {
  name: string
  host: string
  script: string
}

/** Everything the run reads or starts, passed in so a test sets each one. */
export interface DeployRun {
  target: Target
  dryRun: boolean
  /** Treats a passing smoke check as failed, to prove the rollback works. */
  drill: boolean
  inCi: boolean
  run: (command: Command) => Promise<CommandResult>
  readBuild: () => Promise<Build>
  seedStaging: () => Promise<void>
  smoke: (host: string, script: string | undefined) => Promise<SmokeResult>
  write: (text: string) => void
}

type Serving =
  | { state: 'version'; id: string }
  | { state: 'no-worker' }
  | { state: 'unreadable' }

const deployment = z.object({
  versions: z.tuple([
    z.object({ version_id: z.string(), percentage: z.literal(100) }),
  ]),
})

const restorePoint = z.object({ bookmark: z.string().min(1) })

/** Resolves with the exit code the process should end with. */
export async function runDeploy(run: DeployRun): Promise<number> {
  if (run.drill && run.target === 'production') {
    return stop(run, 'The rollback drill runs on staging alone.')
  }
  if (!run.dryRun && !run.inCi) {
    return stop(run, 'A real deploy runs in GitHub Actions alone.')
  }

  const built = await run.run({
    argv: ['bun', 'run', 'build'],
    env: { CLOUDFLARE_ENV: run.target },
    credentials: false,
  })
  if (built.code !== 0) return stop(run, 'The build failed.')
  const build = await run.readBuild()
  const name = workerName(run.target)
  if (build.name !== name) {
    return stop(run, `The build holds ${build.name}, not ${name}.`)
  }
  if (run.dryRun) {
    const { code } = await run.run({
      argv: wrangler('deploy', '--dry-run'),
      credentials: false,
    })
    return code
  }
  return deployBuild(run, build)
}

async function deployBuild(run: DeployRun, build: Build): Promise<number> {
  const before = await readServing(run)
  if (before.state === 'unreadable') {
    return stop(run, 'The serving version could not be read.')
  }
  const bookmark = await readRestorePoint(run)
  if (bookmark === undefined) {
    return stop(run, 'No restore point could be read.')
  }
  run.write(
    `Serving before: ${before.state === 'version' ? before.id : 'nothing yet'}\n` +
      `Restore point: ${bookmark}\n`,
  )

  const migrated = await run.run({
    argv: wrangler(
      'd1',
      'migrations',
      'apply',
      'DB',
      '--remote',
      '--env',
      run.target,
    ),
    credentials: true,
  })
  if (migrated.code !== 0) {
    return stop(
      run,
      `A migration failed, so nothing deployed. The restore point is ${bookmark}.`,
    )
  }

  const deployed = await run.run({
    argv: wrangler('deploy'),
    credentials: true,
  })
  if (deployed.code !== 0) return afterRedDeploy(run, build, before)

  const seeded = run.target !== 'staging' || (await seed(run))
  const result = await run.smoke(build.host, build.script)
  if (result === 'blocked') {
    return stop(run, 'The smoke check was blocked, so nothing rolled back.')
  }
  if (result === 'failed') {
    run.write('The smoke check failed.\n')
    return rollBack(run, build, before)
  }
  if (run.drill) {
    run.write('The drill takes this passing smoke check as failed.\n')
    return rollBack(run, build, before)
  }
  if (!seeded) return 1
  run.write(`${build.name} is live on ${build.host}.\n`)
  return 0
}

/** A deploy can switch traffic and still fail, such as on its host. */
async function afterRedDeploy(
  run: DeployRun,
  build: Build,
  before: Serving,
): Promise<number> {
  const after = await readServing(run)
  if (after.state === 'unreadable') {
    return stop(
      run,
      'The deploy failed and the serving version could not be read, so check it by hand.',
    )
  }
  const moved =
    after.state === 'version' &&
    (before.state !== 'version' || before.id !== after.id)
  if (!moved) return stop(run, 'The deploy failed and changed nothing live.')
  run.write('The deploy failed after it switched traffic.\n')
  return rollBack(run, build, before)
}

/** Always ends red, since a rollback means this version did not go out. */
async function rollBack(
  run: DeployRun,
  build: Build,
  before: Serving,
): Promise<number> {
  if (before.state !== 'version') {
    return stop(run, 'This was the first version, so nothing to roll back to.')
  }
  const rolledBack = await run.run({
    argv: wrangler(
      'rollback',
      before.id,
      '--name',
      build.name,
      '--message',
      'Smoke check failed',
      '--yes',
    ),
    credentials: true,
  })
  if (rolledBack.code !== 0) {
    return stop(run, `The rollback was refused. Restore ${before.id} by hand.`)
  }
  const after = await readServing(run)
  if (after.state !== 'version' || after.id !== before.id) {
    return stop(run, `The rollback ran but another version still serves.`)
  }
  const result = await run.smoke(build.host, undefined)
  return stop(
    run,
    `Rolled back to ${before.id}, whose smoke check reads ${result}.`,
  )
}

async function seed(run: DeployRun): Promise<boolean> {
  try {
    await run.seedStaging()
    return true
  } catch (error) {
    run.write(
      `The seed failed: ${error instanceof Error ? error.message : 'unknown'}\n`,
    )
    return false
  }
}

async function readServing(run: DeployRun): Promise<Serving> {
  const result = await run.run({
    argv: wrangler(
      'deployments',
      'status',
      '--name',
      workerName(run.target),
      '--json',
    ),
    credentials: true,
    quiet: true,
  })
  if (result.code !== 0) {
    // Only this code says the Worker was never deployed. Any other failure
    // might hide a version the run would then be unable to restore.
    return `${result.stdout}${result.stderr}`.includes('[code: 10007]')
      ? { state: 'no-worker' }
      : { state: 'unreadable' }
  }
  const parsed = deployment.safeParse(readJson(result.stdout))
  if (!parsed.success) return { state: 'unreadable' }
  return { state: 'version', id: parsed.data.versions[0].version_id }
}

async function readRestorePoint(run: DeployRun): Promise<string | undefined> {
  const result = await run.run({
    argv: wrangler(
      'd1',
      'time-travel',
      'info',
      'DB',
      '--env',
      run.target,
      '--json',
    ),
    credentials: true,
    quiet: true,
  })
  if (result.code !== 0) return undefined
  return restorePoint.safeParse(readJson(result.stdout)).data?.bookmark
}

function readJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function workerName(target: Target): string {
  return `lichtrinh-${target}`
}

function wrangler(...args: string[]): string[] {
  return ['bunx', 'wrangler', ...args]
}

function stop(run: DeployRun, reason: string): number {
  run.write(`${reason}\n`)
  return 1
}

export function readArgs(
  argv: readonly string[],
): Pick<DeployRun, 'target' | 'dryRun' | 'drill'> | undefined {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        'dry-run': { type: 'boolean', default: false },
        'drill-rollback': { type: 'boolean', default: false },
      },
    })
    const [target, ...rest] = positionals
    if (rest.length > 0) return undefined
    if (target !== 'staging' && target !== 'production') return undefined
    return {
      target,
      dryRun: values['dry-run'],
      drill: values['drill-rollback'],
    }
  } catch {
    return undefined
  }
}

const deployRedirect = z.object({ configPath: z.string() })

const builtConfig = z.object({
  name: z.string(),
  routes: z.tuple([z.object({ pattern: z.string() })]),
  assets: z.object({ directory: z.string() }),
})

/** Reads the copy Wrangler will deploy, through the same redirect it follows. */
export async function readBuild(root: string): Promise<Build> {
  const redirectDir = join(root, '.wrangler', 'deploy')
  const redirect = deployRedirect.parse(
    JSON.parse(await readFile(join(redirectDir, 'config.json'), 'utf8')),
  )
  const configPath = resolve(redirectDir, redirect.configPath)
  const config = builtConfig.parse(
    JSON.parse(await readFile(configPath, 'utf8')),
  )
  const html = await readFile(
    resolve(configPath, '..', config.assets.directory, 'index.html'),
    'utf8',
  )
  const script = /<script type="module"[^>]* src="([^"]+)"/.exec(html)?.[1]
  if (script === undefined) throw new Error('The built shell names no script')
  return { name: config.name, host: config.routes[0].pattern, script }
}

const CREDENTIALS = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']

/** A command's environment, without the credentials it has no use for. */
export function childEnv(
  parent: Record<string, string | undefined>,
  command: Command,
): Record<string, string | undefined> {
  const env = { ...parent, ...command.env }
  if (!command.credentials) for (const name of CREDENTIALS) delete env[name]
  return env
}

/** Hides what a public log should not name, whatever printed it. */
export function redact(text: string): string {
  return text
    .replaceAll(/[^\s@<>"']+@[^\s@<>"']+\.[a-z]+/gi, '[email]')
    .replaceAll(/\b[0-9a-f]{32}\b/g, '[id]')
}

function spawnCommand(
  command: Command,
  write: (text: string) => void,
): Promise<CommandResult> {
  return new Promise((settle) => {
    const child = spawn(command.argv[0] ?? '', command.argv.slice(1), {
      env: childEnv(process.env, command),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.once('error', () => settle({ code: 127, stdout, stderr }))
    child.once('close', (code) => {
      if (!command.quiet) write(redact(`${stdout}${stderr}`))
      settle({ code: code ?? 1, stdout, stderr })
    })
  })
}

if (import.meta.main) {
  const write = (text: string) => process.stdout.write(text)
  const args = readArgs(process.argv.slice(2))
  if (args === undefined) {
    write('usage: run.ts <staging|production> [--dry-run] [--drill-rollback]\n')
    process.exit(2)
  }
  process.exitCode = await runDeploy({
    ...args,
    inCi: process.env.GITHUB_ACTIONS === 'true',
    run: (command) => spawnCommand(command, write),
    readBuild: () => readBuild(resolve(import.meta.dirname, '..', '..')),
    seedStaging: () =>
      seedStaging({
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
        token: process.env.CLOUDFLARE_API_TOKEN ?? '',
        now: new Date(),
        fetch,
      }),
    smoke: (host, script) =>
      smokeCheck({ host, script, fetch, write, now: Date.now, wait }),
    write,
  })
}
