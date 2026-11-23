import { Command, CommanderError } from 'commander'

import packageJson from '../package.json' with { type: 'json' }
import { registerAdmin } from './commands/admin'
import { registerDb } from './commands/db'
import { registerVoice } from './commands/voice'

export interface CliIo {
  stdout: (text: string) => void
  stderr: (text: string) => void
  cwd: string
  /**
   * Asks the owner a yes or no question. A verb treats a missing one as a
   * no, so nothing that needs a confirm runs without a person to give it.
   */
  confirm?: (question: string) => Promise<boolean>
}

/** One command line a verb hands off, run inside a checkout. */
export interface Task {
  command: readonly string[]
  cwd: string
}

/** The checkout a verb acts on, and whether it fell back to the command's own. */
export interface Checkout {
  root: string
  fallback: boolean
}

export interface ProgramContext {
  io: CliIo
  /** Runs one task to its end and returns its exit code. */
  runTask: (task: Task) => Promise<number>
  findCheckout: (cwd: string) => Checkout
}

/**
 * Hands one command to the task runner in the checkout a verb acts on, and
 * resolves with its exit code so a verb can stop before its next step.
 */
export type RunInCheckout = (command: readonly string[]) => Promise<number>

export function createProgram(io: CliIo, run: RunInCheckout): Command {
  // Commander copies these settings onto each subcommand, so they come first.
  const program = new Command('lichtrinh')
    .description("Run the product's services from any folder")
    .version(packageJson.version)
    .exitOverride()
    .configureOutput({
      writeOut: (text) => io.stdout(text),
      writeErr: (text) => io.stderr(text),
    })
  registerDb(program, run)
  registerAdmin(program, run, io)
  registerVoice(program, run, io)
  return program
}

/** Runs one command line and returns the exit code the process should end with. */
export async function runCli(
  argv: string[],
  context: ProgramContext,
): Promise<number> {
  let exitCode = 0
  const run: RunInCheckout = async (command) => {
    const checkout = context.findCheckout(context.io.cwd)
    if (checkout.fallback) {
      context.io.stderr(
        `lichtrinh: not inside a lichtrinh checkout, so acting on ${checkout.root}\n`,
      )
    }
    const code = await context.runTask({ command, cwd: checkout.root })
    // The first failure decides the exit, so a later passing task cannot hide it.
    if (exitCode === 0) exitCode = code
    return code
  }
  const program = createProgram(context.io, run)
  try {
    await program.parseAsync(argv, { from: 'user' })
    return exitCode
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode
    throw error
  }
}
