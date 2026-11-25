import { randomUUID } from 'node:crypto'

import { serviceOf, SERVICES, TARGET } from '../../services.ts'
import type { PanelConfig } from '../config.ts'
import type { Tools } from '../machine.ts'
import type { CommandResult } from '../run.ts'

export const FAKE_CONFIG: PanelConfig = {
  port: 4180,
  ollamaUrl: 'http://127.0.0.1:11434',
  voiceUrl: 'http://127.0.0.1:8770',
}

interface FakeUnit {
  active: string
  restarts: number
  invocationId: string
  since: Date | null
}

interface FakeLine {
  at: Date
  message: string
  fromSystemd: boolean
  invocationId: string
}

const CARD_MIB = 32_768
const DESKTOP_MIB = 3_891
const VOICE_MIB = 3_277
const MODEL_MIB = 22_630
const KEEP_MS = 12 * 60_000

const MODEL_ALIAS = 'lichtrinh-assistant'

export const SCENARIOS = [
  'failed',
  'up',
  'stopped',
  'staging',
  'dropped',
  'refusing',
] as const
export type Scenario = (typeof SCENARIOS)[number]

/**
 * A workspace PC in memory. Its `run` and `fetch` answer as systemd, the
 * journal, the card, Ollama, and voice would, and its actions move that state,
 * so a journey sees what each press does.
 */
export function createFakeMachine(now: () => Date) {
  const commands: string[] = []
  const units = new Map<string, FakeUnit>()
  const lines = new Map<string, FakeLine[]>()
  const refused = new Set<string>()
  let modelUntil: Date | null = null
  let ollamaUp = true

  const unitOf = (name: string): FakeUnit => {
    const unit = units.get(name) ?? {
      active: 'inactive',
      restarts: 0,
      invocationId: '',
      since: null,
    }
    units.set(name, unit)
    return unit
  }

  const write = (
    name: string,
    message: string,
    { at = now(), fromSystemd = false } = {},
  ) => {
    const list = lines.get(name) ?? []
    list.unshift({
      at,
      message,
      fromSystemd,
      invocationId: unitOf(name).invocationId,
    })
    lines.set(name, list)
  }

  const start = (name: string, at = now()) => {
    const unit = unitOf(name)
    if (unit.active === 'active') return
    units.set(name, {
      active: 'active',
      restarts: 0,
      invocationId: randomUUID(),
      since: at,
    })
    write(name, `Started ${name}.`, { at, fromSystemd: true })
    if (name !== serviceOf('voice').unit) {
      write(name, '{"event":"connecting"}', { at })
      write(name, '{"event":"ready"}', { at })
    }
  }

  const stop = (name: string) => {
    if (unitOf(name).active === 'inactive') return
    units.set(name, { ...unitOf(name), active: 'inactive', since: now() })
    write(name, `Stopped ${name}.`, { fromSystemd: true })
  }

  /** Crashes a unit the way systemd gives up on one, three starts in. */
  const crash = (name: string, reason: string) => {
    const ended = minutesAgo(18)
    lines.delete(name)
    const before = (seconds: number) =>
      new Date(ended.getTime() - seconds * 1000)
    units.set(name, {
      active: 'failed',
      restarts: 3,
      invocationId: randomUUID(),
      since: ended,
    })
    const systemd = (message: string, seconds: number) =>
      write(name, `${name}: ${message}`, {
        at: before(seconds),
        fromSystemd: true,
      })
    systemd('Scheduled restart job, restart counter is at 1.', 85)
    systemd('Scheduled restart job, restart counter is at 2.', 57)
    write(name, reason, { at: before(1) })
    systemd('Main process exited, code=exited, status=1/FAILURE', 1)
    systemd('Scheduled restart job, restart counter is at 3.', 0)
    systemd('Start request repeated too quickly.', 0)
  }

  const voiceUnit = serviceOf('voice').unit
  const bridgeUnit = serviceOf('bridge').unit
  const modelUnit = serviceOf('model').unit
  const minutesAgo = (minutes: number) =>
    new Date(now().getTime() - minutes * 60_000)

  /** Voice, the bridge, and a loaded model, some turns into the day. */
  const bringUp = () => {
    start(bridgeUnit, minutesAgo(193))
    start(voiceUnit, minutesAgo(193))
    modelUntil = new Date(now().getTime() + KEEP_MS)
    const at = minutesAgo(3)
    write(bridgeUnit, '{"event":"turn_started","turnId":"7f2e"}', { at })
    write(bridgeUnit, '{"event":"turn_ended","turnId":"7f2e","ms":2400}', {
      at,
    })
    write(modelUnit, '[GIN] | 200 |  2.4s | 127.0.0.1 | POST     "/api/chat"', {
      at,
    })
  }

  const scenarios: Record<Scenario, () => void> = {
    failed: () => {
      bringUp()
      crash(voiceUnit, 'worker out of memory on load')
    },
    up: bringUp,
    stopped: () => {},
    staging: () => {
      bringUp()
      start(serviceOf('staging').unit)
    },
    dropped: () => {
      bringUp()
      write(bridgeUnit, '{"event":"closed","code":1006}', { at: minutesAgo(2) })
      write(bridgeUnit, '{"event":"connecting"}')
    },
    refusing: () => {
      bringUp()
      refused.add(voiceUnit)
    },
  }

  const enter = (scenario: Scenario) => {
    commands.length = 0
    units.clear()
    lines.clear()
    refused.clear()
    modelUntil = null
    ollamaUp = true
    scenarios[scenario]()
  }

  const systemctl = (verb: string, args: string[]): Partial<CommandResult> => {
    if (verb === 'show') {
      return { stdout: args.filter(isUnit).map(showUnit).join('\n') }
    }
    if (verb === 'reset-failed') return {}
    if (args.some((name) => refused.has(name))) return { code: 1 }
    const named = args.flatMap((name) =>
      name === TARGET
        ? SERVICES.filter((service) => service.inTarget).map(({ unit }) => unit)
        : [name],
    )
    for (const name of named) {
      if (verb === 'stop' || verb === 'restart') stop(name)
      if (verb === 'start' || verb === 'restart') start(name)
    }
    return {}
  }

  const showUnit = (name: string) => {
    const unit = unitOf(name)
    const at = unit.since === null ? '' : `@${toSeconds(unit.since)}`
    return [
      `Id=${name}`,
      `ActiveState=${unit.active}`,
      `NRestarts=${unit.restarts}`,
      `InvocationID=${unit.invocationId}`,
      `ActiveEnterTimestamp=${at}`,
      `StateChangeTimestamp=${at}`,
      '',
    ].join('\n')
  }

  const journalctl = (args: string[]): Partial<CommandResult> => {
    const name = args.find((arg) => arg.startsWith('--unit='))?.slice(7) ?? ''
    const grep = args.find((arg) => arg.startsWith('--grep='))?.slice(7) ?? ''
    const shown = (lines.get(name) ?? []).filter((line) =>
      new RegExp(grep).test(line.message),
    )
    return {
      code: shown.length > 0 ? 0 : 1,
      stdout: shown.map(toJournal).join('\n'),
    }
  }

  const run: Tools['run'] = async (command) => {
    commands.push(command.join(' '))
    const [file, ...args] = command
    const answer = (): Partial<CommandResult> => {
      if (file === 'systemctl') return systemctl(args[1] ?? '', args.slice(2))
      if (file === 'journalctl') return journalctl(args)
      const voice = unitOf(voiceUnit).active === 'active' ? VOICE_MIB : 0
      const model = modelUntil === null ? 0 : MODEL_MIB
      return { stdout: `${CARD_MIB}, ${DESKTOP_MIB + voice + model}\n` }
    }
    return { code: 0, stdout: '', stderr: '', ...answer() }
  }

  const ollama = (path: string, body: unknown): Response => {
    if (path === '/api/generate') {
      const unload =
        typeof body === 'object' &&
        body !== null &&
        'keep_alive' in body &&
        body.keep_alive === 0
      modelUntil = unload ? null : new Date(now().getTime() + KEEP_MS)
      return Response.json({})
    }
    const models =
      modelUntil === null
        ? []
        : [
            {
              name: `${MODEL_ALIAS}:latest`,
              size_vram: MODEL_MIB * 1024 ** 2,
              expires_at: modelUntil.toISOString(),
            },
          ]
    return Response.json({ models })
  }

  const fetcher = (async (input: string, init?: RequestInit) => {
    const url = new URL(input)
    commands.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.origin === FAKE_CONFIG.ollamaUrl && ollamaUp) {
      return ollama(url.pathname, JSON.parse(String(init?.body ?? 'null')))
    }
    if (
      url.origin === FAKE_CONFIG.voiceUrl &&
      unitOf(voiceUnit).active === 'active'
    ) {
      return Response.json({ status: 'ok' })
    }
    throw new TypeError('connection refused')
  }) as typeof fetch

  const tools: Tools = { run, fetch: fetcher, now }
  return {
    tools,
    /** Every command and request since the last `enter`, in order. */
    commands,
    enter,
    startUnit: start,
    /** Makes systemd refuse every action on a unit. */
    refuse: (name: string) => refused.add(name),
    stopOllama: () => {
      ollamaUp = false
    },
  }
}

function isUnit(arg: string) {
  return !arg.startsWith('--')
}

function toSeconds(at: Date) {
  return Math.floor(at.getTime() / 1000)
}

function toJournal(line: FakeLine) {
  return JSON.stringify({
    __REALTIME_TIMESTAMP: String(line.at.getTime() * 1000),
    MESSAGE: line.message,
    ...(line.fromSystemd
      ? { SYSLOG_IDENTIFIER: 'systemd' }
      : { _SYSTEMD_INVOCATION_ID: line.invocationId }),
  })
}
