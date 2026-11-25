import { DEFAULT_ASSISTANT_MODEL } from '@shared/assistant.ts'

import type { ServiceId } from '../services.ts'
import { serviceOf, SERVICES, TARGET } from '../services.ts'
import type { AllAction, LogLine, PanelState, ServiceAction } from '../state.ts'
import { createGpuReader } from './adapters/gpu.ts'
import { connectionEvents, recentLines } from './adapters/journal.ts'
import { loadedModels, loadModel, unloadModel } from './adapters/ollama.ts'
import {
  restartUnits,
  showUnits,
  startUnits,
  stopUnits,
} from './adapters/systemd.ts'
import { voiceAnswers } from './adapters/voice.ts'
import type { PanelConfig } from './config.ts'
import type { Run } from './run.ts'
import type { LoadProgress } from './state.ts'
import { buildState } from './state.ts'

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
  let load: LoadProgress = 'idle'
  let pending: AbortController | undefined

  // Answers before the model is on the card, since a cold load takes a while.
  async function startLoad() {
    pending?.abort()
    const mine = new AbortController()
    pending = mine
    load = 'loading'
    const settle = (progress: LoadProgress) => {
      if (pending === mine) load = progress
    }
    void loadModel(
      fetcher,
      config.ollamaUrl,
      DEFAULT_ASSISTANT_MODEL,
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
  }

  async function read() {
    const [unit, answers, models, card, bridge, staging, logs] =
      await Promise.all([
        showUnits(run, UNITS),
        voiceAnswers(fetcher, config.voiceUrl),
        loadedModels(fetcher, config.ollamaUrl),
        readCard(),
        connectionEvents(run, serviceOf('bridge')),
        connectionEvents(run, serviceOf('staging')),
        readLogs(run),
      ])
    return buildState(
      {
        unit,
        voiceAnswers: answers,
        models,
        load,
        connections: { bridge, staging },
        logs,
        card,
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

async function readLogs(run: Run): Promise<Record<ServiceId, LogLine[]>> {
  const [voice, model, bridge, staging] = await Promise.all([
    recentLines(run, serviceOf('voice')),
    recentLines(run, serviceOf('model')),
    recentLines(run, serviceOf('bridge')),
    recentLines(run, serviceOf('staging')),
  ])
  return { voice, model, bridge, staging }
}
