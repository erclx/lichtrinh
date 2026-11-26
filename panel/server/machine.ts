import type { ServiceId } from '../services.ts'
import { serviceOf, SERVICES, TARGET } from '../services.ts'
import type { AllAction, LogLine, PanelState, ServiceAction } from '../state.ts'
import { createGpuReader } from './adapters/gpu.ts'
import { createJournalReader } from './adapters/journal.ts'
import {
  createModelReader,
  loadedModels,
  loadModel,
  unloadModel,
} from './adapters/ollama.ts'
import type { AppRead } from './adapters/owner.ts'
import { createOwnerReader } from './adapters/owner.ts'
import {
  restartUnits,
  showUnits,
  startUnits,
  stopUnits,
} from './adapters/systemd.ts'
import { createVoiceReader } from './adapters/voice.ts'
import type { PanelConfig } from './config.ts'
import type { Run } from './run.ts'
import type { LoadProgress } from './state.ts'
import { buildState, loadModelOf } from './state.ts'

/** The outside world, handed in so tests and the e2e server fake it. */
export interface Tools {
  run: Run
  fetch: typeof fetch
  now: () => Date
}

/** The workspace PC as the panel reads and drives it. */
export interface Machine {
  read: () => Promise<PanelState>
  /** Undefined for an action the service does not offer. */
  actionOf: (
    id: ServiceId,
    action: ServiceAction,
  ) => (() => Promise<void>) | undefined
  all: (action: AllAction) => Promise<void>
}

const UNITS = SERVICES.filter((service) => service.manager === 'user').map(
  (service) => service.unit,
)
const TARGET_UNITS = SERVICES.filter((service) => service.inTarget).map(
  (service) => service.unit,
)

export function createMachine(tools: Tools, config: PanelConfig): Machine {
  const { run, fetch: fetcher, now } = tools
  const readCard = createGpuReader(run, now)
  const readVoice = createVoiceReader(fetcher, config.voiceUrl, now)
  const loaded = createModelReader(fetcher, config.ollamaUrl, now)
  const journal = createJournalReader(run, now)
  const readApp =
    config.app === null
      ? () => Promise.resolve(null)
      : createOwnerReader(fetcher, config.app, now)
  let app: AppRead | null = null
  let load: LoadProgress = 'idle'
  let pending: AbortController | undefined

  // Answers before the model is on the card, since a cold load takes a while.
  async function startLoad() {
    pending?.abort()
    const mine = new AbortController()
    pending = mine
    load = 'loading'
    const settle = (progress: LoadProgress) => {
      if (pending !== mine) return
      load = progress
      loaded.changed()
    }
    void loadModel(
      fetcher,
      config.ollamaUrl,
      loadModelOf(app),
      mine.signal,
    ).then(
      () => settle('idle'),
      () => settle('failed'),
    )
  }

  async function unload() {
    // Ollama drops a load whose caller hung up, which no unload reaches.
    pending?.abort()
    pending = undefined
    const models = (await loadedModels(fetcher, config.ollamaUrl)) ?? []
    await Promise.all(
      models.map(({ alias }) => unloadModel(fetcher, config.ollamaUrl, alias)),
    )
    load = 'idle'
    loaded.changed()
  }

  async function read() {
    const unit = await showUnits(run, UNITS)
    const voice = unit(serviceOf('voice').unit)
    const runSince = (id: ServiceId) => unit(serviceOf(id).unit).activeSince
    // A model on its way up may land at any read.
    if (load === 'loading') loaded.changed()
    const [answers, models, card, bridge, staging, logs, appRead] =
      await Promise.all([
        readVoice(voice.active === 'active' ? voice.invocationId : null),
        loaded.read(),
        readCard(),
        journal.connectionEvents('bridge', runSince('bridge')),
        journal.connectionEvents('staging', runSince('staging')),
        readLogs(journal.recentLines),
        readApp(),
      ])
    // Load takes the admin's pick from the last read that reached the app.
    if (appRead?.reach === 'read') app = appRead
    return buildState(
      {
        unit,
        voiceAnswers: answers,
        models,
        load,
        connections: { bridge, staging },
        logs,
        card,
        app: appRead,
      },
      now(),
    )
  }

  function actionOf(id: ServiceId, action: ServiceAction) {
    const units = [serviceOf(id).unit]
    const offered: Partial<Record<ServiceAction, () => Promise<void>>> =
      id === 'model'
        ? { load: startLoad, unload }
        : {
            start: () => startUnits(run, units),
            stop: () => stopUnits(run, units),
            restart: () => restartUnits(run, units),
          }
    return offered[action]
  }

  async function all(action: AllAction) {
    if (action === 'start') {
      await startUnits(run, TARGET_UNITS, TARGET)
      if (load === 'failed') await startLoad()
      return
    }
    // The target alone would leave a unit started outside it.
    await stopUnits(run, [TARGET, ...UNITS])
    await unload()
  }

  return { read, actionOf, all }
}

async function readLogs(
  recentLines: (id: ServiceId) => Promise<LogLine[]>,
): Promise<Record<ServiceId, LogLine[]>> {
  const [voice, model, bridge, staging] = await Promise.all([
    recentLines('voice'),
    recentLines('model'),
    recentLines('bridge'),
    recentLines('staging'),
  ])
  return { voice, model, bridge, staging }
}
