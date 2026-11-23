import { changePageQuery, undoRequest } from '@shared/changes.ts'
import { Hono } from 'hono'

import type { AuthEnv } from '../auth/guard.ts'
import { listChanges, undoChange } from '../calendar/changes.ts'
import { isRefused } from '../calendar/record.ts'
import { createDb } from '../db/client.ts'
import { parseBody, parseQuery, refuse } from '../envelope.ts'
import { personOf } from './trips.ts'

export const changeRoutes = new Hono<AuthEnv>()
  .get('/trips/:id/changes', async (c) => {
    const query = parseQuery(c, changePageQuery)
    const page = await listChanges(createDb(c.env.DB), c.req.param('id'), query)
    if (isRefused(page)) return refuse(c, page.refused)
    return c.json(page)
  })
  // A retry with the same undo id answers the stored undo with the same
  // status, so a caller never has to tell a replay from the first answer.
  .post('/changes/:id/undo', async (c) => {
    const request = await parseBody(c, undoRequest)
    const outcome = await undoChange(
      createDb(c.env.DB),
      personOf(c),
      c.req.param('id'),
      request,
      new Date(),
    )
    if (isRefused(outcome)) return refuse(c, outcome.refused)
    return c.json(outcome, 201)
  })
