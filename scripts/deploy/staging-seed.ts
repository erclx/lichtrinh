import { join } from 'node:path'

import { z } from 'zod'

import {
  accountRows,
  calendarRows,
  chatRows,
  FIXTURE_ENTRIES,
  FIXTURE_TRIPS,
  fixtureToday,
  historyRows,
  rateRows,
  type SeedDatabase,
  todayFixtures,
} from '../seed'

export interface StagingSeed {
  accountId: string
  token: string
  now: Date
  fetch: (url: string, init: RequestInit) => Promise<Response>
}

/** One statement in the form the D1 query API takes. */
interface Query {
  sql: string
  params: string[]
}

const answer = z.object({
  success: z.literal(true),
  result: z.array(
    z.object({
      success: z.literal(true),
      results: z.array(z.unknown()).optional(),
    }),
  ),
})

/**
 * Fills the staging database with the invented fixtures that are missing,
 * plus a trip around today when none covers it. Accounts go in with no
 * password, since the fixture passwords are public.
 */
export async function seedStaging(seed: StagingSeed): Promise<void> {
  const send = await openStaging(seed)
  const today = fixtureToday(seed.now)
  const [covering] = await send(
    statement(
      `SELECT id FROM trips
       WHERE id LIKE 'staging-%' AND deleted_at IS NULL
         AND starts_on <= ? AND ends_on >= ? LIMIT 1`,
      [today, today],
    ),
  )
  const fresh = covering?.results?.length === 0
  const around = todayFixtures(today, `staging-${today}`)
  await send({
    batch: [
      ...accountRows(recorder, seed.now.getTime(), () => null),
      ...calendarRows(recorder, {
        trips: [...FIXTURE_TRIPS, ...(fresh ? [around.trip] : [])],
        entries: [...FIXTURE_ENTRIES, ...(fresh ? around.entries : [])],
      }),
      ...historyRows(recorder),
      ...chatRows(recorder),
      ...rateRows(recorder),
    ],
  })
}

// Cloudflare publishes a parameter's type as a string alone, which would lose
// a number or a null, so one JSON parameter carries every value, still bound.
function statement(sql: string, values: readonly unknown[]): Query {
  let index = 0
  return {
    sql: sql.replaceAll('?', () => `json_extract(?1, '$[${index++}]')`),
    params: [JSON.stringify(values)],
  }
}

const recorder: SeedDatabase<Query> = {
  prepare: (sql) => ({ bind: (...values) => statement(sql, values) }),
}

/** Takes the database from the committed `staging` environment, nowhere else. */
async function openStaging(seed: StagingSeed) {
  const { unstable_readConfig } = await import('wrangler')
  const config = unstable_readConfig(
    {
      config: join(import.meta.dirname, '../../wrangler.jsonc'),
      env: 'staging',
    },
    { hideWarnings: true },
  )
  const id = config.d1_databases[0]?.database_id
  if (id === undefined) {
    throw new Error('wrangler.jsonc names no staging database')
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${seed.accountId}/d1/database/${id}/query`

  return async (body: Query | { batch: Query[] }) => {
    const response = await seed.fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${seed.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const parsed = answer.safeParse(await response.json().catch(() => null))
    // Never the API's own message, which can repeat a statement.
    if (!response.ok || !parsed.success) {
      throw new Error(`The staging database answered ${response.status}`)
    }
    return parsed.data.result
  }
}
