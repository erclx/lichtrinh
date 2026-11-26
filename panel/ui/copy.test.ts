import type { OwnerMessage } from '@shared/owner.ts'

import type { PanelState, ServiceState, ServiceStatus } from '../state.ts'
import {
  clock,
  detail,
  endNote,
  failureLine,
  isDown,
  isStrong,
  lastTurn,
  logTime,
  messageKind,
  serviceButtons,
  shortTime,
  statusWord,
  stopAllWarning,
  verdict,
} from './copy.ts'

// Local times, since the page prints the PC's own clock.
const NOW = new Date(2031, 10, 22, 14, 24)
const at = (hour: number, minute: number, day = 22) =>
  new Date(2031, 10, day, hour, minute).toISOString()

function service(
  id: ServiceState['id'],
  status: ServiceStatus = 'up',
  fields: Partial<ServiceState> = {},
): ServiceState {
  return {
    id,
    status,
    cause: null,
    since: null,
    restarts: 0,
    freesAt: null,
    logs: [],
    ...fields,
  }
}

function state(
  statuses: Partial<Record<ServiceState['id'], ServiceStatus>> = {},
): PanelState {
  return {
    readAt: NOW.toISOString(),
    services: [
      service('voice', statuses.voice),
      service('model', statuses.model),
      service('bridge', statuses.bridge),
      service('staging', statuses.staging ?? 'stopped'),
    ],
    gpu: null,
    app: { reach: 'unset' },
  }
}

describe('verdict', () => {
  it.each([
    [{}, 'Everything is up'],
    [{ model: 'stopped' }, 'Everything is up'],
    [{ model: 'starting' }, 'Everything is up'],
    [{ voice: 'failed' }, 'Voice is down'],
    [{ voice: 'stopped' }, 'Voice is down'],
    [{ model: 'failed' }, 'The local model is down'],
    [{ bridge: 'failed' }, 'The bridge is down'],
    [{ bridge: 'stopped' }, 'The bridge is down'],
    [
      { voice: 'failed', model: 'failed' },
      'Voice and the local model are down',
    ],
    [{ voice: 'failed', bridge: 'stopped' }, 'Voice and the bridge are down'],
    [
      { model: 'failed', bridge: 'failed' },
      'The local model and the bridge are down',
    ],
    [
      { voice: 'failed', model: 'failed', bridge: 'failed' },
      'Voice, the local model, and the bridge are down',
    ],
    [{ voice: 'stopped', bridge: 'stopped' }, 'Everything is stopped'],
    [
      { voice: 'stopped', model: 'failed', bridge: 'stopped' },
      'Everything is stopped',
    ],
    [{ voice: 'starting' }, 'Starting'],
    [{ voice: 'starting', bridge: 'starting' }, 'Starting'],
    [{ bridge: 'stopping' }, 'Stopping'],
    [{ voice: 'starting', bridge: 'failed' }, 'The bridge is down'],
  ] as const)('reads %j as %s', (statuses, heading) => {
    expect(verdict(state(statuses)).heading).toBe(heading)
  })

  it.each(['up', 'starting', 'stopping', 'failed', 'stopped'] as const)(
    'stays the same with staging %s',
    (staging) => {
      expect(verdict(state({ staging }))).toEqual(verdict(state()))
    },
  )

  it.each(['stopped', 'starting', 'stopping'] as const)(
    'never calls a model that is %s down',
    (model) => {
      expect(verdict(state({ model })).heading).toBe('Everything is up')
      expect(isDown(service('model', model))).toBe(false)
    },
  )

  it.each([
    [
      { voice: 'failed', bridge: 'up' },
      'Chat works, and talk is off until voice starts.',
    ],
    [
      { voice: 'failed', bridge: 'starting' },
      'Talk is off until voice starts.',
    ],
    [
      { voice: 'failed', bridge: 'failed' },
      'The app cannot reach this PC, so chat and talk are off.',
    ],
    [
      { voice: 'failed', model: 'failed' },
      'Chat cannot answer and talk is off.',
    ],
  ] as const)('promises only what works with %j', (statuses, line) => {
    expect(verdict(state(statuses)).line).toBe(line)
  })

  it.each([
    [{}, ['Stop all']],
    [{ voice: 'failed' }, ['Start voice', 'Stop all']],
    [{ model: 'failed' }, ['Load model', 'Stop all']],
    [{ voice: 'failed', bridge: 'stopped' }, ['Start all', 'Stop all']],
    [{ voice: 'stopped', bridge: 'stopped' }, ['Start all', 'Stop all']],
    [{ voice: 'stopped', model: 'stopped', bridge: 'stopped' }, ['Start all']],
    [
      {
        voice: 'stopped',
        model: 'stopped',
        bridge: 'stopped',
        staging: 'up',
      },
      ['Start all', 'Stop all'],
    ],
  ] as const)('offers its buttons for %j', (statuses, labels) => {
    const { buttons } = verdict(state(statuses))

    expect(buttons.map((button) => button.label)).toEqual(labels)
  })

  it('restarts a bridge whose process still runs', () => {
    const panel = state()
    panel.services[2] = service('bridge', 'failed', { cause: 'not_answering' })

    expect(verdict(panel).buttons[0]).toEqual({
      label: 'Restart bridge',
      press: { on: 'service', id: 'bridge', action: 'restart' },
      primary: true,
    })
  })
})

describe('serviceButtons', () => {
  it.each([
    ['voice', 'up', null, ['Restart', 'Stop']],
    ['voice', 'up', 'elsewhere', []],
    ['voice', 'failed', 'exited', ['Start']],
    ['voice', 'failed', 'not_answering', ['Restart', 'Stop']],
    ['voice', 'stopped', null, ['Start']],
    ['voice', 'starting', null, []],
    ['voice', 'stopping', null, []],
    ['bridge', 'failed', 'exited', ['Start']],
    ['bridge', 'failed', 'not_answering', ['Restart', 'Stop']],
    ['staging', 'stopped', null, ['Start']],
    ['staging', 'up', null, ['Restart', 'Stop']],
    ['model', 'up', null, ['Unload']],
    ['model', 'stopped', null, ['Load']],
    ['model', 'failed', 'load_failed', ['Load']],
  ] as const)('%s %s (%s) offers %j', (id, status, cause, labels) => {
    const buttons = serviceButtons(service(id, status, { cause }))

    expect(buttons.map((button) => button.label)).toEqual(labels)
  })

  it.each([
    ['voice', 'stopped', true],
    ['model', 'stopped', false],
    ['model', 'failed', true],
    ['staging', 'stopped', false],
    ['staging', 'failed', false],
  ] as const)(
    'marks the %s button as the next step when %s: %s',
    (id, status, primary) => {
      expect(serviceButtons(service(id, status))[0]?.primary).toBe(primary)
    },
  )
})

describe('statusWord', () => {
  it.each([
    ['voice', 'up', 'Running'],
    ['voice', 'failed', 'Failed'],
    ['voice', 'stopped', 'Stopped'],
    ['model', 'up', 'Loaded'],
    ['model', 'starting', 'Loading'],
    ['model', 'failed', 'Failed'],
    ['model', 'stopped', 'Not loaded'],
    ['bridge', 'up', 'Connected'],
    ['bridge', 'starting', 'Starting'],
    ['bridge', 'failed', 'Dropped'],
    ['bridge', 'stopped', 'Stopped'],
    ['staging', 'failed', 'Dropped'],
    ['staging', 'stopped', 'Off'],
  ] as const)('says %s %s as %s', (id, status, word) => {
    expect(statusWord(service(id, status))).toBe(word)
  })
})

describe('detail', () => {
  it.each([
    [3, 'Failed at 14:06 after 3 restarts.'],
    [1, 'Failed at 14:06 after 1 restart.'],
    [0, 'Failed at 14:06.'],
  ])('says when a service gave up, %s restarts in', (restarts, line) => {
    const failed = service('voice', 'failed', {
      cause: 'exited',
      since: at(14, 6),
      restarts,
    })

    expect(detail(failed, NOW)).toBe(
      `${line} Talk shows its voice-off screen meanwhile.`,
    )
  })

  it.each([
    [at(11, 11), 'Connected since 11:11.'],
    [at(23, 5, 21), 'Connected since yesterday 23:05.'],
    [at(9, 0, 3), 'Connected since 3 Nov 09:00.'],
  ])('says since when the bridge is connected', (since, line) => {
    expect(detail(service('bridge', 'up', { since }), NOW)).toBe(line)
  })

  it.each([
    [at(14, 36), 'Frees the card in 12 min.'],
    [
      new Date(2031, 10, 22, 14, 24, 30).toISOString(),
      'Frees the card in under a minute.',
    ],
    [at(14, 23), 'Frees the card in under a minute.'],
  ])('says when the model leaves the card', (freesAt, line) => {
    expect(detail(service('model', 'up', { freesAt }), NOW)).toBe(line)
  })

  it('tells a lost app from a bridge that exited', () => {
    const lost = service('bridge', 'failed', { cause: 'not_answering' })
    const exited = service('bridge', 'failed', {
      cause: 'exited',
      since: at(14, 6),
    })

    expect(detail(lost, NOW)).toBe('Lost the app and could not reconnect.')
    expect(detail(exited, NOW)).toBe(
      'Failed at 14:06. The app cannot reach this PC.',
    )
  })

  it('says voice is served elsewhere rather than off', () => {
    const elsewhere = service('voice', 'up', { cause: 'elsewhere' })

    expect(detail(elsewhere, NOW)).toContain('Something else on this PC')
  })

  it('names Ollama when it does not answer', () => {
    const silent = service('model', 'failed', { cause: 'not_answering' })

    expect(detail(silent, NOW)).toContain('Ollama is not answering')
  })
})

describe('stopAllWarning', () => {
  it.each([
    ['stopped', false],
    ['up', true],
    ['starting', true],
    ['failed', true],
  ] as const)('with staging %s names it: %s', (staging, named) => {
    expect(stopAllWarning(state({ staging })).includes('staging')).toBe(named)
  })
})

describe('the words around them', () => {
  it('says a failed action beside its button', () => {
    expect(failureLine({ on: 'service', id: 'voice', action: 'restart' })).toBe(
      'Voice did not restart. Its log lines say why.',
    )
  })

  it.each([
    [at(14, 6), '14:06:00'],
    [at(18, 2, 21), 'Yesterday 18:02:00'],
    [at(18, 2, 2), '2 Nov 18:02:00'],
  ])('dates a log line from another day', (time, shown) => {
    expect(logTime(time, NOW)).toBe(shown)
  })

  it.each([
    ['ready', true],
    ['failed', true],
    ['turn_ended', false],
    [null, false],
  ])('weighs the event %s as a change: %s', (event, strong) => {
    expect(isStrong({ at: at(14, 0), event, text: '' })).toBe(strong)
  })

  it('prints the PC clock', () => {
    expect(clock(NOW)).toBe('Sat 22 Nov 2031, 14:24')
  })
})

function message(fields: Partial<OwnerMessage> = {}): OwnerMessage {
  return {
    id: 'm1',
    at: at(14, 21),
    role: 'assistant',
    text: 'Xong.',
    status: 'complete',
    model: 'lichtrinh-assistant',
    ...fields,
  }
}

describe('the Messages words', () => {
  it.each([
    ['a finished reply', message(), null],
    [
      'a failed reply with no text',
      message({ status: 'failed', text: '' }),
      'No reply, the turn failed',
    ],
    [
      'a failed reply with some text',
      message({ status: 'failed' }),
      'The turn failed partway',
    ],
    [
      'a stopped reply with no text',
      message({ status: 'stopped', text: ' ' }),
      'No reply, it was stopped',
    ],
    [
      'a stopped reply with some text',
      message({ status: 'stopped' }),
      'Stopped partway',
    ],
  ])('notes %s as %s', (_, shown, expected) => {
    expect(endNote(shown)).toBe(expected)
  })

  it.each([
    ['assistant', 'Reply'],
    ['user', 'Message'],
  ] as const)('calls a row from the %s a %s', (role, expected) => {
    expect(messageKind(message({ role }))).toBe(expected)
  })

  it('says a time today without its day, and an older one with it', () => {
    expect(shortTime(at(11, 38), NOW)).toBe('11:38')
    expect(shortTime(at(22, 5, 21), NOW)).toBe('Yesterday 22:05')
    expect(shortTime(at(9, 0, 19), NOW)).toBe('19 Nov 09:00')
  })

  it('says no last turn before the first', () => {
    expect(lastTurn(null, NOW)).toBe('None yet')
    expect(lastTurn(at(14, 21), NOW)).toBe('14:21')
  })
})
