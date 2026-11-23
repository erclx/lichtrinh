import type { AssistantSettings, AssistantStatus } from '@shared/assistant.ts'
import { assistantSettings } from '@shared/assistant.ts'
import { Hono } from 'hono'

import { lastAnsweredAt } from '../assistant/chats.ts'
import { ASSISTANT_MODEL_KEY, readModel } from '../assistant/model.ts'
import { relayOf } from '../assistant/relay.ts'
import type { AuthEnv } from '../auth/guard.ts'
import { requireChat } from '../auth/guard.ts'
import { createDb } from '../db/client.ts'
import { settings } from '../db/schema.ts'
import { fail, parseBody, refuse } from '../envelope.ts'
import { logOutcome } from '../log.ts'
import { readVoiceModel } from '../voice/model.ts'

export const assistantRoutes = new Hono<AuthEnv>()
  .get('/assistant/status', async (c) => {
    const db = createDb(c.env.DB)
    const relay = relayOf(c.env)
    const [online, answeredAt, model, voiceOnline, voiceModel] =
      await Promise.all([
        relay.online(),
        lastAnsweredAt(db),
        readModel(db),
        relay.voiceOnline(),
        readVoiceModel(db),
      ])
    const body: AssistantStatus = {
      online,
      lastAnsweredAt: answeredAt?.toISOString() ?? null,
      model,
      voice: { online: voiceOnline, model: voiceModel },
    }
    return c.json(body)
  })
  // Warms the speech model beside the assistant's, since a press of the
  // talk button comes before the send. Voice being off refuses nothing here.
  .post('/assistant/warm', requireChat, async (c) => {
    const db = createDb(c.env.DB)
    const relay = relayOf(c.env)
    const [model, voiceModel] = await Promise.all([
      readModel(db),
      readVoiceModel(db),
    ])
    if (!(await relay.warm(model))) {
      return refuse(c, 'assistant_unavailable')
    }
    await relay.warmVoice(voiceModel)
    return c.body(null, 202)
  })
  // The contact route owns its own key in the same table, so each upsert
  // leaves the other's row alone. A running turn keeps the model it read.
  .put('/admin/assistant', async (c) => {
    const { model } = await parseBody(c, assistantSettings)
    const change = {
      value: model,
      updatedAt: new Date(),
      updatedBy: c.var.user.id,
    }
    await createDb(c.env.DB)
      .insert(settings)
      .values({ key: ASSISTANT_MODEL_KEY, ...change })
      .onConflictDoUpdate({ target: settings.key, set: change })
    logOutcome('assistant_model_set', { byUserId: c.var.user.id, model })
    const body: AssistantSettings = { model }
    return c.json(body)
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
