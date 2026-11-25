import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { seedStaging, type StagingSeed } from './staging-seed'

const MIGRATIONS = join(import.meta.dirname, '../../worker/db/migrations')

const query = z.strictObject({
  sql: z.string(),
  // The type Cloudflare publishes for a parameter.
  params: z.array(z.string()),
})
const request = z.union([query, z.strictObject({ batch: z.array(query) })])

/** The D1 query API over a real SQLite database holding every migration. */
function fakeD1() {
  const db = new DatabaseSync(':memory:')
  for (const file of readdirSync(MIGRATIONS).sort()) {
    if (file.endsWith('.sql')) {
      db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'))
    }
  }
  const urls: string[] = []
  const fetchD1: StagingSeed['fetch'] = async (url, init) => {
    urls.push(url)
    const body = request.parse(JSON.parse(String(init.body)))
    const result = ('batch' in body ? body.batch : [body]).map(
      ({ sql, params }) => ({
        success: true,
        results: db.prepare(sql).all(...params),
      }),
    )
    return Response.json({ success: true, errors: [], result })
  }
  const count = (table: string) =>
    Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n)
  return { db, urls, fetchD1, count }
}

function seed(fetchD1: StagingSeed['fetch'], now = '2026-11-24T05:00:00Z') {
  return seedStaging({
    accountId: 'invented-account',
    token: 'invented-token',
    now: new Date(now),
    fetch: fetchD1,
  })
}

const TABLES = ['users', 'trips', 'entries', 'changes', 'chats', 'settings']

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('seedStaging', () => {
  it('writes every account with no password hash', async () => {
    const { db, fetchD1 } = fakeD1()

    await seed(fetchD1)

    expect(
      db.prepare('SELECT username, password_hash FROM users').all(),
    ).toEqual([
      { username: 'admin', password_hash: null },
      { username: 'traveler', password_hash: null },
    ])
  })

  it('keeps numbers as numbers and a missing cost as null', async () => {
    const { db, fetchD1 } = fakeD1()

    await seed(fetchD1)

    expect(
      db
        .prepare(
          `SELECT title, typeof(cost_minor) AS cost FROM entries
           WHERE id IN ('fixture-entry-lunch', 'fixture-entry-rest')`,
        )
        .all(),
    ).toEqual([
      { title: 'Lunch with the family', cost: 'integer' },
      { title: 'Rest at the hotel', cost: 'null' },
    ])
  })

  it('adds nothing the second time on one day', async () => {
    const { fetchD1, count } = fakeD1()
    await seed(fetchD1)
    const before = TABLES.map(count)

    await seed(fetchD1)

    expect(TABLES.map(count)).toEqual(before)
  })

  it('keeps a password the admin reset', async () => {
    const { db, fetchD1 } = fakeD1()
    await seed(fetchD1)
    db.exec("UPDATE users SET password_hash = 'reset' WHERE username = 'admin'")

    await seed(fetchD1)

    expect(
      db
        .prepare("SELECT password_hash FROM users WHERE username = 'admin'")
        .get(),
    ).toEqual({ password_hash: 'reset' })
  })

  it('keeps the trip around today while it still covers the day', async () => {
    const { fetchD1, count } = fakeD1()
    await seed(fetchD1, '2026-11-24T05:00:00Z')
    const before = count('trips')

    await seed(fetchD1, '2026-11-26T05:00:00Z')

    expect(count('trips')).toBe(before)
  })

  it('adds a fresh trip beside one that has ended', async () => {
    const { db, fetchD1 } = fakeD1()
    await seed(fetchD1, '2026-11-24T05:00:00Z')

    await seed(fetchD1, '2026-12-10T05:00:00Z')

    expect(
      db
        .prepare(
          `SELECT starts_on, ends_on FROM trips
           WHERE id LIKE 'staging-%' ORDER BY starts_on`,
        )
        .all(),
    ).toEqual([
      { starts_on: '2026-11-22', ends_on: '2026-11-28' },
      { starts_on: '2026-12-08', ends_on: '2026-12-14' },
    ])
  })

  it('takes the date where the trip is, not where the runner is', async () => {
    const { db, fetchD1 } = fakeD1()

    await seed(fetchD1, '2026-11-24T20:00:00Z')

    expect(
      db.prepare("SELECT starts_on FROM trips WHERE id LIKE 'staging-%'").get(),
    ).toEqual({ starts_on: '2026-11-23' })
  })

  it.each(['', 'production'])(
    'reaches the staging database alone with CLOUDFLARE_ENV "%s"',
    async (environment) => {
      vi.stubEnv('CLOUDFLARE_ENV', environment)
      const config = readFileSync(
        join(import.meta.dirname, '../../wrangler.jsonc'),
        'utf8',
      )
      const staging = config.slice(config.indexOf('"staging": {'))
      const id = /"database_id": "([^"]+)"/.exec(staging)?.[1]
      const { urls, fetchD1 } = fakeD1()

      await seed(fetchD1)

      expect(id).toBeDefined()
      expect([...new Set(urls)]).toEqual([
        `https://api.cloudflare.com/client/v4/accounts/invented-account/d1/database/${id}/query`,
      ])
    },
  )

  it.each([
    [
      'a refused request',
      () =>
        Response.json(
          { success: false, errors: [{ code: 7500, message: 'invented SQL' }] },
          { status: 400 },
        ),
    ],
    [
      'a refused statement',
      () =>
        Response.json({
          success: true,
          errors: [],
          result: [{ success: false, results: [] }],
        }),
    ],
    ['a body that is not JSON', () => new Response('<html>')],
  ])('fails on %s, naming the status alone', async (_case, answer) => {
    await expect(seed(async () => answer())).rejects.toThrow(
      /^The staging database answered \d{3}$/,
    )
  })
})
