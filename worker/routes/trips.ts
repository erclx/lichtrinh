import { deleteRequest } from '@shared/changes.ts'
import type { TripList } from '@shared/trips.ts'
import { createTripRequest, updateTripRequest } from '@shared/trips.ts'
import type { Context } from 'hono'
import { Hono } from 'hono'

import type { AuthEnv } from '../auth/guard.ts'
import type { Actor } from '../calendar/record.ts'
import { isRefused } from '../calendar/record.ts'
import {
  createTrip,
  deleteTrip,
  listTrips,
  updateTrip,
} from '../calendar/trips.ts'
import { createDb } from '../db/client.ts'
import { parseBody, refuse } from '../envelope.ts'

/** A write through the app is the signed-in person's own. */
export function personOf(c: Context<AuthEnv>): Actor {
  return { userId: c.var.user.id, source: 'person' }
}

export const tripRoutes = new Hono<AuthEnv>()
  .get('/trips', async (c) => {
    const body: TripList = { trips: await listTrips(createDb(c.env.DB)) }
    return c.json(body)
  })
  .post('/trips', async (c) => {
    const request = await parseBody(c, createTripRequest)
    const db = createDb(c.env.DB)
    const outcome = await createTrip(db, personOf(c), request, new Date())
    if (isRefused(outcome)) return refuse(c, outcome.refused)
    return c.json(outcome, 201)
  })
  .patch('/trips/:id', async (c) => {
    const request = await parseBody(c, updateTripRequest)
    const db = createDb(c.env.DB)
    const outcome = await updateTrip(
      db,
      personOf(c),
      c.req.param('id'),
      request,
      new Date(),
    )
    if (isRefused(outcome)) return refuse(c, outcome.refused)
    return c.json(outcome)
  })
  .delete('/trips/:id', async (c) => {
    const request = await parseBody(c, deleteRequest)
    const db = createDb(c.env.DB)
    const outcome = await deleteTrip(
      db,
      personOf(c),
      c.req.param('id'),
      request,
      new Date(),
    )
    if (isRefused(outcome)) return refuse(c, outcome.refused)
    return c.json(outcome)
  })
