import { spawn } from 'node:child_process'
import { constants } from 'node:os'

import type { Task } from './program'

// The shell convention for a command that could not be found or started.
const NOT_STARTED = 127

/**
 * Runs one task with inherited output, printing `› <command>` first, and
 * resolves with its exit code, or 128 plus the signal number when a signal
 * ended it. Ctrl-C and SIGTERM reach the child, and this process waits for it
 * rather than dying first.
 */
export function runTask(
  task: Task,
  stderr: (text: string) => void,
): Promise<number> {
  stderr(`› ${task.command.join(' ')}\n`)
  const [file, ...args] = task.command
  if (file === undefined) return Promise.resolve(NOT_STARTED)

  return new Promise((resolve) => {
    const child = spawn(file, args, { cwd: task.cwd, stdio: 'inherit' })
    const forward = (signal: NodeJS.Signals) => child.kill(signal)
    process.on('SIGINT', forward)
    process.on('SIGTERM', forward)
    const settle = (code: number) => {
      process.off('SIGINT', forward)
      process.off('SIGTERM', forward)
      resolve(code)
    }

    child.once('error', (error) => {
      stderr(`lichtrinh: could not start ${file}: ${error.message}\n`)
      settle(NOT_STARTED)
    })
    child.once('exit', (code, signal) => {
      settle(code ?? 128 + (signal ? constants.signals[signal] : 0))
    })
  })
}
