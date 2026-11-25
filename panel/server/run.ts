import { execFile } from 'node:child_process'

export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

/** Runs one command to its end. A command that cannot start answers 127. */
export type Run = (
  command: readonly string[],
  options?: { timeoutMs?: number },
) => Promise<CommandResult>

/** An action that ran and failed, named without the tool's own output. */
export class ActionFailed extends Error {}

const READ_TIMEOUT_MS = 5_000
// The shell convention for a command that could not be found or started.
const NOT_STARTED = 127
// Log lines need far less, and a runaway line cannot fill memory.
const MAX_OUTPUT_BYTES = 4_000_000

export const runCommand: Run = (command, options = {}) =>
  new Promise((resolve) => {
    const [file, ...args] = command
    if (file === undefined) {
      resolve({ code: NOT_STARTED, stdout: '', stderr: '' })
      return
    }
    execFile(
      file,
      args,
      {
        timeout: options.timeoutMs ?? READ_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
      },
      (error, stdout, stderr) => {
        const failed = typeof error?.code === 'number' ? error.code : undefined
        resolve({
          code: error === null ? 0 : (failed ?? NOT_STARTED),
          stdout,
          stderr,
        })
      },
    )
  })
