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

/** Puts a model on the card, settling once it is there. */
export async function loadModel(
  fetcher: typeof fetch,
  ollamaUrl: string,
  model: AssistantModel,
) {
  await keep(fetcher, ollamaUrl, model, MODEL_KEEP_ALIVE)
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
) {
  let status: number
  try {
    const response = await fetcher(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, keep_alive: keepAlive, stream: false }),
      signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
    })
    status = response.status
  } catch (error) {
    throw new ActionFailed('Ollama did not answer', { cause: error })
  }
  if (status !== 200) throw new ActionFailed(`Ollama answered ${status}`)
}
