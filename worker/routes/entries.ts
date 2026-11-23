import { deleteRequest } from '@shared/changes.ts'
import type { EntryList, EntryRead } from '@shared/entries.ts'
import {
  createEntryRequest,
  entryRange,
  updateEntryRequest,
} from '@shared/entries.ts'
import { Hono } from 'hono'

import type { AuthEnv } from '../auth/guard.ts'
import {
  createEntry,
  deleteEntry,
  getEntry,
  listEntries,
  updateEntry,
} from '../calendar/entries.ts'
import { isRefused } from '../calendar/record.ts'
import { createDb } from '../db/client.ts'
import { parseBody, parseQuery, refuse } from '../envelope.ts'
import { personOf } from './trips.ts'

export const entryRoutes = new Hono<AuthEnv>()
  .get('/entries', async (c) => {
    const range = parseQuery(c, entryRange)
    const body: EntryList = {
      entries: await listEntries(createDb(c.env.DB), range),
    }
    return c.json(body)
  })
  .post('/entries', async (c) => {
    const request = await parseBody(c, createEntryRequest)
    const db = createDb(c.env.DB)
    const outcome = await createEntry(db, personOf(c), request, new Date())
    if (isRefused(outcome)) return refuse(c, outcome.refused)
    return c.json(outcome, 201)
  })
  .get('/entries/:id', async (c) => {
    const entry = await getEntry(createDb(c.env.DB), c.req.param('id'))
    if (entry === undefined) return refuse(c, 'not_found')
    const body: EntryRead = { entry }
    return c.json(body)
  })
  .patch('/entries/:id', async (c) => {
    const request = await parseBody(c, updateEntryRequest)
    const db = createDb(c.env.DB)
    const outcome = await updateEntry(
      db,
      personOf(c),
      c.req.param('id'),
      request,
      new Date(),
    )
    if (isRefused(outcome)) return refuse(c, outcome.refused)
    return c.json(outcome)
  })
  .delete('/entries/:id', async (c) => {
    const request = await parseBody(c, deleteRequest)
    const db = createDb(c.env.DB)
    const outcome = await deleteEntry(
      db,
      personOf(c),
      c.req.param('id'),
      request,
      new Date(),
    )
    if (isRefused(outcome)) return refuse(c, outcome.refused)
    return c.json(outcome)
  })
