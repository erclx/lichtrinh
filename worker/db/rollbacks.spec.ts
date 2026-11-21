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

async function rollBackEverything() {
  const newestFirst = [...env.TEST_ROLLBACKS].reverse()
  for (const rollback of newestFirst) {
    await env.DB.batch(rollback.queries.map((q) => env.DB.prepare(q)))
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
