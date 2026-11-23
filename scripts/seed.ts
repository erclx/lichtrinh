// Migrates a local database and writes the invented fixture accounts that
// e2e, captures, and review drives sign in with. Run it as
// `bun scripts/seed.ts`, with LICHTRINH_STATE_ROOT naming the folder whose
// `.wrangler/state` holds the database, the checkout itself by default.
// Every account here is invented, and its password is public by design.

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

import type { Language, Role } from '@shared/auth.ts'
import { hashPassword } from '@shared/password-hash.ts'

export interface FixtureAccount {
  id: string
  username: string
  displayName: string
  role: Role
  canChat: boolean
  language: Language
  password: string
}

export const FIXTURE_ACCOUNTS: readonly FixtureAccount[] = [
  {
    id: 'fixture-admin',
    username: 'admin',
    displayName: 'Admin',
    role: 'admin',
    canChat: false,
    language: 'en',
    password: 'seed-admin-pass',
  },
  {
    id: 'fixture-lan',
    username: 'lan',
    displayName: 'Lan',
    role: 'member',
    canChat: true,
    language: 'vi',
    password: 'seed-family-pass',
  },
]

/** Where the Vite plugin, wrangler, and this script keep local state. */
export function statePath(root: string): string {
  return join(resolve(root), '.wrangler', 'state')
}

function migrate(state: string) {
  // CI set, so wrangler applies without asking for a confirmation.
  const { status } = spawnSync(
    'bunx',
    [
      'wrangler',
      'd1',
      'migrations',
      'apply',
      'DB',
      '--local',
      '--persist-to',
      state,
    ],
    { stdio: 'inherit', env: { ...process.env, CI: '1' } },
  )
  if (status !== 0) throw new Error(`Migrations exited with ${status}`)
}

/** The part of the D1 binding the seed calls. */
interface SeedDatabase {
  prepare(query: string): { bind(...values: unknown[]): unknown }
  batch(statements: unknown[]): Promise<unknown>
}

async function insertAccounts(state: string) {
  // Loaded here, so the e2e specs reading the fixtures never load wrangler.
  const { getPlatformProxy } = await import('wrangler')
  const proxy = await getPlatformProxy<{ DB: SeedDatabase }>({
    persist: { path: join(state, 'v3') },
    remoteBindings: false,
  })
  try {
    // Bound values, and no write to an account already there, so a second
    // run leaves the first run's rows and any password a drive changed.
    const insert = proxy.env.DB.prepare(
      `INSERT INTO users
         (id, username, display_name, role, created_at, password_hash, can_chat, language)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (username) DO NOTHING`,
    )
    const rows = await Promise.all(
      FIXTURE_ACCOUNTS.map(async (account) =>
        insert.bind(
          account.id,
          account.username,
          account.displayName,
          account.role,
          Date.now(),
          await hashPassword(account.password),
          account.canChat ? 1 : 0,
          account.language,
        ),
      ),
    )
    await proxy.env.DB.batch(rows)
  } finally {
    await proxy.dispose()
  }
}

if (import.meta.main) {
  const state = statePath(process.env.LICHTRINH_STATE_ROOT ?? '.')
  migrate(state)
  await insertAccounts(state)
  console.log(
    `Seeded ${FIXTURE_ACCOUNTS.map(({ username }) => username).join(', ')}`,
  )
}
