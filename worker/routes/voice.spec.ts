import { assistantStatus } from '@shared/assistant.ts'
import type { Language } from '@shared/auth.ts'
import { apiError } from '@shared/errors.ts'
import type { VoiceModel } from '@shared/voice.ts'
import {
  liveText,
  transcription,
  voiceAdmin,
  voiceSettings,
} from '@shared/voice.ts'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'

import { app, MAX_BODY_BYTES } from '../app.ts'
import { createDb } from '../db/client.ts'
import { settings, transcriptions } from '../db/schema.ts'
import type { FakeBridge } from '../test/bridge.ts'
import {
  answerClip,
  answerLive,
  connectBridge,
  connectVoiceBridge,
  sayVoice,
} from '../test/bridge.ts'
import { bare, json } from '../test/requests.ts'
import { signedIn } from '../test/users.ts'
import { FAKE_CLIP, sendClip, sendPiece } from '../test/voice.ts'

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

function speaker(language: Language | null) {
  return signedIn({ canChat: true, language })
}

async function pickModel(model: VoiceModel) {
  const admin = await signedIn({ role: 'admin' })
  const res = await setModel(admin.cookie, { model })
  expect(res.status).toBe(200)
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

describe('the language an account is heard in', () => {
  it.each([
    ['en', 'an English account', 'en'],
    ['vi', 'a Vietnamese account', 'vi'],
    ['vi', 'an account with no saved language', null],
  ] as const)('sends a clip as %s for %s', async (heard, _, language) => {
    const { cookie } = await speaker(language)
    const bridge = await voiceOnline()

    const pending = sendClip(cookie)
    const frame = await answerClip(bridge, { text: 'Invented', audioMs: 800 })
    await pending

    expect(frame.language).toBe(heard)
  })

  it.each([
    ['en', 'an English account', 'en'],
    ['vi', 'a Vietnamese account', 'vi'],
    ['vi', 'an account with no saved language', null],
  ] as const)('sends a piece as %s for %s', async (heard, _, language) => {
    const { cookie } = await speaker(language)
    const bridge = await voiceOnline()

    const pending = sendPiece(cookie)
    const frame = await answerLive(bridge, { text: 'Invented', heard: 8 })
    await pending

    expect(frame.language).toBe(heard)
  })
})

describe('a picked model that does not hear the account', () => {
  it('runs and records an English clip on the default model', async () => {
    await pickModel('phowhisper-large')
    const { cookie } = await speaker('en')
    const bridge = await voiceOnline()
    const id = crypto.randomUUID()

    const pending = sendClip(cookie, { id })
    const frame = await answerClip(bridge, { text: 'Invented', audioMs: 800 })
    const res = await pending

    expect(frame.model).toBe('qwen3-asr-1.7b')
    expect(transcription.parse(await res.json()).model).toBe('qwen3-asr-1.7b')
    expect((await rowOf(id))?.model).toBe('qwen3-asr-1.7b')
  })

  it('hears an English piece on the default model', async () => {
    await pickModel('phowhisper-large')
    const { cookie } = await speaker('en')
    const bridge = await voiceOnline()

    const pending = sendPiece(cookie)
    const frame = await answerLive(bridge, { text: 'Invented', heard: 8 })
    await pending

    expect(frame.model).toBe('qwen3-asr-1.7b')
  })

  it('keeps a picked model that hears English', async () => {
    await pickModel('whisper-large-v3-turbo')
    const { cookie } = await speaker('en')
    const bridge = await voiceOnline()

    const pending = sendClip(cookie)
    const frame = await answerClip(bridge, { text: 'Invented', audioMs: 800 })
    await pending

    expect(frame.model).toBe('whisper-large-v3-turbo')
  })

  it('keeps showing the picked model on the status', async () => {
    await pickModel('phowhisper-large')
    const { cookie } = await speaker('en')

    expect((await readVoiceStatus(cookie))?.model).toBe('phowhisper-large')
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

describe('PUT /api/voice/live/:id', () => {
  it('answers the words so far and where the next piece starts', async () => {
    const admin = await signedIn({ role: 'admin' })
    await setModel(admin.cookie, { model: 'whisper-large-v3-turbo' })
    const { cookie, user } = await chatter()
    const bridge = await voiceOnline()
    const id = crypto.randomUUID()

    const pending = sendPiece(cookie, { id, from: 4096 })
    const frame = await answerLive(bridge, {
      text: 'Invented words',
      heard: 4115,
    })
    const res = await pending

    expect(res.status).toBe(200)
    expect(liveText.parse(await res.json())).toEqual({
      text: 'Invented words',
      heard: 4115,
    })
    expect(frame).toMatchObject({
      liveId: `${user.id}.${id}`,
      model: 'whisper-large-v3-turbo',
      language: 'vi',
      contentType: 'audio/webm',
      from: 4096,
    })
    expect(atob(frame.audio)).toBe('invented clip bytes')
  })

  it('keeps two accounts using one id apart', async () => {
    const first = await chatter()
    const second = await chatter()
    const bridge = await voiceOnline()
    const id = crypto.randomUUID()

    const firstPiece = sendPiece(first.cookie, { id })
    const firstFrame = await bridge.next()
    const secondPiece = sendPiece(second.cookie, { id })
    await answerLive(bridge, { text: 'Second words', heard: 2 })
    if (firstFrame.type !== 'live') throw new Error('No live frame')
    bridge.send({
      type: 'live_text',
      liveId: firstFrame.liveId,
      text: 'First words',
      heard: 1,
    })

    expect(await (await firstPiece).json()).toEqual({
      text: 'First words',
      heard: 1,
    })
    expect(await (await secondPiece).json()).toEqual({
      text: 'Second words',
      heard: 2,
    })
  })

  it('writes no row for a piece', async () => {
    const { cookie, user } = await chatter()
    const bridge = await voiceOnline()
    const pending = sendPiece(cookie)
    await answerLive(bridge, { text: 'Invented words', heard: 19 })
    await pending

    const rows = await createDb(env.DB)
      .select()
      .from(transcriptions)
      .where(eq(transcriptions.userId, user.id))
      .all()

    expect(rows).toEqual([])
  })

  it('answers voice_unavailable with no bridge', async () => {
    const { cookie } = await chatter()

    const res = await sendPiece(cookie)

    expect(res.status).toBe(503)
    expect(await errorCode(res)).toBe('voice_unavailable')
  })

  it('answers voice_unavailable from a bridge older than live pieces', async () => {
    const { cookie } = await chatter()
    open.push(await connectVoiceBridge({ live: false }))

    const res = await sendPiece(cookie)

    expect(res.status).toBe(503)
    expect(await errorCode(res)).toBe('voice_unavailable')
  })

  it('answers voice_failed for a piece the voice server could not read', async () => {
    const { cookie } = await chatter()
    const bridge = await voiceOnline()

    const pending = sendPiece(cookie)
    await answerLive(bridge, 'failed')
    const res = await pending

    expect(res.status).toBe(502)
    expect(await errorCode(res)).toBe('voice_failed')
  })

  it('leaves voice online after a piece fails', async () => {
    const { cookie } = await chatter()
    const bridge = await voiceOnline()
    const pending = sendPiece(cookie)
    await answerLive(bridge, 'failed')
    await pending

    expect((await readVoiceStatus(cookie))?.online).toBe(true)
  })

  it('refuses an account with chat off', async () => {
    const { cookie } = await signedIn({ canChat: false })

    expect((await sendPiece(cookie)).status).toBe(403)
  })

  it('refuses a type the browser does not record', async () => {
    const { cookie } = await chatter()

    const res = await sendPiece(cookie, { type: 'audio/ogg' })

    expect(res.status).toBe(415)
  })

  it.each([
    ['an id that is not a uuid', { id: 'not-a-uuid' }],
    ['an empty piece', { body: new Uint8Array(0) }],
    ['a start below zero', { from: -1 }],
    ['a start that is not a number', { from: 'later' }],
    ['a start past the longest clip', { from: 2 * 1024 * 1024 + 1 }],
  ])('refuses %s', async (_, options) => {
    const { cookie } = await chatter()

    const res = await sendPiece(cookie, options)

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })

  it('refuses a piece past 2 MiB', async () => {
    const { cookie } = await chatter()

    const res = await sendPiece(cookie, {
      body: new Uint8Array(2 * 1024 * 1024 + 1),
    })

    expect(res.status).toBe(413)
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

async function readVoiceStatus(cookie: string) {
  const res = await app.request(
    '/api/assistant/status',
    bare('GET', cookie),
    env,
  )
  expect(res.status).toBe(200)
  return assistantStatus.parse(await res.json()).voice
}

describe('voice on the assistant status', () => {
  it('reads voice offline with no bridge', async () => {
    const { cookie } = await chatter()

    expect((await readVoiceStatus(cookie))?.online).toBe(false)
  })

  it('reads voice offline from a bridge that does not forward clips', async () => {
    const { cookie } = await chatter()
    open.push(await connectBridge())

    expect((await readVoiceStatus(cookie))?.online).toBe(false)
  })

  it('reads voice online once the bridge says its voice server answers', async () => {
    const { cookie } = await chatter()
    await voiceOnline()

    expect((await readVoiceStatus(cookie))?.online).toBe(true)
  })

  it('reads voice offline again once the voice server goes down', async () => {
    const { cookie } = await chatter()
    const bridge = await voiceOnline()

    await sayVoice(bridge, false)

    expect((await readVoiceStatus(cookie))?.online).toBe(false)
  })
})

describe('warming voice', () => {
  function warm(cookie: string) {
    return app.request('/api/assistant/warm', bare('POST', cookie), env)
  }

  it('asks a voice bridge to load the set speech model beside the assistant', async () => {
    const admin = await signedIn({ role: 'admin' })
    await setModel(admin.cookie, { model: 'phowhisper-large' })
    const { cookie } = await chatter()
    const bridge = await voiceOnline()

    const res = await warm(cookie)

    expect(res.status).toBe(202)
    expect((await bridge.next()).type).toBe('warm')
    expect(await bridge.next()).toEqual({
      type: 'voice_warm',
      model: 'phowhisper-large',
    })
  })

  it('loads the model an English account will run on', async () => {
    await pickModel('phowhisper-large')
    const { cookie } = await speaker('en')
    const bridge = await voiceOnline()

    const res = await warm(cookie)

    expect(res.status).toBe(202)
    expect((await bridge.next()).type).toBe('warm')
    expect(await bridge.next()).toEqual({
      type: 'voice_warm',
      model: 'qwen3-asr-1.7b',
    })
  })

  it('sends no voice frame to a bridge that does not forward clips', async () => {
    const { cookie } = await chatter()
    const bridge = await connectBridge()
    open.push(bridge)

    await warm(cookie)
    await warm(cookie)

    expect((await bridge.next()).type).toBe('warm')
    expect((await bridge.next()).type).toBe('warm')
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
