import { isCurrency } from '@shared/currency.ts'
import type { Rate, RateList } from '@shared/rates.ts'
import { setRateRequest } from '@shared/rates.ts'
import { eq, inArray } from 'drizzle-orm'
import type { Context } from 'hono'
import { Hono } from 'hono'

import type { AuthEnv } from '../auth/guard.ts'
import { listRates, RATE_PREFIX } from '../calendar/rates.ts'
import { createDb } from '../db/client.ts'
import { settings } from '../db/schema.ts'
import { fail, parseBody } from '../envelope.ts'
import { logOutcome } from '../log.ts'

function keyOf(from: string, to: string) {
  return `${RATE_PREFIX}${from}:${to}`
}

/** The path's pair, or null when either code is unknown or both match. */
function pairOf(c: Context<AuthEnv>) {
  const from = c.req.param('from') ?? ''
  const to = c.req.param('to') ?? ''
  if (!isCurrency(from) || !isCurrency(to) || from === to) return null
  return { from, to }
}

function invalidPair(c: Context) {
  return c.json(fail('validation_failed', 'Name two different currencies'), 400)
}

// Reading is open to anyone signed in, since every trip shows the estimate,
// and writing sits under `/admin`, which the app guards with requireAdmin.
export const rateRoutes = new Hono<AuthEnv>()
  .get('/rates', async (c) => {
    const body: RateList = { rates: await listRates(createDb(c.env.DB)) }
    return c.json(body)
  })
  // Setting a pair clears its reverse, so one rate answers both directions
  // and a stale reverse never disagrees with the one just typed.
  .put('/admin/rates/:from/:to', async (c) => {
    const pair = pairOf(c)
    if (pair === null) return invalidPair(c)
    const { rate } = await parseBody(c, setRateRequest)
    const db = createDb(c.env.DB)
    const change = {
      value: rate,
      updatedAt: new Date(),
      updatedBy: c.var.user.id,
    }
    await db.batch([
      db
        .insert(settings)
        .values({ key: keyOf(pair.from, pair.to), ...change })
        .onConflictDoUpdate({ target: settings.key, set: change }),
      db.delete(settings).where(eq(settings.key, keyOf(pair.to, pair.from))),
    ])
    logOutcome('rate_set', {
      byUserId: c.var.user.id,
      pair: `${pair.from}:${pair.to}`,
    })
    const body: Rate = {
      ...pair,
      rate,
      updatedAt: change.updatedAt.toISOString(),
    }
    return c.json(body)
  })
  .delete('/admin/rates/:from/:to', async (c) => {
    const pair = pairOf(c)
    if (pair === null) return invalidPair(c)
    await createDb(c.env.DB)
      .delete(settings)
      .where(
        inArray(settings.key, [
          keyOf(pair.from, pair.to),
          keyOf(pair.to, pair.from),
        ]),
      )
    logOutcome('rate_cleared', {
      byUserId: c.var.user.id,
      pair: `${pair.from}:${pair.to}`,
    })
    return c.body(null, 204)
  })
