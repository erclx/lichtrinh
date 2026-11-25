import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  liveStep,
  transcribe,
  voiceHealthy,
  warmVoice,
  watchVoice,
} from './voice.ts'

const HOST = 'http://127.0.0.1:8770'
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const CLIP_ID = '0b9c6a52-4f0c-4b8e-9d2a-6f1e3c7a5b10'

function clipFrame() {
  return {
    type: 'transcribe' as const,
    transcriptionId: CLIP_ID,
    model: 'phowhisper-large' as const,
    contentType: 'audio/webm' as const,
    audio: Buffer.from('invented clip bytes').toString('base64'),
  }
}

function answering(status: number, body: object) {
  const forms: FormData[] = []
  server.use(
    http.post(`${HOST}/v1/audio/transcriptions`, async ({ request }) => {
      forms.push(await request.formData())
      return HttpResponse.json(body, { status })
    }),
  )
  return forms
}

const ANSWER = {
  text: 'Invented transcript',
  model: 'phowhisper-large',
  duration_seconds: 2.4,
  timings: { decode_seconds: 0.1, load_seconds: 0, transcribe_seconds: 0.8 },
}

describe('transcribe', () => {
  it('posts the clip and its model as a form and answers the text', async () => {
    const forms = answering(200, ANSWER)

    const answer = await transcribe(HOST, clipFrame())

    expect(answer).toEqual({
      type: 'transcript',
      transcriptionId: CLIP_ID,
      text: 'Invented transcript',
      audioMs: 2400,
    })
    expect(forms[0].get('model')).toBe('phowhisper-large')
    const file = forms[0].get('file')
    if (!(file instanceof Blob)) throw new Error('No file part')
    expect(await file.text()).toBe('invented clip bytes')
  })

  it('answers failed when the server refuses the clip with 422', async () => {
    answering(422, {
      error: { code: 'clip_undecodable', message: 'Not audio' },
    })

    expect(await transcribe(HOST, clipFrame())).toEqual({
      type: 'transcribe_failed',
      transcriptionId: CLIP_ID,
      reason: 'failed',
    })
  })

  it('answers failed when the model could not transcribe the clip', async () => {
    answering(502, {
      error: { code: 'transcribe_failed', message: 'Model failed' },
    })

    expect((await transcribe(HOST, clipFrame())).type).toBe('transcribe_failed')
  })

  it('answers unavailable when the model is not answering', async () => {
    answering(503, {
      error: { code: 'worker_unavailable', message: 'Not answering' },
    })

    expect(await transcribe(HOST, clipFrame())).toMatchObject({
      reason: 'unavailable',
    })
  })

  it('answers unavailable when the server is down', async () => {
    server.use(
      http.post(`${HOST}/v1/audio/transcriptions`, () => HttpResponse.error()),
    )

    expect(await transcribe(HOST, clipFrame())).toMatchObject({
      reason: 'unavailable',
    })
  })
})

describe('the language of a clip', () => {
  it('passes on the language the frame names', async () => {
    const forms = answering(200, ANSWER)

    await transcribe(HOST, { ...clipFrame(), language: 'en' })

    expect(forms[0].get('language')).toBe('en')
  })

  it('names no language for a frame from an older relay', async () => {
    const forms = answering(200, ANSWER)

    await transcribe(HOST, clipFrame())

    expect(forms[0].has('language')).toBe(false)
  })
})

const LIVE_ID = `invented-user.${CLIP_ID}`

function pieceFrame() {
  return {
    type: 'live' as const,
    liveId: LIVE_ID,
    model: 'qwen3-asr-1.7b' as const,
    language: 'vi' as const,
    contentType: 'audio/webm' as const,
    from: 4096,
    audio: Buffer.from('invented piece').toString('base64'),
  }
}

const LIVE_URL = `${HOST}/v1/live/:id`
const LIVE_FAILED = { type: 'live_failed', liveId: LIVE_ID }

describe('liveStep', () => {
  it('puts the piece raw and answers the words so far', async () => {
    const sent: { url: URL; type: string | null; body: string }[] = []
    server.use(
      http.put(LIVE_URL, async ({ request }) => {
        sent.push({
          url: new URL(request.url),
          type: request.headers.get('content-type'),
          body: await request.text(),
        })
        return HttpResponse.json({ text: 'Invented words', heard: 4110 })
      }),
    )

    const answer = await liveStep(HOST, pieceFrame())

    expect(answer).toEqual({
      type: 'live_text',
      liveId: LIVE_ID,
      text: 'Invented words',
      heard: 4110,
    })
    expect(sent[0].url.pathname).toBe(`/v1/live/${LIVE_ID}`)
    expect(Object.fromEntries(sent[0].url.searchParams)).toEqual({
      from: '4096',
      model: 'qwen3-asr-1.7b',
      language: 'vi',
    })
    expect(sent[0]).toMatchObject({
      type: 'audio/webm',
      body: 'invented piece',
    })
  })

  it('answers failed when the server refuses the piece', async () => {
    server.use(
      http.put(LIVE_URL, () =>
        HttpResponse.json(
          { error: { code: 'unknown_language', message: 'Not heard' } },
          { status: 400 },
        ),
      ),
    )

    expect(await liveStep(HOST, pieceFrame())).toEqual(LIVE_FAILED)
  })

  it('answers failed when the server is down', async () => {
    server.use(http.put(LIVE_URL, () => HttpResponse.error()))

    expect(await liveStep(HOST, pieceFrame())).toEqual(LIVE_FAILED)
  })

  it('answers failed for an answer it cannot read', async () => {
    server.use(http.put(LIVE_URL, () => HttpResponse.json({ text: 'Words' })))

    expect(await liveStep(HOST, pieceFrame())).toEqual(LIVE_FAILED)
  })

  it('answers failed once a step outlasts its wait', async () => {
    server.use(http.put(LIVE_URL, () => new Promise<never>(() => undefined)))

    expect(await liveStep(HOST, pieceFrame(), 20)).toEqual(LIVE_FAILED)
  })
})

describe('warmVoice', () => {
  it('asks the server to load the model', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(`${HOST}/v1/warm`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ model: 'qwen3-asr-1.7b', load_seconds: 1 })
      }),
    )

    await warmVoice(HOST, 'qwen3-asr-1.7b')

    expect(bodies).toEqual([{ model: 'qwen3-asr-1.7b' }])
  })
})

describe('voiceHealthy', () => {
  it('reads a server that answers its health check as healthy', async () => {
    server.use(
      http.get(`${HOST}/health`, () =>
        HttpResponse.json({
          status: 'ok',
          loaded_model: null,
          default_model: 'qwen3-asr-1.7b',
          models: [],
        }),
      ),
    )

    expect(await voiceHealthy(HOST)).toBe(true)
  })

  it('reads a server that is down as unhealthy', async () => {
    server.use(http.get(`${HOST}/health`, () => HttpResponse.error()))

    expect(await voiceHealthy(HOST)).toBe(false)
  })
})

describe('watchVoice', () => {
  function watching(reads: boolean[]) {
    const said: boolean[] = []
    const watch = watchVoice(
      () => Promise.resolve(reads.shift() ?? false),
      (online) => said.push(online),
    )
    return { watch, said }
  }

  it('says the health on the first read and on each change alone', async () => {
    const { watch, said } = watching([true, true, false, true])

    await watch.check()
    await watch.check()
    await watch.check()
    await watch.check()
    watch.stop()

    expect(said).toEqual([true, false, true])
  })

  it('says the health again after a reset, for a new socket', async () => {
    const { watch, said } = watching([true, true])
    await watch.check()

    watch.reset()
    await watch.check()
    watch.stop()

    expect(said).toEqual([true, true])
  })
})
