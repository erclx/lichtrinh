import type { AssistantModel } from '@shared/assistant.ts'
import { describe, expect, it } from 'vitest'

import type { ServiceId } from '../services.ts'
import { panelState } from '../state.ts'
import type { ConnectionEvent } from './adapters/journal.ts'
import type { AppRead } from './adapters/owner.ts'
import type { UnitState } from './adapters/systemd.ts'
import { buildState, loadModelOf, type Readings } from './state.ts'

const NOW = new Date('2031-11-22T14:24:00Z')
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000)

const VOICE = 'lichtrinh-voice.service'
const BRIDGE = 'lichtrinh-bridge.service'
const STAGING = 'lichtrinh-bridge-staging.service'

function unit(active: string, fields: Partial<UnitState> = {}): UnitState {
  return {
    active,
    restarts: 0,
    invocationId: 'run-2',
    activeSince: ago(3600),
    changedAt: ago(3600),
    ...fields,
  }
}

function event(
  name: ConnectionEvent['event'],
  seconds: number,
  invocationId = 'run-2',
): ConnectionEvent {
  return { event: name, at: ago(seconds), invocationId }
}

const LOADED = {
  alias: 'lichtrinh-assistant' as const,
  vramBytes: 22 * 1024 ** 3,
  freesAt: new Date('2031-11-22T14:36:00Z'),
}

/** Nothing running, with Ollama answering and an empty card. */
function readings(
  units: Record<string, UnitState> = {},
  fields: Partial<Readings> = {},
): Readings {
  return {
    unit: (name) =>
      units[name] ??
      unit('inactive', {
        invocationId: null,
        activeSince: null,
        changedAt: null,
      }),
    voiceAnswers: false,
    models: [],
    load: 'idle',
    connections: { bridge: [], staging: [] },
    logs: { voice: [], model: [], bridge: [], staging: [] },
    card: null,
    app: null,
    ...fields,
  }
}

function service(id: ServiceId, from: Readings) {
  const found = buildState(from, NOW).services.find((tile) => tile.id === id)
  if (found === undefined) throw new Error(`No tile for ${id}`)
  return found
}

describe('buildState', () => {
  it('answers the tiles in their order, in the shape the page parses', () => {
    const line = { at: NOW.toISOString(), event: null, text: 'a line' }
    const state = buildState(
      readings(
        {},
        { logs: { voice: [line], model: [], bridge: [], staging: [] } },
      ),
      NOW,
    )

    expect(panelState.parse(state)).toEqual(state)
    expect(state.services.map((tile) => tile.id)).toEqual([
      'voice',
      'model',
      'bridge',
      'staging',
    ])
    expect(state.services[0]?.logs).toEqual([line])
    expect(state.readAt).toBe('2031-11-22T14:24:00.000Z')
  })
})

describe('the status systemd alone gives', () => {
  it.each([
    ['activating', 'starting'],
    ['deactivating', 'stopping'],
    ['failed', 'failed'],
    ['inactive', 'stopped'],
  ])('reads a unit that is %s as %s', (active, expected) => {
    const from = readings({
      [VOICE]: unit(active),
      [BRIDGE]: unit(active),
      [STAGING]: unit(active),
    })

    expect(service('voice', from).status).toBe(expected)
    expect(service('bridge', from).status).toBe(expected)
    expect(service('staging', from).status).toBe(expected)
  })

  it('says when an exited unit gave up and how often it restarted', () => {
    const from = readings({
      [VOICE]: unit('failed', { restarts: 3, changedAt: ago(1080) }),
    })

    expect(service('voice', from)).toMatchObject({
      cause: 'exited',
      since: ago(1080).toISOString(),
      restarts: 3,
    })
  })

  it('reports no restarts for a unit that runs after some', () => {
    const from = readings(
      { [VOICE]: unit('active', { restarts: 2 }) },
      { voiceAnswers: true },
    )

    expect(service('voice', from).restarts).toBe(0)
  })
})

describe('voice', () => {
  it('is up once its process answers', () => {
    const from = readings({ [VOICE]: unit('active') }, { voiceAnswers: true })

    expect(service('voice', from)).toMatchObject({ status: 'up', cause: null })
  })

  it.each([
    [59, 'starting', null],
    [60, 'failed', 'not_answering'],
  ])(
    'is %s seconds into a silent run, so it reads %s',
    (seconds, status, cause) => {
      const from = readings({
        [VOICE]: unit('active', { activeSince: ago(seconds) }),
      })

      expect(service('voice', from)).toMatchObject({ status, cause })
    },
  )

  it.each(['failed', 'inactive'])(
    'is up elsewhere when the unit is %s and something answers its port',
    (active) => {
      const from = readings({ [VOICE]: unit(active) }, { voiceAnswers: true })

      expect(service('voice', from)).toMatchObject({
        status: 'up',
        cause: 'elsewhere',
      })
    },
  )

  it('is still starting while something else answers its port', () => {
    const from = readings(
      { [VOICE]: unit('activating') },
      { voiceAnswers: true },
    )

    expect(service('voice', from).status).toBe('starting')
  })
})

describe.each([
  ['bridge', BRIDGE],
  ['staging', STAGING],
] as const)('%s', (id, unitName) => {
  const connected = (events: ConnectionEvent[], fields = {}) =>
    readings(
      { [unitName]: unit('active', fields) },
      { connections: { bridge: [], staging: [], [id]: events } },
    )

  it('is connected since the last ready of the running process', () => {
    const from = connected([event('ready', 600), event('connecting', 601)])

    expect(service(id, from)).toMatchObject({
      status: 'up',
      since: ago(600).toISOString(),
    })
  })

  it('never reads connected on a ready from an earlier run', () => {
    const from = connected([event('ready', 600, 'run-1')])

    expect(service(id, from)).toMatchObject({
      status: 'failed',
      cause: 'not_answering',
    })
  })

  it.each([
    [29, 'starting'],
    [30, 'failed'],
  ])(
    'redials %s seconds after it lost the app, so it reads %s',
    (seconds, status) => {
      const from = connected([
        event('connecting', 2),
        event('closed', 3),
        event('closed', seconds),
        event('ready', 900),
      ])

      expect(service(id, from).status).toBe(status)
    },
  )

  it('says it dropped when it lost the app, not at its last redial', () => {
    const from = connected([
      event('connecting', 2),
      event('closed', 300),
      event('ready', 900),
    ])

    expect(service(id, from).since).toBe(ago(300).toISOString())
  })

  it.each([
    [10, 'starting'],
    [31, 'failed'],
  ])(
    'never connected %s seconds into its run, so it reads %s',
    (seconds, status) => {
      const from = connected([event('connecting', 1)], {
        activeSince: ago(seconds),
      })

      expect(service(id, from).status).toBe(status)
    },
  )
})

describe('the local model', () => {
  it('is up until the last loaded alias leaves the card', () => {
    const later = {
      ...LOADED,
      alias: 'lichtrinh-assistant-gemma' as const,
      freesAt: new Date('2031-11-22T14:39:00Z'),
    }
    const from = readings({}, { models: [LOADED, later] })

    expect(service('model', from)).toMatchObject({
      status: 'up',
      freesAt: '2031-11-22T14:39:00.000Z',
    })
  })

  it.each([
    ['idle', 'stopped', null],
    ['loading', 'starting', null],
    ['failed', 'failed', 'load_failed'],
  ] as const)(
    'reads an empty card as it stands after a load that is %s',
    (load, status, cause) => {
      expect(service('model', readings({}, { load }))).toMatchObject({
        status,
        cause,
      })
    },
  )

  it('is up once it is on the card, whatever an earlier load did', () => {
    const from = readings({}, { models: [LOADED], load: 'failed' })

    expect(service('model', from).status).toBe('up')
  })

  it('fails while Ollama does not answer, and leaves the other tiles read', () => {
    const from = readings(
      { [VOICE]: unit('active') },
      { models: null, voiceAnswers: true },
    )

    expect(service('model', from)).toMatchObject({
      status: 'failed',
      cause: 'not_answering',
    })
    expect(service('voice', from).status).toBe('up')
  })
})

describe('the graphics card', () => {
  const card = { totalMiB: 32607, usedMiB: 26500 }

  it('names each alias on the card', () => {
    const { gpu } = buildState(readings({}, { card, models: [LOADED] }), NOW)

    expect(gpu).toEqual({
      ...card,
      models: [{ alias: 'lichtrinh-assistant', vramMiB: 22528 }],
    })
  })

  it('still reads with Ollama silent', () => {
    const { gpu } = buildState(readings({}, { card, models: null }), NOW)

    expect(gpu).toEqual({ ...card, models: [] })
  })

  it('is null when the card cannot be read', () => {
    expect(buildState(readings(), NOW).gpu).toBeNull()
  })
})

/** What the app said at `seconds` ago, with its bridge socket held or not. */
function appRead(
  seconds: number,
  {
    online = true,
    model = 'lichtrinh-assistant',
  }: { online?: boolean; model?: AssistantModel } = {},
): AppRead {
  return {
    reach: 'read',
    at: ago(seconds),
    summary: {
      assistant: { online, lastAnsweredAt: null, model },
      turns: {
        since: '2031-11-22T00:00:00.000Z',
        count: 12,
        failed: 1,
        lastAt: '2031-11-22T14:21:00.000Z',
      },
      messages: [
        {
          id: 'm1',
          at: '2031-11-22T14:21:00.000Z',
          role: 'user',
          text: 'mai co gi',
          status: 'complete',
          model: null,
        },
      ],
    },
  }
}

describe('the app', () => {
  it('reads unset where the panel has no address for it', () => {
    expect(buildState(readings(), NOW).app).toEqual({ reach: 'unset' })
  })

  it('reads unreachable with no rows', () => {
    const from = readings({}, { app: { reach: 'unreachable' } })

    expect(buildState(from, NOW).app).toEqual({ reach: 'unreachable' })
  })

  it('carries today’s turns and the messages, in the shape the page parses', () => {
    const state = buildState(readings({}, { app: appRead(5) }), NOW)

    expect(panelState.parse(state).app).toEqual({
      reach: 'read',
      activity: { count: 12, failed: 1, lastAt: '2031-11-22T14:21:00.000Z' },
      messages: [expect.objectContaining({ id: 'm1', text: 'mai co gi' })],
    })
  })
})

describe('the bridge as the app sees it', () => {
  const connected = { [BRIDGE]: unit('active') }
  const ready = { bridge: [event('ready', 60)], staging: [] }

  it('reads Dropped when the app, read after the ready, holds no socket', () => {
    const from = readings(connected, {
      connections: ready,
      app: appRead(5, { online: false }),
    })

    expect(service('bridge', from)).toMatchObject({
      status: 'failed',
      cause: 'not_answering',
      since: ago(5).toISOString(),
    })
  })

  it('keeps the journal’s word over an app read from before the ready', () => {
    const from = readings(connected, {
      connections: ready,
      app: appRead(90, { online: false }),
    })

    expect(service('bridge', from).status).toBe('up')
  })

  it.each([
    ['holds the socket', appRead(5)],
    ['cannot be reached', { reach: 'unreachable' } as const],
    ['is not set up', null],
  ])('keeps the journal’s word while the app %s', (_, app) => {
    const from = readings(connected, { connections: ready, app })

    expect(service('bridge', from).status).toBe('up')
  })

  it('leaves the staging bridge to its journal', () => {
    const from = readings(
      { [STAGING]: unit('active') },
      {
        connections: { bridge: [], staging: [event('ready', 60)] },
        app: appRead(5, { online: false }),
      },
    )

    expect(service('staging', from).status).toBe('up')
  })

  it('leaves a stopped bridge stopped', () => {
    const from = readings({}, { app: appRead(5, { online: false }) })

    expect(service('bridge', from).status).toBe('stopped')
  })
})

describe('loadModelOf', () => {
  it('takes the admin’s pick once the app said it', () => {
    expect(
      loadModelOf(appRead(5, { model: 'lichtrinh-assistant-gemma' })),
    ).toBe('lichtrinh-assistant-gemma')
  })

  it.each([
    ['unreachable', { reach: 'unreachable' } as const],
    ['unset', null],
  ])('takes the default while the app is %s', (_, app) => {
    expect(loadModelOf(app)).toBe('lichtrinh-assistant')
  })
})
