import { eq, inArray, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'

import { signInAttempts } from '../db/schema.ts'

const WINDOW_MS = 15 * 60 * 1000

// The address limit is loose because the family shares a home connection.
export const USERNAME_LIMIT = 10
export const ADDRESS_LIMIT = 50

type Db = DrizzleD1Database

export interface AttemptKey {
  key: string
  limit: number
}

export function usernameKey(username: string): AttemptKey {
  return { key: `user:${username}`, limit: USERNAME_LIMIT }
}

export function addressKey(address: string): AttemptKey {
  return { key: `addr:${address}`, limit: ADDRESS_LIMIT }
}

/** Seconds until the most blocked key frees up, or 0 when none is blocked. */
export async function blockedForSeconds(
  db: Db,
  keys: AttemptKey[],
  now: number,
): Promise<number> {
  const rows = await db
    .select()
    .from(signInAttempts)
    .where(
      inArray(
        signInAttempts.key,
        keys.map((k) => k.key),
      ),
    )
  let seconds = 0
  for (const row of rows) {
    const limit = keys.find((k) => k.key === row.key)?.limit ?? 0
    const endsAt = row.windowStartedAt.getTime() + WINDOW_MS
    if (endsAt > now && row.failures >= limit) {
      seconds = Math.max(seconds, Math.ceil((endsAt - now) / 1000))
    }
  }
  return seconds
}

/**
 * Counts one failure against each key, opening a fresh window for a key
 * whose window has passed. Each key is one upsert, so concurrent failures
 * each add one rather than racing a read.
 */
export async function recordFailure(db: Db, keys: AttemptKey[], now: number) {
  const windowOpenedBefore = now - WINDOW_MS
  const expired = sql`${signInAttempts.windowStartedAt} <= ${windowOpenedBefore}`
  const [first, ...rest] = keys.map((k) =>
    db
      .insert(signInAttempts)
      .values({ key: k.key, failures: 1, windowStartedAt: new Date(now) })
      .onConflictDoUpdate({
        target: signInAttempts.key,
        set: {
          failures: sql`case when ${expired} then 1 else ${signInAttempts.failures} + 1 end`,
          windowStartedAt: sql`case when ${expired} then ${now} else ${signInAttempts.windowStartedAt} end`,
        },
      }),
  )
  if (first === undefined) return
  await db.batch([first, ...rest])
}

export async function clearFailures(db: Db, key: AttemptKey) {
  await db.delete(signInAttempts).where(eq(signInAttempts.key, key.key))
}
