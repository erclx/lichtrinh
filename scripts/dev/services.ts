import { type ChildProcess, spawn } from 'node:child_process'
import { constants } from 'node:os'
import { createInterface } from 'node:readline'

export interface Service {
  name: string
  command: readonly string[]
  cwd: string
  /** Set over the inherited environment. */
  env?: Record<string, string>
}

/** Why the group ended: a stop someone asked for, or one service exiting first. */
export type GroupEnd =
  | { reason: 'stopped' }
  | { reason: 'exited'; name: string; code: number }

export interface ServiceGroup {
  start: (service: Service) => void
  /** Ends every service. Safe to call more than once. */
  stop: () => void
  /** Settles once every service and everything it started has ended. */
  done: Promise<GroupEnd>
}

// The shell convention for a command that could not be found or started.
const NOT_STARTED = 127
const SETTLE_POLL_MS = 50

/**
 * Runs services side by side, each in its own process group, so a stop
 * reaches the grandchildren a package script starts. The first service to
 * exit on its own ends the rest, since a stack missing one part misleads.
 */
export function superviseServices(
  write: (text: string) => void,
  { graceMs }: { graceMs: number },
): ServiceGroup {
  const started: ChildProcess[] = []
  const open = new Set<ChildProcess>()
  let ended: GroupEnd | undefined
  let settle: (end: GroupEnd) => void = () => {}
  const done = new Promise<GroupEnd>((resolve) => {
    settle = resolve
  })

  /** Settles once each group reads as gone, since workerd holds pipes of its own. */
  const settleOnceGone = (end: GroupEnd) => {
    const deadline = Date.now() + graceMs
    let killed = false
    const check = () => {
      const alive = started.filter(groupAnswers)
      if (open.size === 0 && alive.length === 0) {
        settle(end)
        return
      }
      if (!killed && Date.now() >= deadline) {
        killed = true
        for (const child of alive) signalGroup(child, 'SIGKILL')
      }
      setTimeout(check, SETTLE_POLL_MS)
    }
    check()
  }

  const endWith = (end: GroupEnd) => {
    if (ended !== undefined) return
    ended = end
    for (const child of started) signalGroup(child, 'SIGTERM')
    settleOnceGone(end)
  }

  const start = (service: Service) => {
    const [file, ...args] = service.command
    if (ended !== undefined || file === undefined) return
    const child = spawn(file, args, {
      cwd: service.cwd,
      env: { ...process.env, ...service.env },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    started.push(child)
    open.add(child)
    for (const stream of [child.stdout, child.stderr]) {
      const lines = createInterface({ input: stream })
      lines.on('line', (line) => write(`[${service.name}] ${line}\n`))
    }
    child.once('error', (error) => {
      write(`[${service.name}] could not start ${file}: ${error.message}\n`)
      open.delete(child)
      endWith({ reason: 'exited', name: service.name, code: NOT_STARTED })
    })
    child.once('exit', (code, signal) => {
      // The group may outlive its leader, so a stop still reaches the rest.
      signalGroup(child, 'SIGTERM')
      endWith({
        reason: 'exited',
        name: service.name,
        code: code ?? 128 + (signal ? constants.signals[signal] : 0),
      })
    })
    // Waits on the output too, so a last line is never cut off.
    child.once('close', () => open.delete(child))
  }

  return {
    start,
    stop: () => endWith({ reason: 'stopped' }),
    done,
  }
}

function groupAnswers(child: ChildProcess): boolean {
  if (child.pid === undefined) return false
  try {
    process.kill(-child.pid, 0)
    return true
  } catch {
    return false
  }
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals) {
  if (child.pid === undefined) return
  try {
    process.kill(-child.pid, signal)
  } catch {
    // The group is already gone.
  }
}
