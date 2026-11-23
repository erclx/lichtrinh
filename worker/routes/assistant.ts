import type { AssistantStatus } from '@shared/assistant.ts'
import { Hono } from 'hono'

import { lastAnsweredAt } from '../assistant/chats.ts'
import { readModel } from '../assistant/model.ts'
import { relayOf } from '../assistant/relay.ts'
import type { AuthEnv } from '../auth/guard.ts'
import { requireChat } from '../auth/guard.ts'
import { createDb } from '../db/client.ts'
import { fail, refuse } from '../envelope.ts'

export const assistantRoutes = new Hono<AuthEnv>()
  .get('/assistant/status', async (c) => {
    const db = createDb(c.env.DB)
    const [online, answeredAt, model] = await Promise.all([
      relayOf(c.env).online(),
      lastAnsweredAt(db),
      readModel(db),
    ])
    const body: AssistantStatus = {
      online,
      lastAnsweredAt: answeredAt?.toISOString() ?? null,
      model,
    }
    return c.json(body)
  })
  .post('/assistant/warm', requireChat, async (c) => {
    const model = await readModel(createDb(c.env.DB))
    if (!(await relayOf(c.env).warm(model))) {
      return refuse(c, 'assistant_unavailable')
    }
    return c.body(null, 202)
  })
  // The bridge holds the secret and no session, so the guard lets this path
  // through signed out and the secret is checked here instead.
  .get('/bridge/connect', async (c) => {
    if (
      !(await carriesBridgeSecret(
        c.req.header('authorization'),
        c.env.BRIDGE_SECRET,
      ))
    ) {
      return c.json(fail('unauthenticated', 'Wrong bridge secret'), 401)
    }
    if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
      return c.json(fail('validation_failed', 'Expected a socket upgrade'), 426)
    }
    return relayOf(c.env).fetch('https://relay/connect', {
      headers: { upgrade: 'websocket' },
    })
  })

const encoder = new TextEncoder()

/**
 * Whether an `Authorization` header carries the bridge secret as a bearer
 * token. Both sides are hashed first, so the constant-time compare always
 * sees equal lengths. An unset secret matches nothing.
 */
async function carriesBridgeSecret(
  header: string | undefined,
  secret: string | undefined,
): Promise<boolean> {
  if (secret === undefined || secret === '') return false
  const token = /^Bearer (.+)$/.exec(header ?? '')?.[1]
  if (token === undefined) return false
  const [given, expected] = await Promise.all([digest(token), digest(secret)])
  return crypto.subtle.timingSafeEqual(given, expected)
}

function digest(text: string) {
  return crypto.subtle.digest('SHA-256', encoder.encode(text))
}
