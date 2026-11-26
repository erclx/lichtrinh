import type { OwnerSummary } from '@shared/owner.ts'
import { OWNER_MESSAGE_LIMIT, ownerSummaryQuery } from '@shared/owner.ts'
import { Hono } from 'hono'

import { latestMessages, turnsSince } from '../assistant/chats.ts'
import { readAssistantStatus } from '../assistant/status.ts'
import type { AuthEnv } from '../auth/guard.ts'
import { carriesSecret } from '../auth/secret.ts'
import { createDb } from '../db/client.ts'
import { fail, parseQuery } from '../envelope.ts'
import { logOutcome } from '../log.ts'

const DAY_MS = 24 * 60 * 60 * 1000

export const ownerRoutes = new Hono<AuthEnv>()
  // The owner panel holds its own secret and no session, so the guard lets
  // this path through signed out. A session cookie alone reads nothing, and
  // the secret is read off the header alone, never the query string.
  .get('/owner/summary', async (c) => {
    const started = Date.now()
    c.header('cache-control', 'no-store')
    if (
      !(await carriesSecret(c.req.header('authorization'), c.env.PANEL_SECRET))
    ) {
      return c.json(fail('unauthenticated', 'Wrong panel secret'), 401)
    }
    const query = parseQuery(c, ownerSummaryQuery)
    const since =
      query.since === undefined
        ? new Date(started - DAY_MS)
        : new Date(query.since)
    const db = createDb(c.env.DB)
    const [assistant, turns, messages] = await Promise.all([
      readAssistantStatus(c.env, db),
      turnsSince(db, since),
      latestMessages(db, OWNER_MESSAGE_LIMIT),
    ])
    logOutcome('owner_summary_read', {
      messages: messages.length,
      ms: Date.now() - started,
    })
    const body: OwnerSummary = { assistant, turns, messages }
    return c.json(body)
  })
