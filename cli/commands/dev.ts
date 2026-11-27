import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Command } from 'commander'

import { type StalePackage, stalePackages } from '../dev/packages'
import type { RunInCheckout } from '../program'

/**
 * The dev run on invented data, handed off to its package script unchanged,
 * once the checkout's packages match its lockfile. A checkout that fell
 * behind a merge would otherwise fail partway, on whichever import broke.
 */
export function registerDev(
  program: Command,
  run: RunInCheckout,
  root: () => string,
): void {
  program
    .command('dev')
    .description('Run the app, voice, and the bridge here on invented data')
    .option('--phone', "share the run with the owner's phone over the tailnet")
    .option('--reset', 'start from fresh data and a trip around today')
    .action(
      async (
        options: { phone?: boolean; reset?: boolean },
        command: Command,
      ) => {
        const checkout = root()
        const stale = stalePackages((path) => readIn(checkout, path))
        if (stale.length > 0) {
          command.error(
            [
              'error: the dev run needs a bun install first:',
              ...stale.map((entry) => `  ${describe(entry)}`),
              `Run bun install in ${checkout}, then lichtrinh dev again.`,
            ].join('\n'),
          )
        }
        const script = options.phone === true ? 'dev:phone' : 'dev:full'
        const reset = options.reset === true ? ['--reset'] : []
        await run(['bun', 'run', script, ...reset])
      },
    )
}

function describe({ name, installed, locked }: StalePackage): string {
  if (installed === undefined) return `${name} is not installed`
  if (locked === undefined)
    return `${name} is ${installed}, and bun.lock records none`
  return `${name} is ${installed}, and bun.lock wants ${locked}`
}

function readIn(checkout: string, path: string): string | undefined {
  try {
    return readFileSync(join(checkout, path), 'utf8')
  } catch {
    return undefined
  }
}
