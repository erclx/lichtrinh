import { describe, expect, it } from 'vitest'

import { ActionFailed } from '../run.ts'
import {
  createModelReader,
  loadedModels,
  loadModel,
  unloadModel,
} from './ollama.ts'

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

describe('createModelReader', () => {
  const NOW = new Date('2031-11-22T14:24:00Z')

  function reader(respond: () => Response | Promise<Response>) {
    const ollama = answering(respond)
    const clock = { now: NOW }
    const models = createModelReader(ollama.fetcher, OLLAMA, () => clock.now)
    return {
      ...models,
      asked: () => ollama.requests.length,
      wait: (ms: number) => {
        clock.now = new Date(clock.now.getTime() + ms)
      },
    }
  }

  it('asks Ollama once within ten seconds and again after', async () => {
    const models = reader(() => Response.json(LOADED))

    await models.read()
    models.wait(9_999)
    const within = await models.read()
    const askedWithin = models.asked()
    models.wait(1)
    await models.read()

    expect(within).toHaveLength(1)
    expect(askedWithin).toBe(1)
    expect(models.asked()).toBe(2)
  })

  it('asks at once after a change', async () => {
    const models = reader(() => Response.json(LOADED))

    await models.read()
    models.changed()
    await models.read()

    expect(models.asked()).toBe(2)
  })

  it('never keeps a read a change overtook', async () => {
    const models = reader(() => Response.json(LOADED))

    const overtaken = models.read()
    models.changed()
    await overtaken
    await models.read()

    expect(models.asked()).toBe(2)
  })

  it('asks again at once while Ollama does not answer', async () => {
    const models = reader(refusing)

    await models.read()

    expect(await models.read()).toBeNull()
    expect(models.asked()).toBe(2)
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
