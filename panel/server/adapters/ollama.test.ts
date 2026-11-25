import { describe, expect, it } from 'vitest'

import { ActionFailed } from '../run.ts'
import { loadedModels, loadModel, unloadModel } from './ollama.ts'

const OLLAMA = 'http://127.0.0.1:11434'

const LOADED = {
  models: [
    {
      name: 'lichtrinh-assistant:latest',
      model: 'lichtrinh-assistant:latest',
      size: 23_900_000_000,
      size_vram: 23_700_000_000,
      digest: 'invented',
      expires_at: '2031-11-22T14:36:00.123456789+01:00',
    },
    {
      name: 'another-model:27b',
      size_vram: 5_000_000_000,
      expires_at: '2031-11-22T14:36:00Z',
    },
  ],
}

function answering(respond: () => Response | Promise<Response>) {
  const requests: { url: string; body: unknown }[] = []
  const fetcher = (async (url: string, init?: RequestInit) => {
    requests.push({
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    return respond()
  }) as typeof fetch
  return { fetcher, requests }
}

const refusing = () => Promise.reject(new TypeError('connection refused'))

describe('loadedModels', () => {
  it('reads the assistant aliases alone, with when each leaves the card', async () => {
    const ollama = answering(() => Response.json(LOADED))

    expect(await loadedModels(ollama.fetcher, OLLAMA)).toEqual([
      {
        alias: 'lichtrinh-assistant',
        vramBytes: 23_700_000_000,
        freesAt: new Date('2031-11-22T13:36:00.123Z'),
      },
    ])
  })

  it('reads an empty card as no model rather than no answer', async () => {
    const ollama = answering(() => Response.json({ models: [] }))

    expect(await loadedModels(ollama.fetcher, OLLAMA)).toEqual([])
  })

  it.each([
    ['a refused connection', refusing],
    ['a failed answer', () => new Response('', { status: 500 })],
    ['an answer in another shape', () => Response.json({ loaded: 1 })],
  ])('answers null on %s', async (_, respond) => {
    expect(await loadedModels(answering(respond).fetcher, OLLAMA)).toBeNull()
  })
})

describe('the model actions', () => {
  it('loads a model for as long as the bridge keeps it', async () => {
    const ollama = answering(() => Response.json({}))

    await loadModel(ollama.fetcher, OLLAMA, 'lichtrinh-assistant')

    expect(ollama.requests).toEqual([
      {
        url: 'http://127.0.0.1:11434/api/generate',
        body: {
          model: 'lichtrinh-assistant',
          keep_alive: '15m',
          stream: false,
        },
      },
    ])
  })

  it('unloads a model at once', async () => {
    const ollama = answering(() => Response.json({}))

    await unloadModel(ollama.fetcher, OLLAMA, 'lichtrinh-assistant-gemma')

    expect(ollama.requests[0]?.body).toEqual({
      model: 'lichtrinh-assistant-gemma',
      keep_alive: 0,
      stream: false,
    })
  })

  it.each([
    ['a refused connection', refusing],
    ['a failed answer', () => new Response('', { status: 500 })],
  ])('fails on %s', async (_, respond) => {
    const loading = loadModel(
      answering(respond).fetcher,
      OLLAMA,
      'lichtrinh-assistant',
    )

    await expect(loading).rejects.toThrow(ActionFailed)
  })
})
