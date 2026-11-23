import { assistantTools } from '@shared/assistant-tools.ts'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { available, turnModel, warm } from './ollama.ts'

const HOST = 'http://127.0.0.1:11434'
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/** A chat endpoint that streams `lines` and records the body it was sent. */
function chatAnswering(lines: object[]) {
  const bodies: unknown[] = []
  server.use(
    http.post(`${HOST}/api/chat`, async ({ request }) => {
      bodies.push(await request.json())
      const ndjson = lines.map((line) => `${JSON.stringify(line)}\n`).join('')
      return new HttpResponse(ndjson, {
        headers: { 'content-type': 'application/x-ndjson' },
      })
    }),
  )
  return bodies
}

async function collect<T>(stream: AsyncIterable<T>) {
  const chunks: T[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe('turnModel', () => {
  it('streams a turn with thinking on and the model kept loaded', async () => {
    const bodies = chatAnswering([
      { message: { role: 'assistant', content: 'Chào' }, done: false },
      { message: { role: 'assistant', content: '' }, done: true },
    ])

    const stream = await turnModel(HOST).chat({
      model: 'lichtrinh-assistant',
      messages: [{ role: 'user', content: 'xin chao' }],
      tools: assistantTools,
    })
    const chunks = await collect(stream)

    expect(chunks.map((chunk) => chunk.message.content)).toEqual(['Chào', ''])
    expect(bodies[0]).toMatchObject({
      model: 'lichtrinh-assistant',
      stream: true,
      think: true,
      keep_alive: '15m',
    })
  })

  it('rejects when Ollama answers an error status', async () => {
    server.use(
      http.post(`${HOST}/api/chat`, () =>
        HttpResponse.json({ error: 'model not found' }, { status: 404 }),
      ),
    )

    const chat = turnModel(HOST).chat({
      model: 'lichtrinh-assistant',
      messages: [],
      tools: assistantTools,
    })

    await expect(chat).rejects.toThrow('model not found')
  })
})

describe('warm', () => {
  it('loads the model with no messages and the turn keep-alive', async () => {
    const bodies = chatAnswering([
      { message: { role: 'assistant', content: '' }, done: true },
    ])

    await warm(HOST, 'lichtrinh-assistant-gemma')

    expect(bodies[0]).toMatchObject({
      model: 'lichtrinh-assistant-gemma',
      messages: [],
      keep_alive: '15m',
    })
  })
})

describe('available', () => {
  it('lists only the assistant aliases Ollama holds', async () => {
    server.use(
      http.get(`${HOST}/api/tags`, () =>
        HttpResponse.json({
          models: [
            { name: 'lichtrinh-assistant:latest' },
            { name: 'qwen3.8:27b' },
          ],
        }),
      ),
    )

    expect(await available(HOST)).toEqual(['lichtrinh-assistant'])
  })
})
