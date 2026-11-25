import type {
  LiveText,
  Transcription,
  VoiceAdmin,
  VoiceSettings,
} from '@shared/voice.ts'
import { MAX_CLIP_BYTES, readClipType, voiceSettings } from '@shared/voice.ts'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'

import type { ClipEnd } from '../assistant/relay.ts'
import { relayOf } from '../assistant/relay.ts'
import type { AuthEnv } from '../auth/guard.ts'
import { requireChat } from '../auth/guard.ts'
import { createDb } from '../db/client.ts'
import { fail, parseBody, parseQuery, refuse } from '../envelope.ts'
import { logOutcome } from '../log.ts'
import { SPOKEN_LANGUAGE } from '../voice/language.ts'
import { readVoiceModel, writeVoiceModel } from '../voice/model.ts'
import type { ClipOutcome } from '../voice/transcriptions.ts'
import { mayRecord, recordClip, usageByModel } from '../voice/transcriptions.ts'

const clipId = z.uuid()

const liveQuery = z.strictObject({
  from: z.coerce.number().int().min(0).max(MAX_CLIP_BYTES),
})

const OUTCOME = {
  text: 'ok',
  unavailable: 'unavailable',
  failed: 'failed',
} as const satisfies Record<ClipEnd['kind'], ClipOutcome>

function notAudio(c: Context) {
  return c.json(
    fail('unsupported_media_type', 'Send the clip as audio/webm or mp4'),
    415,
  )
}

// Audio rides the body raw and lives in memory for this request alone. The
// app's body limit and type check let the two audio paths take it. The model
// routes sit under `/admin`, which the app guards with requireAdmin.
export const voiceRoutes = new Hono<AuthEnv>()
  .put('/voice/transcriptions/:id', requireChat, async (c) => {
    const id = clipId.safeParse(c.req.param('id'))
    if (!id.success) return refuse(c, 'validation_failed')
    const contentType = readClipType(c.req.header('content-type'))
    if (contentType === undefined) return notAudio(c)
    const audio = await c.req.arrayBuffer()
    if (audio.byteLength === 0) return refuse(c, 'validation_failed')
    const db = createDb(c.env.DB)
    const userId = c.var.user.id
    if (!(await mayRecord(db, userId, id.data))) {
      return refuse(c, 'id_conflict')
    }
    const model = await readVoiceModel(db)
    const startedAt = Date.now()
    const end = await relayOf(c.env).transcribe({
      id: id.data,
      model,
      language: SPOKEN_LANGUAGE,
      contentType,
      audio,
    })
    const ms = Date.now() - startedAt
    const audioMs = end.kind === 'text' ? end.audioMs : null
    await recordClip(
      db,
      {
        id: id.data,
        userId,
        model,
        outcome: OUTCOME[end.kind],
        audioMs,
        transcribeMs: ms,
        characters: end.kind === 'text' ? end.text.length : null,
      },
      new Date(),
    )
    logOutcome(`clip_${OUTCOME[end.kind]}`, {
      transcriptionId: id.data,
      userId,
      model,
      audioMs: audioMs ?? undefined,
      ms,
    })
    if (end.kind === 'unavailable') return refuse(c, 'voice_unavailable')
    if (end.kind === 'failed') return refuse(c, 'voice_failed')
    const body: Transcription = {
      id: id.data,
      text: end.text,
      model,
      audioMs: end.audioMs,
      ms,
    }
    return c.json(body)
  })
  // A preview of the clip still being spoken, so it writes no row and logs no
  // line, and the account in the id keeps one traveler's words from another.
  .put('/voice/live/:id', requireChat, async (c) => {
    const id = clipId.safeParse(c.req.param('id'))
    if (!id.success) return refuse(c, 'validation_failed')
    const { from } = parseQuery(c, liveQuery)
    const contentType = readClipType(c.req.header('content-type'))
    if (contentType === undefined) return notAudio(c)
    const audio = await c.req.arrayBuffer()
    if (audio.byteLength === 0) return refuse(c, 'validation_failed')
    const end = await relayOf(c.env).live({
      id: `${c.var.user.id}.${id.data}`,
      model: await readVoiceModel(createDb(c.env.DB)),
      language: SPOKEN_LANGUAGE,
      contentType,
      from,
      audio,
    })
    if (end.kind === 'unavailable') return refuse(c, 'voice_unavailable')
    if (end.kind === 'failed') return refuse(c, 'voice_failed')
    const body: LiveText = { text: end.text, heard: end.heard }
    return c.json(body)
  })
  .get('/admin/voice', async (c) => {
    const db = createDb(c.env.DB)
    const [model, usage] = await Promise.all([
      readVoiceModel(db),
      usageByModel(db),
    ])
    const body: VoiceAdmin = { model, usage }
    return c.json(body)
  })
  .put('/admin/voice', async (c) => {
    const { model } = await parseBody(c, voiceSettings)
    await writeVoiceModel(createDb(c.env.DB), model, c.var.user.id, new Date())
    logOutcome('voice_model_set', { byUserId: c.var.user.id, model })
    const body: VoiceSettings = { model }
    return c.json(body)
  })
