import { createUserRequest } from '@shared/users'
import { type Command, Option } from 'commander'

import { createAdmin } from '../admin/create'
import type { CliIo, RunInCheckout } from '../program'

/** Accounts made by hand, since the app has no public sign-up. */
export function registerAdmin(
  program: Command,
  run: RunInCheckout,
  io: CliIo,
): void {
  const admin = program
    .command('admin')
    .description('Make the accounts the app has no screen for yet')

  admin
    .command('create')
    .description('Create an admin account and print its password once')
    .argument('<username>', 'the name the admin signs in with')
    .addOption(
      new Option('--local', 'write to the local database').conflicts('remote'),
    )
    .addOption(new Option('--remote', 'write to the deployed database'))
    .addOption(
      new Option('--language <code>', 'the language the account opens in')
        .choices(['vi', 'en'] as const)
        .default('vi'),
    )
    .action(
      async (
        name: string,
        options: { local?: boolean; remote?: boolean; language: 'vi' | 'en' },
        command: Command,
      ) => {
        const username = createUserRequest.shape.username.safeParse(name)
        if (!username.success) {
          command.error(
            'error: a username takes 2 to 32 lowercase letters, digits, dots, dashes, or underscores',
          )
        }
        if (!options.local && !options.remote) {
          command.error('error: name the database with --local or --remote')
        }
        const database = options.remote ? 'remote' : 'local'
        if (database === 'remote') {
          const confirmed =
            (await io.confirm?.(
              `Create admin ${username.data} on the remote database?`,
            )) ?? false
          if (!confirmed) command.error('error: not confirmed, so nothing ran')
        }
        await createAdmin(
          { username: username.data, language: options.language, database },
          run,
          io,
        )
      },
    )
}
