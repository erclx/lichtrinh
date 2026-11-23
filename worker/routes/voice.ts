import type { Transcription } from '@shared/voice.ts'
import { readClipType } from '@shared/voice.ts'
import { Hono } from 'hono'
import { z } from 'zod'

import type { ClipEnd } from '../assistant/relay.ts'
import { relayOf } from '../assistant/relay.ts'
import type { AuthEnv } from '../auth/guard.ts'
import { requireChat } from '../auth/guard.ts'
import { createDb } from '../db/client.ts'
import { fail, refuse } from '../envelope.ts'
import { logOutcome } from '../log.ts'
import { readVoiceModel } from '../voice/model.ts'
import type { ClipOutcome } from '../voice/transcriptions.ts'
import { mayRecord, recordClip } from '../voice/transcriptions.ts'

const clipId = z.uuid()

const OUTCOME = {
  text: 'ok',
  unavailable: 'unavailable',
  failed: 'failed',
} as const satisfies Record<ClipEnd['kind'], ClipOutcome>

// The clip rides the body raw and lives in memory for this request alone.
// The app's body limit and type check let this one path take audio.
export const voiceRoutes = new Hono<AuthEnv>().put(
  '/voice/transcriptions/:id',
  requireChat,
  async (c) => {
    const id = clipId.safeParse(c.req.param('id'))
    if (!id.success) return refuse(c, 'validation_failed')
    const contentType = readClipType(c.req.header('content-type'))
    if (contentType === undefined) {
      return c.json(
        fail('unsupported_media_type', 'Send the clip as audio/webm or mp4'),
        415,
      )
    }
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
  },
)
