import type { ServiceId } from '../services.ts'
import { SERVICES } from '../services.ts'
import type { GpuState, LogLine, PanelState, ServiceState } from '../state.ts'
import type { CardMemory } from './adapters/gpu.ts'
import type { ConnectionEvent } from './adapters/journal.ts'
import type { LoadedModel } from './adapters/ollama.ts'
import type { UnitState } from './adapters/systemd.ts'

/** What the panel itself knows of the last Load it asked for. */
export type LoadProgress = 'idle' | 'loading' | 'failed'

export interface Readings {
  unit: (unit: string) => UnitState
  voiceAnswers: boolean
  /** Null while Ollama does not answer. */
  models: LoadedModel[] | null
  load: LoadProgress
  /** Newest first, across each bridge's runs. */
  connections: Record<'bridge' | 'staging', ConnectionEvent[]>
  logs: Record<ServiceId, LogLine[]>
  card: CardMemory | null
}

/** The status fields, ahead of the service's id and its log. */
type Status = Omit<ServiceState, 'id' | 'logs'>

// The bridge redials forever, so a run this long without an answer has lost
// its app rather than blinked.
const DROPPED_AFTER_MS = 30_000
// A cold start imports the speech libraries before it listens.
const VOICE_GRACE_MS = 60_000

export function buildState(readings: Readings, now: Date): PanelState {
  return {
    readAt: now.toISOString(),
    services: SERVICES.map(({ id, unit }) => ({
      id,
      ...statusOf(id, readings.unit(unit), readings, now),
      logs: readings.logs[id],
    })),
    gpu: gpuState(readings),
  }
}

function statusOf(
  id: ServiceId,
  unit: UnitState,
  readings: Readings,
  now: Date,
): Status {
  if (id === 'model') return modelStatus(readings)
  if (id === 'voice') return voiceStatus(unit, readings.voiceAnswers, now)
  return bridgeStatus(unit, readings.connections[id], now)
}

/** What systemd alone says, or null for a unit whose process runs. */
function unitStatus(unit: UnitState): Status | null {
  switch (unit.active) {
    case 'active':
    case 'reloading':
      return null
    case 'activating':
      return status('starting')
    case 'deactivating':
      return status('stopping')
    case 'failed':
      return {
        ...status('failed', 'exited', unit.changedAt),
        restarts: unit.restarts,
      }
    default:
      return status('stopped')
  }
}

function voiceStatus(unit: UnitState, answers: boolean, now: Date): Status {
  const stated = unitStatus(unit)
  if (stated === null) {
    if (answers) return status('up', null, unit.activeSince)
    return elapsed(unit.activeSince, now) < VOICE_GRACE_MS
      ? status('starting')
      : status('failed', 'not_answering', unit.activeSince)
  }
  const ended = stated.status === 'failed' || stated.status === 'stopped'
  return ended && answers ? status('up', 'elsewhere') : stated
}

function bridgeStatus(
  unit: UnitState,
  events: ConnectionEvent[],
  now: Date,
): Status {
  const stated = unitStatus(unit)
  if (stated !== null) return stated
  const run = events.filter((event) => event.invocationId === unit.invocationId)
  const [last] = run
  if (last?.event === 'ready') return status('up', null, last.at)
  const ready = run.findIndex((event) => event.event === 'ready')
  const lost = ready > 0 ? run[ready - 1] : undefined
  const since = lost?.at ?? unit.activeSince
  return elapsed(since, now) < DROPPED_AFTER_MS
    ? status('starting')
    : status('failed', 'not_answering', since)
}

function modelStatus({ models, load }: Readings): Status {
  if (models === null) return status('failed', 'not_answering')
  const [first, ...others] = models
  if (first !== undefined) {
    const freesAt = others.reduce(
      (latest, model) => (model.freesAt > latest ? model.freesAt : latest),
      first.freesAt,
    )
    return { ...status('up'), freesAt: freesAt.toISOString() }
  }
  if (load === 'loading') return status('starting')
  if (load === 'failed') return status('failed', 'load_failed')
  return status('stopped')
}

function gpuState({ card, models }: Readings): GpuState | null {
  if (card === null) return null
  return {
    ...card,
    models: (models ?? []).map(({ alias, vramBytes }) => ({
      alias,
      vramMiB: vramBytes / 1024 ** 2,
    })),
  }
}

function status(
  name: Status['status'],
  cause: Status['cause'] = null,
  since: Date | null = null,
): Status {
  return {
    status: name,
    cause,
    since: since?.toISOString() ?? null,
    restarts: 0,
    freesAt: null,
  }
}

// A run with no start time has waited long enough to say so.
function elapsed(since: Date | null, now: Date): number {
  return since === null ? Infinity : now.getTime() - since.getTime()
}
