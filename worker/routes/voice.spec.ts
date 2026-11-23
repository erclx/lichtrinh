import { apiError } from '@shared/errors.ts'
import { transcription, voiceAdmin, voiceSettings } from '@shared/voice.ts'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'

import { app, MAX_BODY_BYTES } from '../app.ts'
import { createDb } from '../db/client.ts'
import { settings, transcriptions } from '../db/schema.ts'
import type { FakeBridge } from '../test/bridge.ts'
import {
  answerClip,
  connectBridge,
  connectVoiceBridge,
  sayVoice,
} from '../test/bridge.ts'
import { bare, json } from '../test/requests.ts'
import { signedIn } from '../test/users.ts'
import { FAKE_CLIP, sendClip } from '../test/voice.ts'

const open: FakeBridge[] = []

async function voiceOnline() {
  const bridge = await connectVoiceBridge()
  open.push(bridge)
  return bridge
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((bridge) => bridge.close()))
})

async function errorCode(res: Response) {
  return apiError.parse(await res.json()).error.code
}

function rowOf(id: string) {
  return createDb(env.DB)
    .select()
    .from(transcriptions)
    .where(eq(transcriptions.id, id))
    .get()
}

function chatter() {
  return signedIn({ canChat: true })
}

describe('PUT /api/voice/transcriptions/:id', () => {
  it('answers the text the workspace PC heard, with the model and timings', async () => {
    const { cookie } = await chatter()
    const bridge = await voiceOnline()
    const id = crypto.randomUUID()

    const pending = sendClip(cookie, { id })
    const frame = await answerClip(bridge, {
      text: 'Invented transcript',
      audioMs: 2400,
    })
    const res = await pending

    expect(res.status).toBe(200)
    expect(transcription.parse(await res.json())).toMatchObject({
      id,
      text: 'Invented transcript',
      model: 'qwen3-asr-1.7b',
      audioMs: 2400,
    })
    expect(frame).toMatchObject({
      transcriptionId: id,
      model: 'qwen3-asr-1.7b',
      contentType: 'audio/webm',
    })
    expect(atob(frame.audio)).toBe('invented clip bytes')
  })

  it('answers empty text for a clip with no speech', async () => {
    const { cookie } = await chatter()
    const bridge = await voiceOnline()

    const pending = sendClip(cookie)
    await answerClip(bridge, { text: '', audioMs: 900 })
    const res = await pending

    expect(res.status).toBe(200)
    expect(transcription.parse(await res.json()).text).toBe('')
  })

  it('records the outcome and length, with no column holding the text', async () => {
    const { cookie, user } = await chatter()
    const bridge = await voiceOnline()
    const id = crypto.randomUUID()

    const pending = sendClip(cookie, { id })
    await answerClip(bridge, { text: 'Invented words', audioMs: 1500 })
    await pending

    expect(await rowOf(id)).toMatchObject({
      userId: user.id,
      model: 'qwen3-asr-1.7b',
      outcome: 'ok',
      audioMs: 1500,
      characters: 14,
      sentMessageId: null,
      editRatio: null,
    })
  })

  it('sends the clip on the model the admin set', async () => {
    const { cookie, user } = await chatter()
    await createDb(env.DB).insert(settings).values({
      key: 'voice_model',
      value: 'phowhisper-large',
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    const bridge = await voiceOnline()

    const pending = sendClip(cookie)
    const frame = await answerClip(bridge, { text: 'Invented', audioMs: 800 })
    const res = await pending

    expect(frame.model).toBe('phowhisper-large')
    expect(transcription.parse(await res.json()).model).toBe('phowhisper-large')
  })

  it('takes an mp4 clip, as Safari records', async () => {
    const { cookie } = await chatter()
    const bridge = await voiceOnline()

    const pending = sendClip(cookie, { type: 'audio/mp4' })
    const frame = await answerClip(bridge, { text: 'Invented', audioMs: 800 })

    expect((await pending).status).toBe(200)
    expect(frame.contentType).toBe('audio/mp4')
  })

  it('reruns a retried id into the same row rather than adding one', async () => {
    const { cookie, user } = await chatter()
    const bridge = await voiceOnline()
    const id = crypto.randomUUID()
    const first = sendClip(cookie, { id })
    await answerClip(bridge, { text: 'First try', audioMs: 1000 })
    await first

    const retry = sendClip(cookie, { id })
    await answerClip(bridge, { text: 'Second', audioMs: 1000 })
    const res = await retry

    expect(res.status).toBe(200)
    const rows = await createDb(env.DB)
      .select()
      .from(transcriptions)
      .where(eq(transcriptions.userId, user.id))
      .all()
    expect(rows).toHaveLength(1)
    expect(rows[0].characters).toBe(6)
  })

  it('refuses an id another account holds, and sends nothing', async () => {
    const owner = await chatter()
    const other = await chatter()
    const bridge = await voiceOnline()
    const id = crypto.randomUUID()
    const first = sendClip(owner.cookie, { id })
    await answerClip(bridge, { text: 'Invented', audioMs: 1000 })
    await first

    const res = await sendClip(other.cookie, { id })

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('id_conflict')
    expect((await rowOf(id))?.userId).toBe(owner.user.id)
  })
})

describe('a clip the app refuses', () => {
  it('refuses an account with chat off', async () => {
    const { cookie } = await signedIn({ canChat: false })

    const res = await sendClip(cookie)

    expect(res.status).toBe(403)
  })

  it('refuses a type the browser does not record', async () => {
    const { cookie } = await chatter()

    const res = await sendClip(cookie, { type: 'audio/ogg' })

    expect(res.status).toBe(415)
    expect(await errorCode(res)).toBe('unsupported_media_type')
  })

  it('refuses a JSON body on the clip route', async () => {
    const { cookie } = await chatter()

    const res = await sendClip(cookie, {
      type: 'application/json',
      body: '{}',
    })

    expect(res.status).toBe(415)
  })

  it('refuses an empty clip', async () => {
    const { cookie } = await chatter()

    const res = await sendClip(cookie, { body: new Uint8Array(0) })

    expect(res.status).toBe(400)
  })

  it('refuses an id that is not a uuid', async () => {
    const { cookie } = await chatter()

    const res = await sendClip(cookie, { id: 'not-a-uuid' })

    expect(res.status).toBe(400)
  })

  it('refuses a clip past 2 MiB', async () => {
    const { cookie } = await chatter()

    const res = await sendClip(cookie, {
      body: new Uint8Array(2 * 1024 * 1024 + 1),
    })

    expect(res.status).toBe(413)
    expect(await errorCode(res)).toBe('body_too_large')
  })
})

describe('voice off, plainly', () => {
  it('answers voice_unavailable with no bridge', async () => {
    const { cookie } = await chatter()
    const id = crypto.randomUUID()

    const res = await sendClip(cookie, { id })

    expect(res.status).toBe(503)
    expect(await errorCode(res)).toBe('voice_unavailable')
    expect((await rowOf(id))?.outcome).toBe('unavailable')
  })

  it('answers voice_unavailable from a bridge that does not forward clips', async () => {
    const { cookie } = await chatter()
    open.push(await connectBridge())

    const res = await sendClip(cookie)

    expect(res.status).toBe(503)
    expect(await errorCode(res)).toBe('voice_unavailable')
  })

  it('answers voice_unavailable while the voice server is down', async () => {
    const { cookie } = await chatter()
    const bridge = await voiceOnline()
    await sayVoice(bridge, false)

    const res = await sendClip(cookie)

    expect(res.status).toBe(503)
    expect(await errorCode(res)).toBe('voice_unavailable')
  })

  it('answers voice_unavailable when the voice server stops answering mid-clip', async () => {
    const { cookie } = await chatter()
    const bridge = await voiceOnline()

    const pending = sendClip(cookie)
    await answerClip(bridge, { failed: 'unavailable' })
    const res = await pending

    expect(res.status).toBe(503)
    expect(await errorCode(res)).toBe('voice_unavailable')
  })
})

describe('the audio exemption stays narrow', () => {
  it('still refuses a JSON body past 64 KB on any other route', async () => {
    const { cookie } = await signedIn({ role: 'admin' })

    const res = await app.request(
      '/api/admin/settings',
      json('PUT', { contactName: 'x'.repeat(MAX_BODY_BYTES) }, cookie),
      env,
    )

    expect(res.status).toBe(413)
  })

  it('still refuses an audio body on any other route', async () => {
    const { cookie } = await signedIn({ role: 'admin' })

    const res = await app.request(
      '/api/admin/settings',
      {
        method: 'PUT',
        headers: { cookie, 'content-type': 'audio/webm' },
        body: FAKE_CLIP,
      },
      env,
    )

    expect(res.status).toBe(415)
  })
})

function setModel(cookie: string, body: unknown) {
  return app.request('/api/admin/voice', json('PUT', body, cookie), env)
}

async function readAdmin(cookie: string) {
  const res = await app.request('/api/admin/voice', bare('GET', cookie), env)
  expect(res.status).toBe(200)
  return voiceAdmin.parse(await res.json())
}

describe('the admin voice routes', () => {
  it('sets the model the next clip runs on', async () => {
    const admin = await signedIn({ role: 'admin' })
    const { cookie } = await chatter()
    const bridge = await voiceOnline()

    const res = await setModel(admin.cookie, {
      model: 'whisper-large-v3-turbo',
    })
    const pending = sendClip(cookie)
    const frame = await answerClip(bridge, { text: 'Invented', audioMs: 800 })
    await pending

    expect(res.status).toBe(200)
    expect(voiceSettings.parse(await res.json())).toEqual({
      model: 'whisper-large-v3-turbo',
    })
    expect(frame.model).toBe('whisper-large-v3-turbo')
    expect((await readAdmin(admin.cookie)).model).toBe('whisper-large-v3-turbo')
  })

  it('refuses a member setting the model', async () => {
    const { cookie } = await signedIn({ role: 'member', canChat: true })

    const res = await setModel(cookie, { model: 'phowhisper-large' })

    expect(res.status).toBe(403)
  })

  it('refuses a member reading the usage', async () => {
    const { cookie } = await signedIn({ role: 'member', canChat: true })

    const res = await app.request('/api/admin/voice', bare('GET', cookie), env)

    expect(res.status).toBe(403)
  })

  it('refuses a model the voice server does not offer', async () => {
    const { cookie } = await signedIn({ role: 'admin' })

    const res = await setModel(cookie, { model: 'invented-model' })

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })

  it('totals each model in the offered order, counting only clips that came back', async () => {
    const { cookie, user } = await signedIn({ role: 'admin' })
    const db = createDb(env.DB)
    await db.delete(transcriptions)
    const at = new Date('2031-04-11T09:00:00Z')
    const row = (
      model: string,
      outcome: 'ok' | 'failed' | 'unavailable',
      editRatio: number | null,
    ) => ({
      id: crypto.randomUUID(),
      userId: user.id,
      model,
      outcome,
      audioMs: 1000,
      transcribeMs: 400,
      characters: 10,
      sentMessageId: editRatio === null ? null : crypto.randomUUID(),
      editRatio,
      createdAt: at,
      updatedAt: at,
    })
    await db
      .insert(transcriptions)
      .values([
        row('qwen3-asr-1.7b', 'ok', 0.1),
        row('qwen3-asr-1.7b', 'ok', 0.3),
        row('qwen3-asr-1.7b', 'ok', null),
        row('qwen3-asr-1.7b', 'failed', null),
        row('phowhisper-large', 'unavailable', null),
      ])

    const { usage } = await readAdmin(cookie)

    expect(usage).toEqual([
      { model: 'qwen3-asr-1.7b', clips: 3, sent: 2, meanEditRatio: 0.2 },
      {
        model: 'whisper-large-v3-turbo',
        clips: 0,
        sent: 0,
        meanEditRatio: null,
      },
      { model: 'phowhisper-large', clips: 0, sent: 0, meanEditRatio: null },
    ])
  })
})
