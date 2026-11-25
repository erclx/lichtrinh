import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  childEnv,
  type Command,
  type CommandResult,
  type DeployRun,
  readArgs,
  readBuild,
  redact,
  runDeploy,
} from './run'
import type { SmokeResult } from './smoke'

const OLD = '11111111-0000-4000-8000-000000000000'
const NEW = '22222222-0000-4000-8000-000000000000'
const BOOKMARK = '00000001-invented-bookmark'

const passed = (stdout = ''): CommandResult => ({ code: 0, stdout, stderr: '' })
const failed = (stderr = ''): CommandResult => ({ code: 1, stdout: '', stderr })
const serving = (id: string) =>
  passed(JSON.stringify({ versions: [{ version_id: id, percentage: 100 }] }))

const MISSING_WORKER = failed(
  'This Worker does not exist on your account. [code: 10007]',
)

type Step =
  | 'build'
  | 'dry-run'
  | 'status'
  | 'restore-point'
  | 'migrate'
  | 'deploy'
  | 'rollback'

function stepOf({ argv }: Command): Step {
  const line = argv.join(' ')
  if (line.includes('run build')) return 'build'
  if (line.includes('--dry-run')) return 'dry-run'
  if (line.includes('deployments status')) return 'status'
  if (line.includes('time-travel info')) return 'restore-point'
  if (line.includes('migrations apply')) return 'migrate'
  if (line.includes('rollback')) return 'rollback'
  if (line.includes('wrangler deploy')) return 'deploy'
  throw new Error(`no such step: ${line}`)
}

/** A run against a Cloudflare that answers from the lists a test passes. */
function deploy(
  overrides: Partial<DeployRun> = {},
  {
    answers = {},
    smokes = ['ok'],
  }: {
    answers?: Partial<Record<Step, CommandResult[]>>
    smokes?: SmokeResult[]
  } = {},
) {
  const steps: string[] = []
  const commands: Command[] = []
  const lines: string[] = []
  const scripts: (string | undefined)[] = []
  const queues: Record<Step, CommandResult[]> = {
    build: [],
    'dry-run': [],
    // Serving the old version before the deploy and the new one after.
    status: [serving(OLD), serving(NEW)],
    'restore-point': [passed(JSON.stringify({ bookmark: BOOKMARK }))],
    migrate: [],
    deploy: [],
    rollback: [],
    ...answers,
  }
  const run: DeployRun = {
    target: 'staging',
    dryRun: false,
    drill: false,
    inCi: true,
    run: async (command) => {
      const step = stepOf(command)
      steps.push(step)
      commands.push(command)
      return queues[step].shift() ?? passed()
    },
    readBuild: async () => ({
      name: 'lichtrinh-staging',
      host: 'staging.example.com',
      script: '/assets/index-new.js',
    }),
    seedStaging: async () => {
      steps.push('seed')
    },
    smoke: async (_host, script) => {
      steps.push('smoke')
      scripts.push(script)
      return smokes.shift() ?? 'ok'
    },
    write: (text) => lines.push(text),
    ...overrides,
  }
  const find = (step: Step) =>
    commands.find((command) => stepOf(command) === step)?.argv.join(' ') ?? ''
  return {
    run,
    steps,
    commands,
    scripts,
    find,
    output: () => lines.join(''),
  }
}

describe('a deploy that works', () => {
  it('reads what serves and a restore point before it migrates, then deploys, seeds, and checks', async () => {
    const { run, steps } = deploy()

    expect(await runDeploy(run)).toBe(0)
    expect(steps).toEqual([
      'build',
      'status',
      'restore-point',
      'migrate',
      'deploy',
      'seed',
      'smoke',
    ])
  })

  it('logs the version it could roll back to and the restore point', async () => {
    const { run, output } = deploy()

    await runDeploy(run)

    expect(output()).toContain(OLD)
    expect(output()).toContain(BOOKMARK)
  })

  it('never seeds production', async () => {
    const { run, steps } = deploy({
      target: 'production',
      readBuild: async () => ({
        name: 'lichtrinh-production',
        host: 'app.example.com',
        script: '/assets/index-new.js',
      }),
    })

    expect(await runDeploy(run)).toBe(0)
    expect(steps).not.toContain('seed')
  })

  it.each(['restore-point', 'migrate'] as const)(
    'points %s at the target environment',
    async (step) => {
      const { run, find } = deploy()

      await runDeploy(run)

      expect(find(step)).toContain('--env staging')
    },
  )

  it('migrates the remote database', async () => {
    const { run, find } = deploy()

    await runDeploy(run)

    expect(find('migrate')).toContain('--remote')
  })

  it('checks for the script the build holds', async () => {
    const { run, scripts } = deploy()

    await runDeploy(run)

    expect(scripts).toEqual(['/assets/index-new.js'])
  })

  it('builds for the target without the account credentials', async () => {
    const { run, commands } = deploy()

    await runDeploy(run)

    expect(commands[0]).toMatchObject({
      env: { CLOUDFLARE_ENV: 'staging' },
      credentials: false,
    })
  })
})

describe('a refused run', () => {
  it('runs nothing outside CI', async () => {
    const { run, steps } = deploy({ inCi: false })

    expect(await runDeploy(run)).toBe(1)
    expect(steps).toEqual([])
  })

  it('never drills production', async () => {
    const { run, steps } = deploy({ target: 'production', drill: true })

    expect(await runDeploy(run)).toBe(1)
    expect(steps).toEqual([])
  })

  it('stops after the build when the built Worker is the other copy', async () => {
    const { run, steps } = deploy({
      readBuild: async () => ({
        name: 'lichtrinh-production',
        host: 'app.example.com',
        script: '/assets/index-new.js',
      }),
    })

    expect(await runDeploy(run)).toBe(1)
    expect(steps).toEqual(['build'])
  })
})

describe('a dry run', () => {
  it('builds and validates outside CI, and uploads nothing', async () => {
    const { run, steps } = deploy({ dryRun: true, inCi: false })

    expect(await runDeploy(run)).toBe(0)
    expect(steps).toEqual(['build', 'dry-run'])
  })

  it('reads no credential', async () => {
    const { run, commands } = deploy({ dryRun: true, inCi: false })

    await runDeploy(run)

    expect(commands.map(({ credentials }) => credentials)).toEqual([
      false,
      false,
    ])
  })

  it('exits red when the config does not validate', async () => {
    const { run } = deploy(
      { dryRun: true, inCi: false },
      { answers: { 'dry-run': [failed()] } },
    )

    expect(await runDeploy(run)).toBe(1)
  })
})

describe('a failure before the deploy', () => {
  it.each([
    ['the build fails', { build: [failed()] }, ['build']],
    [
      'the serving version cannot be read',
      { status: [failed('Authentication error [code: 10000]')] },
      ['build', 'status'],
    ],
    [
      'the serving version is not JSON',
      { status: [passed('not json')] },
      ['build', 'status'],
    ],
    [
      'traffic is split between two versions',
      {
        status: [
          passed(
            JSON.stringify({
              versions: [
                { version_id: OLD, percentage: 50 },
                { version_id: NEW, percentage: 50 },
              ],
            }),
          ),
        ],
      },
      ['build', 'status'],
    ],
    [
      'no restore point can be read',
      { 'restore-point': [failed()] },
      ['build', 'status', 'restore-point'],
    ],
    [
      'a migration fails',
      { migrate: [failed()] },
      ['build', 'status', 'restore-point', 'migrate'],
    ],
  ])('stops and exits red when %s', async (_case, answers, expected) => {
    const { run, steps } = deploy({}, { answers })

    expect(await runDeploy(run)).toBe(1)
    expect(steps).toEqual(expected)
  })

  it('names the restore point when a migration fails', async () => {
    const { run, output } = deploy({}, { answers: { migrate: [failed()] } })

    await runDeploy(run)

    expect(output()).toContain(BOOKMARK)
  })
})

describe('a failed smoke check', () => {
  it('rolls back to the version serving before, checks again, and exits red', async () => {
    const { run, steps, find } = deploy(
      {},
      {
        smokes: ['failed', 'ok'],
        answers: { status: [serving(OLD), serving(OLD)] },
      },
    )

    expect(await runDeploy(run)).toBe(1)
    expect(steps.slice(-4)).toEqual(['smoke', 'rollback', 'status', 'smoke'])
    expect(find('rollback')).toContain(`rollback ${OLD}`)
    expect(find('rollback')).toContain('--name lichtrinh-staging')
  })

  it('takes any build in the check after the rollback', async () => {
    const { run, scripts } = deploy(
      {},
      {
        smokes: ['failed', 'ok'],
        answers: { status: [serving(OLD), serving(OLD)] },
      },
    )

    await runDeploy(run)

    expect(scripts.at(-1)).toBeUndefined()
  })

  it('says so when the rollback is refused', async () => {
    const { run, output } = deploy(
      {},
      { smokes: ['failed'], answers: { rollback: [failed()] } },
    )

    expect(await runDeploy(run)).toBe(1)
    expect(output()).toContain('rollback was refused')
  })

  it('says so when the rollback passes but the new version still serves', async () => {
    const { run, output } = deploy({}, { smokes: ['failed'] })

    expect(await runDeploy(run)).toBe(1)
    expect(output()).toContain('still serves')
  })

  it('has nothing to roll back to on a first deploy', async () => {
    const { run, steps } = deploy(
      {},
      { smokes: ['failed'], answers: { status: [MISSING_WORKER] } },
    )

    expect(await runDeploy(run)).toBe(1)
    expect(steps).not.toContain('rollback')
  })

  it('never rolls back for a check Cloudflare blocked', async () => {
    const { run, steps } = deploy({}, { smokes: ['blocked'] })

    expect(await runDeploy(run)).toBe(1)
    expect(steps).not.toContain('rollback')
  })
})

describe('a deploy that exits red', () => {
  it('rolls back when it had already switched traffic', async () => {
    const { run, steps } = deploy(
      {},
      {
        answers: {
          deploy: [failed()],
          status: [serving(OLD), serving(NEW), serving(OLD)],
        },
      },
    )

    expect(await runDeploy(run)).toBe(1)
    expect(steps).toContain('rollback')
  })

  it('leaves a version that never moved alone', async () => {
    const { run, steps } = deploy(
      {},
      {
        answers: { deploy: [failed()], status: [serving(OLD), serving(OLD)] },
      },
    )

    expect(await runDeploy(run)).toBe(1)
    expect(steps).not.toContain('rollback')
    expect(steps).not.toContain('seed')
  })

  it('says so when it cannot tell what serves', async () => {
    const { run, output, steps } = deploy(
      {},
      { answers: { deploy: [failed()], status: [serving(OLD), failed()] } },
    )

    expect(await runDeploy(run)).toBe(1)
    expect(steps).not.toContain('rollback')
    expect(output()).toContain('could not be read')
  })
})

describe('a failed seed', () => {
  it('still checks the app, rolls nothing back, and exits red', async () => {
    const { run, steps } = deploy({
      seedStaging: async () => {
        throw new Error('invented seed failure')
      },
    })

    expect(await runDeploy(run)).toBe(1)
    expect(steps).toContain('smoke')
    expect(steps).not.toContain('rollback')
  })
})

describe('a rollback drill', () => {
  it('rolls a healthy staging deploy back and exits red', async () => {
    const { run, steps } = deploy(
      { drill: true },
      { answers: { status: [serving(OLD), serving(OLD)] } },
    )

    expect(await runDeploy(run)).toBe(1)
    expect(steps.slice(-4)).toEqual(['smoke', 'rollback', 'status', 'smoke'])
  })
})

describe('childEnv', () => {
  const parent = {
    PATH: '/bin',
    CLOUDFLARE_API_TOKEN: 'invented-token',
    CLOUDFLARE_ACCOUNT_ID: 'invented-account',
  }

  it('hides the token from a command that needs no credentials', () => {
    const env = childEnv(parent, {
      argv: ['bun', 'run', 'build'],
      env: { CLOUDFLARE_ENV: 'staging' },
      credentials: false,
    })

    expect(env).toEqual({ PATH: '/bin', CLOUDFLARE_ENV: 'staging' })
  })

  it('passes the token to a command that does', () => {
    const env = childEnv(parent, { argv: ['bunx'], credentials: true })

    expect(env.CLOUDFLARE_API_TOKEN).toBe('invented-token')
  })
})

describe('redact', () => {
  it.each([
    ['an email', 'Author: someone@example.com'],
    ['an account id', '/accounts/0123456789abcdef0123456789abcdef/workers'],
  ])('hides %s from a public log', (_case, text) => {
    expect(redact(text)).not.toMatch(/someone@|0123456789abcdef/)
  })

  it('keeps a version id', () => {
    expect(redact(`Current Version ID: ${OLD}`)).toContain(OLD)
  })
})

describe('readArgs', () => {
  it('reads a target and its flags', () => {
    expect(readArgs(['staging', '--drill-rollback'])).toEqual({
      target: 'staging',
      dryRun: false,
      drill: true,
    })
  })

  it.each([
    ['no target', []],
    ['an unknown target', ['preview']],
    ['two targets', ['staging', 'production']],
    ['an unknown flag', ['staging', '--force']],
  ])('refuses %s', (_case, argv) => {
    expect(readArgs(argv)).toBeUndefined()
  })
})

describe('readBuild', () => {
  let root = ''

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reads the Worker name, the host, and the script off the built output', async () => {
    root = await mkdtemp(join(tmpdir(), 'lichtrinh-build-'))
    await mkdir(join(root, '.wrangler/deploy'), { recursive: true })
    await mkdir(join(root, 'dist/lichtrinh'), { recursive: true })
    await mkdir(join(root, 'dist/client'), { recursive: true })
    await writeFile(
      join(root, '.wrangler/deploy/config.json'),
      JSON.stringify({ configPath: '../../dist/lichtrinh/wrangler.json' }),
    )
    await writeFile(
      join(root, 'dist/lichtrinh/wrangler.json'),
      JSON.stringify({
        name: 'lichtrinh-staging',
        routes: [{ pattern: 'staging.example.com', custom_domain: true }],
        assets: { directory: '../client' },
      }),
    )
    await writeFile(
      join(root, 'dist/client/index.html'),
      '<script type="module" crossorigin src="/assets/index-a1.js"></script>',
    )

    expect(await readBuild(root)).toEqual({
      name: 'lichtrinh-staging',
      host: 'staging.example.com',
      script: '/assets/index-a1.js',
    })
  })
})
