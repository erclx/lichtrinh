import type { Command } from 'commander'

import type { RunInCheckout } from '../program'

/** The local D1 database. Remote migrations run in CI, never from here. */
export function registerDb(program: Command, run: RunInCheckout): void {
  const db = program
    .command('db')
    .description('Inspect and migrate the local database')

  db.command('status')
    .description('List the local migrations not yet applied')
    .action(() =>
      run(['bunx', 'wrangler', 'd1', 'migrations', 'list', 'DB', '--local']),
    )

  db.command('migrate')
    .description('Apply pending migrations to the local database')
    .action(() => run(['bun', 'run', 'db:migrate']))
}
