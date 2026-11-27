import { Command, CommanderError } from 'commander'

import packageJson from '../package.json' with { type: 'json' }
import { registerAdmin } from './commands/admin'
import { registerBridge } from './commands/bridge'
import { registerDb } from './commands/db'
import { registerDev } from './commands/dev'
import { registerPanel } from './commands/panel'
import { registerVoice } from './commands/voice'
import { type PanelMachine, thisMachine } from './panel/machine'

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
  /** The machine the panel installs on, this one where a test hands in none. */
  machine?: PanelMachine
}

/**
 * Hands one command to the task runner in the checkout a verb acts on, and
 * resolves with its exit code so a verb can stop before its next step. A
 * command that may fail leaves the exit the process ends with alone.
 */
export type RunInCheckout = (
  command: readonly string[],
  options?: { mayFail?: boolean },
) => Promise<number>

export function createProgram(
  io: CliIo,
  run: RunInCheckout,
  root: () => string,
  machine: PanelMachine,
): Command {
  // Commander copies these settings onto each subcommand, so they come first.
  const program = new Command('lichtrinh')
    .description("Run the product's services from any folder")
    .version(packageJson.version)
    .exitOverride()
    .configureOutput({
      writeOut: (text) => io.stdout(text),
      writeErr: (text) => io.stderr(text),
    })
  registerDev(program, run, root)
  registerDb(program, run)
  registerAdmin(program, run, io)
  registerVoice(program, run, io)
  registerBridge(program, run)
  registerPanel(program, run, io, root, machine)
  return program
}

/** Runs one command line and returns the exit code the process should end with. */
export async function runCli(
  argv: string[],
  context: ProgramContext,
): Promise<number> {
  let exitCode = 0
  const run: RunInCheckout = async (command, { mayFail = false } = {}) => {
    const checkout = context.findCheckout(context.io.cwd)
    if (checkout.fallback) {
      context.io.stderr(
        `lichtrinh: not inside a lichtrinh checkout, so acting on ${checkout.root}\n`,
      )
    }
    const code = await context.runTask({ command, cwd: checkout.root })
    // The first failure decides the exit, so a later passing task cannot hide it.
    if (exitCode === 0 && !mayFail) exitCode = code
    return code
  }
  const program = createProgram(
    context.io,
    run,
    () => context.findCheckout(context.io.cwd).root,
    context.machine ?? thisMachine(process.env),
  )
  try {
    await program.parseAsync(argv, { from: 'user' })
    return exitCode
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode
    throw error
  }
}
