// Runs the whole app on this machine against invented data: the app, voice,
// and the bridge as children of this process, on a database of its own.
// One Ctrl-C stops all of them. `--reset` starts from fresh fixtures.

import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { readOllamaUrl } from '../../bridge/config'
import { FIXTURE_ACCOUNTS } from '../seed'
import { findMissing, type Miss } from './prerequisites'
import { type ServiceGroup, superviseServices } from './services'

/** A command run to its end before the services start. */
export interface OneShot {
  command: readonly string[]
  cwd: string
  env: Record<string, string>
}

/** Everything the run reads or starts, passed in so a test sets each one. */
export interface DevRun {
  checkout: string
  appPort: number
  reset: boolean
  /** Shared by the Worker and the bridge for this run alone, never stored. */
  secret: string
  write: (text: string) => void
  findMissing: () => Promise<Miss[]>
  removeState: (path: string) => Promise<void>
  runOnce: (task: OneShot) => Promise<number>
  services: ServiceGroup
  /** Whether a GET to the address answers at all. */
  answers: (url: string) => Promise<boolean>
  onInterrupt: (handler: () => void) => void
  appWaitMs: number
  pollMs: number
}

const VOICE_HEALTH = 'http://127.0.0.1:8770/health'
// The shell convention for a run a Ctrl-C ended before it was up.
const INTERRUPTED = 130

/** Resolves with the exit code the process should end with. */
export async function runDev(run: DevRun): Promise<number> {
  let interrupted = false
  run.onInterrupt(() => {
    interrupted = true
    run.services.stop()
  })

  const missing = await run.findMissing()
  if (missing.length > 0) {
    run.write('The run needs these first:\n')
    for (const { need, fix } of missing) run.write(`  ${need}: ${fix}\n`)
    return 1
  }

  const stateRoot = join(run.checkout, '.wrangler', 'dev')
  if (run.reset) await run.removeState(stateRoot)
  const seeded = await run.runOnce({
    command: ['bun', 'scripts/seed.ts', '--today'],
    cwd: run.checkout,
    env: { LICHTRINH_STATE_ROOT: stateRoot },
  })
  if (seeded !== 0) return seeded
  if (interrupted) return INTERRUPTED

  const appUrl = `http://localhost:${run.appPort}`
  run.services.start({
    name: 'app',
    command: ['bun', 'run', 'dev'],
    cwd: run.checkout,
    env: {
      LICHTRINH_STATE_ROOT: stateRoot,
      BRIDGE_SECRET: run.secret,
      CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
    },
  })
  const up = await untilAnswers(run, appUrl)
  if (up !== 'answered') {
    if (up === 'timeout') {
      run.write(
        `The app did not answer on ${appUrl} within ${run.appWaitMs / 1000}s, so the run stopped.\n`,
      )
      run.services.stop()
    }
    const end = await run.services.done
    if (end.reason === 'stopped') return interrupted ? INTERRUPTED : 1
    return reportExit(run, end.name, end.code)
  }

  if (await run.answers(VOICE_HEALTH)) {
    run.write(
      'Voice already answers on 127.0.0.1:8770, so the run reuses the voice server and leaves it running.\n',
    )
  } else {
    run.services.start({
      name: 'voice',
      command: ['bun', 'cli/index.ts', 'voice', 'serve'],
      cwd: run.checkout,
    })
  }
  run.services.start({
    name: 'bridge',
    command: ['bun', 'cli/index.ts', 'bridge', 'run'],
    cwd: run.checkout,
    env: { LICHTRINH_URL: appUrl, BRIDGE_SECRET: run.secret },
  })
  run.write(banner(appUrl))

  const end = await run.services.done
  if (end.reason === 'stopped') return 0
  return reportExit(run, end.name, end.code)
}

async function untilAnswers(
  run: DevRun,
  url: string,
): Promise<'answered' | 'ended' | 'timeout'> {
  let ended = false
  void run.services.done.then(() => {
    ended = true
  })
  const deadline = Date.now() + run.appWaitMs
  while (Date.now() < deadline) {
    if (ended) return 'ended'
    if (await run.answers(url)) return 'answered'
    await new Promise((settle) => setTimeout(settle, run.pollMs))
  }
  return ended ? 'ended' : 'timeout'
}

function reportExit(run: DevRun, name: string, code: number): number {
  run.write(`${name} exited with ${code}, so the run stopped the rest.\n`)
  // A service ending cleanly still leaves the stack incomplete.
  return code === 0 ? 1 : code
}

function banner(appUrl: string): string {
  const signIns = FIXTURE_ACCOUNTS.map(
    ({ username, password }) => `    ${username} / ${password}\n`,
  ).join('')
  return [
    '',
    `The app is up on ${appUrl}`,
    '  Sign in with an invented account:',
    signIns.trimEnd(),
    '  Ctrl-C stops everything. Add --reset for fresh data and a trip around today.',
    '',
    '',
  ].join('\n')
}

async function answersAt(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1_000) })
    return true
  } catch {
    return false
  }
}

async function ollamaModels(): Promise<string[] | undefined> {
  try {
    const reply = await fetch(
      new URL('/api/tags', readOllamaUrl(process.env)),
      {
        signal: AbortSignal.timeout(2_000),
      },
    )
    const body: unknown = await reply.json()
    if (typeof body !== 'object' || body === null || !('models' in body)) {
      return undefined
    }
    const models = Array.isArray(body.models) ? body.models : []
    return models.flatMap((model: unknown) =>
      typeof model === 'object' &&
      model !== null &&
      'name' in model &&
      typeof model.name === 'string'
        ? [model.name]
        : [],
    )
  } catch {
    return undefined
  }
}

function runToEnd(task: OneShot): Promise<number> {
  return new Promise((settle) => {
    const child = spawn(task.command[0] ?? '', task.command.slice(1), {
      cwd: task.cwd,
      env: { ...process.env, ...task.env },
      stdio: 'inherit',
    })
    child.once('error', () => settle(127))
    child.once('exit', (code) => settle(code ?? INTERRUPTED))
  })
}

if (import.meta.main) {
  const checkout = resolve(import.meta.dirname, '..', '..')
  const speechModels = process.env.VOICE_MODELS_DIR
    ? process.env.VOICE_MODELS_DIR.replace(/^~(?=\/|$)/, homedir())
    : join(homedir(), '.local', 'share', 'lichtrinh', 'voice')
  const write = (text: string) => process.stdout.write(text)
  process.exitCode = await runDev({
    checkout,
    appPort: 5173 + (Number(process.env.WORKTREE_PORT_OFFSET) || 0),
    reset: process.argv.includes('--reset'),
    secret: randomBytes(32).toString('hex'),
    write,
    findMissing: () =>
      findMissing(
        {
          onPath: (command) =>
            spawnSync(command, ['--version'], { stdio: 'ignore' }).error ===
            undefined,
          ollamaModels,
          exists: existsSync,
        },
        { checkout, speechModels },
      ),
    removeState: (path) => rm(path, { recursive: true, force: true }),
    runOnce: runToEnd,
    services: superviseServices(write, { graceMs: 10_000 }),
    answers: answersAt,
    onInterrupt: (handler) => {
      process.on('SIGINT', handler)
      process.on('SIGTERM', handler)
    },
    appWaitMs: 90_000,
    pollMs: 500,
  })
}
