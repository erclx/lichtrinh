import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

// Tables the platform or the migration runner own, which a rollback leaves.
const SYSTEM_TABLE = /^(sqlite_|_cf_|d1_migrations$)/

async function appTables() {
  const { results } = await env.DB.prepare(
    "select name from sqlite_master where type = 'table'",
  ).all<{ name: string }>()
  return results.map((row) => row.name).filter((n) => !SYSTEM_TABLE.test(n))
}

async function appliedMigrations() {
  const { results } = await env.DB.prepare(
    'select name from d1_migrations',
  ).all<{ name: string }>()
  return results.map((row) => row.name)
}

async function columnsOf(table: string) {
  const { results } = await env.DB.prepare(
    'select name from pragma_table_info(?)',
  )
    .bind(table)
    .all<{ name: string }>()
  return results.map((row) => row.name)
}

async function rollBack(name: string) {
  const rollback = env.TEST_ROLLBACKS.find((r) => r.name === name)
  if (rollback === undefined) throw new Error(`No rollback named ${name}`)
  await env.DB.batch(rollback.queries.map((q) => env.DB.prepare(q)))
}

async function rollBackEverything() {
  const newestFirst = [...env.TEST_ROLLBACKS].reverse()
  for (const rollback of newestFirst) {
    await rollBack(rollback.name)
  }
}

// Storage persists across the cases in one file, so a case that rolled back
// would leave the next one unmigrated without this.
beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

describe('migrations', () => {
  it('start each spec file with the users table empty', async () => {
    const row = await env.DB.prepare('select count(*) as n from users').first<{
      n: number
    }>()

    expect(row?.n).toBe(0)
  })

  it('pair every migration with a rollback of the same name', () => {
    const migrations = env.TEST_MIGRATIONS.map((m) => m.name)
    const rollbacks = env.TEST_ROLLBACKS.map((r) => r.name)

    expect(rollbacks).toEqual(migrations)
  })
})

describe('rolling back the accounts migration', () => {
  it('leaves the users table alone', async () => {
    await rollBack('0001_accounts.sql')

    expect(await appTables()).toEqual(['users'])
  })

  it('drops the sign-in, chat, and language columns from users', async () => {
    await rollBack('0001_accounts.sql')

    expect(await columnsOf('users')).toEqual([
      'id',
      'username',
      'display_name',
      'role',
      'created_at',
    ])
  })

  it('removes its own d1_migrations row alone', async () => {
    await rollBack('0001_accounts.sql')

    expect(await appliedMigrations()).toEqual(['0000_init.sql'])
  })
})

describe('rolling back every migration', () => {
  it('leaves no app table', async () => {
    await rollBackEverything()

    expect(await appTables()).toEqual([])
  })

  it('leaves d1_migrations empty', async () => {
    await rollBackEverything()

    expect(await appliedMigrations()).toEqual([])
  })
})
