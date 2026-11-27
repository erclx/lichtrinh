import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { panelError, panelState } from '../state.ts'
import { createApp } from './app.ts'
import { createMachine, type Tools } from './machine.ts'
import { createFakeMachine, FAKE_CONFIG, type Scenario } from './test/fakes.ts'

const NOW = new Date('2031-11-22T14:24:00Z')
const OWN = { host: '127.0.0.1:4180', 'sec-fetch-site': 'same-origin' }

function panel(scenario: Scenario, tools: Partial<Tools> = {}) {
  const fake = createFakeMachine(() => NOW)
  fake.enter(scenario)
  const logged: unknown[] = []
  const app = createApp({
    machine: createMachine({ ...fake.tools, ...tools }, FAKE_CONFIG),
    port: FAKE_CONFIG.port,
    log: (...line) => logged.push(line),
  })
  return {
    fake,
    logged,
    get: (path: string, headers: Record<string, string> = OWN) =>
      app.request(path, { headers }),
    post: (path: string, headers: Record<string, string> = OWN) =>
      app.request(path, { method: 'POST', headers }),
  }
}

async function readState(answered: Promise<Response> | Response) {
  const state = panelState.parse(await (await answered).json())
  return (id: string) => state.services.find((service) => service.id === id)
}

async function errorCode(response: Response) {
  return panelError.parse(await response.json()).error.code
}

describe('who may reach the panel', () => {
  it.each(['127.0.0.1:4180', 'localhost:4180'])('answers %s', async (host) => {
    const response = await panel('up').get('/api/state', { host })

    expect(response.status).toBe(200)
  })

  it.each([
    'rebound.invalid',
    'rebound.invalid:4180',
    '127.0.0.1',
    '127.0.0.1:9999',
    '192.168.1.20:4180',
  ])('refuses the host %s before it reads anything', async (host) => {
    const { get, fake } = panel('up')

    const response = await get('/api/state', { host })

    expect(response.status).toBe(403)
    expect(await errorCode(response)).toBe('forbidden')
    expect(fake.commands).toEqual([])
  })

  it.each([
    ['no word from the browser', {}],
    ['a cross-site fetch', { 'sec-fetch-site': 'cross-site' }],
    ['a same-site page on another port', { 'sec-fetch-site': 'same-site' }],
    ['a typed address', { 'sec-fetch-site': 'none' }],
    ['another origin', { origin: 'http://rebound.invalid' }],
    ['another port on this machine', { origin: 'http://127.0.0.1:5173' }],
    ['the opaque origin', { origin: 'null' }],
  ])(
    'refuses an action with %s before any command runs',
    async (_, headers) => {
      const { post, fake } = panel('up')

      const answers = await Promise.all(
        ['/api/services/voice/stop', '/api/all/stop'].map((path) =>
          post(path, { host: '127.0.0.1:4180', ...headers }),
        ),
      )

      expect(answers.map((answer) => answer.status)).toEqual([403, 403])
      expect(fake.commands).toEqual([])
    },
  )

  it.each([
    ['refuses', 'rebound.invalid:4180', 403],
    ['allows', 'localhost:4180', 200],
  ])(
    '%s an action whose origin matches the host %s',
    async (_, host, status) => {
      const { post } = panel('up')

      const response = await post('/api/services/voice/stop', {
        host,
        origin: `http://${host}`,
      })

      expect(response.status).toBe(status)
    },
  )

  it('lets no other page frame it', async () => {
    const response = await panel('up').get('/api/state')

    expect(response.headers.get('x-frame-options')).toBe('DENY')
  })
})

describe('GET /api/state', () => {
  it('answers what the machine reads', async () => {
    const service = await readState(panel('failed').get('/api/state'))

    expect(service('voice')).toMatchObject({
      status: 'failed',
      cause: 'exited',
      restarts: 3,
      since: '2031-11-22T14:06:46.000Z',
    })
    expect(service('voice')?.logs[0]).toMatchObject({
      event: 'failed',
      text: 'exit 1, restart limit reached',
    })
    expect(service('model')?.status).toBe('up')
    expect(service('bridge')).toMatchObject({
      status: 'up',
      since: '2031-11-22T11:11:00.000Z',
    })
    expect(service('staging')?.status).toBe('stopped')
  })

  it('is never stored by the browser', async () => {
    const response = await panel('up').get('/api/state')

    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each([
    ['systemctl', 'show', 'systemctl show exited 127'],
    ['journalctl', '--quiet', 'journalctl exited 127'],
  ])(
    'fails while %s is cut, rather than answering that services stopped',
    async (file, _, error) => {
      const fake = createFakeMachine(() => NOW)
      fake.enter('up')
      const { get, logged } = panel('up', {
        run: async (command, options) =>
          command[0] === file
            ? { code: 127, stdout: '', stderr: '' }
            : fake.tools.run(command, options),
      })

      const response = await get('/api/state')

      expect(response.status).toBe(502)
      expect(await errorCode(response)).toBe('read_failed')
      expect(logged).toEqual([['read_failed', { path: '/api/state', error }]])
    },
  )

  it('asks voice, Ollama, and the app once over several reads', async () => {
    const { get, fake } = panel('up')

    await get('/api/state')
    await get('/api/state')

    expect(
      fake.commands.filter((command) => command.startsWith('GET ')),
    ).toEqual(['GET /health', 'GET /api/ps', 'GET /api/owner/summary'])
  })

  it('carries the app’s turns and its messages, newest first', async () => {
    const response = await panel('up').get('/api/state')

    const { app } = panelState.parse(await response.json())
    expect(app).toMatchObject({
      reach: 'read',
      activity: { count: 12, failed: 1, lastAt: '2031-11-22T14:21:00.000Z' },
    })
    expect(app.reach === 'read' && app.messages.map(({ id }) => id)).toEqual([
      'fake-reply-3',
      'fake-message-3',
      'fake-reply-2',
      'fake-message-2',
      'fake-reply-1',
      'fake-message-1',
    ])
  })

  it('reads the app unreachable with no rows while it does not answer', async () => {
    const { get, fake } = panel('up')
    fake.stopApp()

    const { app } = panelState.parse(await (await get('/api/state')).json())

    expect(app).toEqual({ reach: 'unreachable' })
  })

  it('runs without the app where none is set', async () => {
    const fake = createFakeMachine(() => NOW)
    fake.enter('up')
    const app = createApp({
      machine: createMachine(fake.tools, { ...FAKE_CONFIG, app: null }),
      port: FAKE_CONFIG.port,
    })

    const response = await app.request('/api/state', { headers: OWN })

    expect(panelState.parse(await response.json()).app).toEqual({
      reach: 'unset',
    })
    expect(fake.commands).not.toContain('GET /api/owner/summary')
  })

  it('answers an unexpected fault in the envelope, with no detail', async () => {
    const { get, logged } = panel('up', {
      run: async () => {
        throw new TypeError('a detail nobody may read')
      },
    })

    const response = await get('/api/state')

    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('detail')
    expect(logged).toEqual([
      ['internal_error', { path: '/api/state', error: 'TypeError' }],
    ])
  })
})

describe('the actions', () => {
  const voice = 'lichtrinh-voice.service'
  const bridge = 'lichtrinh-bridge.service'
  const staging = 'lichtrinh-bridge-staging.service'

  it.each([
    [
      'voice/start',
      [
        `systemctl --user reset-failed ${voice}`,
        `systemctl --user start ${voice}`,
      ],
    ],
    ['voice/stop', [`systemctl --user stop ${voice}`]],
    [
      'bridge/restart',
      [
        `systemctl --user reset-failed ${bridge}`,
        `systemctl --user restart ${bridge}`,
      ],
    ],
    [
      'staging/start',
      [
        `systemctl --user reset-failed ${staging}`,
        `systemctl --user start ${staging}`,
      ],
    ],
    ['staging/stop', [`systemctl --user stop ${staging}`]],
    ['model/load', ['POST /api/generate']],
    ['model/unload', ['GET /api/ps', 'POST /api/generate']],
  ])('runs exactly its commands for %s', async (path, commands) => {
    const { post, fake } = panel('up')

    const response = await post(`/api/services/${path}`)

    expect(await response.json()).toEqual({ ok: true })
    expect(fake.commands).toEqual(commands)
  })

  it('says a voice that just stopped is stopped, on its earlier answer or not', async () => {
    const { post, get } = panel('up')
    await get('/api/state')

    await post('/api/services/voice/stop')

    const service = await readState(get('/api/state'))
    expect(service('voice')).toMatchObject({ status: 'stopped', cause: null })
  })

  it('says a model that was just unloaded is gone', async () => {
    const { post, get } = panel('up')
    await get('/api/state')

    await post('/api/services/model/unload')

    const service = await readState(get('/api/state'))
    expect(service('model')?.status).toBe('stopped')
  })

  it('starts a service past its restart limit', async () => {
    const { post, get } = panel('failed')

    await post('/api/services/voice/start')

    const service = await readState(get('/api/state'))
    expect(service('voice')?.status).toBe('up')
  })

  it('starts the target and both its units for Start all, and no other', async () => {
    const { post, get, fake } = panel('stopped')

    await post('/api/all/start')

    expect(fake.commands).toEqual([
      `systemctl --user reset-failed ${voice}`,
      `systemctl --user reset-failed ${bridge}`,
      `systemctl --user start lichtrinh.target ${voice} ${bridge}`,
    ])
    const service = await readState(get('/api/state'))
    expect(service('staging')?.status).toBe('stopped')
    expect(service('model')?.status).toBe('stopped')
  })

  it('stops the target, staging, and the model for Stop all, and never the panel', async () => {
    const { post, get, fake } = panel('up')
    fake.startUnit(staging)
    fake.commands.length = 0

    await post('/api/all/stop')

    expect(fake.commands).toEqual([
      `systemctl --user stop lichtrinh.target ${voice} ${bridge} ${staging}`,
      'GET /api/ps',
      'POST /api/generate',
    ])
    const service = await readState(get('/api/state'))
    expect(
      ['voice', 'model', 'bridge', 'staging'].map((id) => service(id)?.status),
    ).toEqual(['stopped', 'stopped', 'stopped', 'stopped'])
  })

  it('stops everything else while Ollama does not answer', async () => {
    const { post, fake } = panel('up')
    fake.stopOllama()

    const response = await post('/api/all/stop')

    expect(response.status).toBe(200)
  })

  it.each([
    'voice/load',
    'model/start',
    'model/restart',
    'voice/erase',
    'ollama.service/stop',
    'lichtrinh-panel.service/stop',
  ])('answers 404 for %s and runs nothing', async (path) => {
    const { post, fake } = panel('up')

    const response = await post(`/api/services/${path}`)

    expect(response.status).toBe(404)
    expect(await errorCode(response)).toBe('not_found')
    expect(fake.commands).toEqual([])
  })

  it('answers 404 for an unknown Start all verb', async () => {
    expect((await panel('up').post('/api/all/restart')).status).toBe(404)
  })

  it('fails in the envelope when systemd refuses, and logs the outcome', async () => {
    const { post, fake, logged } = panel('up')
    fake.refuse(voice)

    const response = await post('/api/services/voice/restart')

    expect(response.status).toBe(502)
    expect(await errorCode(response)).toBe('action_failed')
    expect(logged).toEqual([
      [
        'action_failed',
        {
          path: '/api/services/voice/restart',
          error: 'systemctl restart exited 1',
        },
      ],
    ])
  })
})

describe('loading the model', () => {
  const modelStatus = async (answered: Promise<Response> | Response) =>
    (await readState(answered))('model')

  /** Ollama answering its list at once and each load when told to. */
  function slowOllama() {
    const loads: { signal: AbortSignal; fail: () => void }[] = []
    const fetcher = ((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/ps')) {
        return Promise.resolve(Response.json({ models: [] }))
      }
      if (!url.endsWith('/api/generate')) return Promise.reject(new TypeError())
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal
        if (!signal) throw new Error('A load takes a signal')
        loads.push({ signal, fail: () => reject(new TypeError('refused')) })
      })
    }) as typeof fetch
    return { loads, fetcher }
  }

  it('answers at once and reads as starting until it is on the card', async () => {
    const ollama = slowOllama()
    const { post, get } = panel('stopped', { fetch: ollama.fetcher })

    const response = await post('/api/services/model/load')

    expect(response.status).toBe(200)
    expect((await modelStatus(get('/api/state')))?.status).toBe('starting')
  })

  it('reads as failed after a load fails, and Start all loads it again', async () => {
    const ollama = slowOllama()
    const { post, get } = panel('stopped', { fetch: ollama.fetcher })

    await post('/api/services/model/load')
    ollama.loads[0]?.fail()
    const after = await modelStatus(get('/api/state'))
    await post('/api/all/start')

    expect(after).toMatchObject({ status: 'failed', cause: 'load_failed' })
    expect(ollama.loads).toHaveLength(2)
    expect((await modelStatus(get('/api/state')))?.status).toBe('starting')
  })

  it('loads the alias the admin picked, once the app has said it', async () => {
    const loaded: unknown[] = []
    let answer: typeof fetch = fetch
    const fetcher = ((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/generate')) {
        loaded.push(JSON.parse(String(init?.body)).model)
      }
      return answer(url, init)
    }) as typeof fetch
    const { post, get, fake } = panel('stopped', { fetch: fetcher })
    answer = fake.tools.fetch
    fake.pickModel('lichtrinh-assistant')

    await get('/api/state')
    await post('/api/services/model/load')

    expect(loaded).toEqual(['lichtrinh-assistant'])
  })

  it('drops a load still running on Stop all', async () => {
    const ollama = slowOllama()
    const { post, get } = panel('stopped', { fetch: ollama.fetcher })

    await post('/api/services/model/load')
    await post('/api/all/stop')
    ollama.loads[0]?.fail()

    expect(ollama.loads[0]?.signal.aborted).toBe(true)
    expect((await modelStatus(get('/api/state')))?.status).toBe('stopped')
  })
})

describe('the page', () => {
  let pageRoot: string

  beforeEach(async () => {
    pageRoot = await mkdtemp(join(tmpdir(), 'lichtrinh-panel-'))
    await writeFile(join(pageRoot, 'index.html'), '<title>Owner panel</title>')
  })
  afterEach(() => rm(pageRoot, { recursive: true }))

  function served() {
    const fake = createFakeMachine(() => NOW)
    return createApp({
      machine: createMachine(fake.tools, FAKE_CONFIG),
      port: FAKE_CONFIG.port,
      pageRoot,
    })
  }

  it('serves the built page at the root', async () => {
    const response = await served().request('/', { headers: OWN })

    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain('Owner panel')
  })

  it.each(['/missing.js', '/%2e%2e/%2e%2e/etc/hostname', '/api/nothing'])(
    'answers 404 for %s',
    async (path) => {
      const response = await served().request(path, { headers: OWN })

      expect(response.status).toBe(404)
    },
  )

  it('refuses a foreign host', async () => {
    const response = await served().request('/', {
      headers: { host: 'rebound.invalid:4180' },
    })

    expect(response.status).toBe(403)
  })
})
