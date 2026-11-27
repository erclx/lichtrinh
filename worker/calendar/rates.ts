import type { Rate } from '@shared/rates.ts'
import { asc, like } from 'drizzle-orm'

import { settings } from '../db/schema.ts'
import type { Db } from './record.ts'

// Rates share the `settings` table with the contact name, each under its own
// key, so the contact read, which filters on its one key, never sees them.
export const RATE_PREFIX = 'rate:'

/** Every stored rate, ordered by pair, as the admin typed each one. */
export async function listRates(db: Db): Promise<Rate[]> {
  const rows = await db
    .select()
    .from(settings)
    .where(like(settings.key, `${RATE_PREFIX}%`))
    .orderBy(asc(settings.key))
  return rows.map((row) => {
    const [from = '', to = ''] = row.key.slice(RATE_PREFIX.length).split(':')
    return { from, to, rate: row.value, updatedAt: row.updatedAt.toISOString() }
  })
}
