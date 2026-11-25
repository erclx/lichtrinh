import type { AssistantModel } from '@shared/assistant.ts'
import { assistantModel, MODEL_KEEP_ALIVE } from '@shared/assistant.ts'
import { z } from 'zod'

import { ActionFailed } from '../run.ts'

export interface LoadedModel {
  alias: AssistantModel
  vramBytes: number
  freesAt: Date
}

// Unknown keys drop, since Ollama names more per model than the panel reads.
const loadedList = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      size_vram: z.number().nonnegative(),
      expires_at: z.iso.datetime({ offset: true }),
    }),
  ),
})

const READ_TIMEOUT_MS = 2_000
// Ollama logs every read of its list.
const READ_EVERY_MS = 10_000
// A cold load reads the whole model off the disk.
const LOAD_TIMEOUT_MS = 180_000

/** The assistant aliases on the card, or null while Ollama does not answer. */
export async function loadedModels(
  fetcher: typeof fetch,
  ollamaUrl: string,
): Promise<LoadedModel[] | null> {
  try {
    const response = await fetcher(`${ollamaUrl}/api/ps`, {
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const { models } = loadedList.parse(await response.json())
    return models.flatMap((model) => {
      const alias = assistantModel.safeParse(model.name.replace(/:latest$/, ''))
      if (!alias.success) return []
      return [
        {
          alias: alias.data,
          vramBytes: model.size_vram,
          freesAt: new Date(model.expires_at),
        },
      ]
    })
  } catch {
    return null
  }
}

/**
 * Reads the aliases on the card at most every ten seconds, and at once after
 * `changed`. An unanswered read never stands.
 */
export function createModelReader(
  fetcher: typeof fetch,
  ollamaUrl: string,
  now: () => Date,
) {
  let last: { at: number; models: LoadedModel[] } | undefined
  let changes = 0

  return {
    read: async (): Promise<LoadedModel[] | null> => {
      const at = now().getTime()
      if (last !== undefined && at - last.at < READ_EVERY_MS) return last.models
      const asked = changes
      const models = await loadedModels(fetcher, ollamaUrl)
      // A read the change overtook may hold what was there before it.
      if (models !== null && asked === changes) last = { at, models }
      return models
    },
    changed: () => {
      changes += 1
      last = undefined
    },
  }
}

/** Puts a model on the card, settling once it is there. An abort drops it. */
export async function loadModel(
  fetcher: typeof fetch,
  ollamaUrl: string,
  model: AssistantModel,
  signal?: AbortSignal,
) {
  await keep(fetcher, ollamaUrl, model, MODEL_KEEP_ALIVE, signal)
}

/** Frees a model's memory. Ollama ends a running reply first. */
export async function unloadModel(
  fetcher: typeof fetch,
  ollamaUrl: string,
  model: AssistantModel,
) {
  await keep(fetcher, ollamaUrl, model, 0)
}

// A generate with no prompt only loads or unloads.
async function keep(
  fetcher: typeof fetch,
  ollamaUrl: string,
  model: AssistantModel,
  keepAlive: string | 0,
  signal?: AbortSignal,
) {
  const limit = AbortSignal.timeout(LOAD_TIMEOUT_MS)
  let status: number
  try {
    const response = await fetcher(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, keep_alive: keepAlive, stream: false }),
      signal: signal === undefined ? limit : AbortSignal.any([signal, limit]),
    })
    status = response.status
  } catch (error) {
    throw new ActionFailed('Ollama did not answer', { cause: error })
  }
  if (status !== 200) throw new ActionFailed(`Ollama answered ${status}`)
}
