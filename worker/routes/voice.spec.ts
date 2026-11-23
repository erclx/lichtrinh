import { apiError } from '@shared/errors.ts'
import { transcription } from '@shared/voice.ts'
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
import { json } from '../test/requests.ts'
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
