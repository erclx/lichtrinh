import type { AssistantModel } from '@shared/assistant.ts'
import { assistantModel } from '@shared/assistant.ts'
import type { OfferedTool } from '@shared/assistant-tools.ts'
import type { Message } from 'ollama/browser'
import { Ollama } from 'ollama/browser'

// Keeps the model loaded between the traveler's messages, so a reply does
// not pay the load again, and lets it go after a quiet quarter hour so the
// graphics card is free for voice.
const KEEP_ALIVE = '15m'

export type { Message }

/** One streamed piece of a reply. */
export interface ChatChunk {
  message: Message
}

export interface ChatRequest {
  model: AssistantModel
  messages: Message[]
  tools: OfferedTool[]
}

/**
 * One turn's line to Ollama. Its client aborts every stream it opened, so
 * each turn takes its own and a cancel stops that turn alone.
 */
export interface TurnModel {
  chat: (request: ChatRequest) => Promise<AsyncIterable<ChatChunk>>
  abort: () => void
}

/** A fresh client for one turn, streaming with thinking on. */
export function turnModel(host: string): TurnModel {
  const client = new Ollama({ host })
  return {
    chat: (request) =>
      client.chat({
        ...request,
        stream: true,
        think: true,
        keep_alive: KEEP_ALIVE,
      }),
    abort: () => client.abort(),
  }
}

/** Loads a model ahead of a turn, so the first reply skips the load. */
export async function warm(host: string, model: AssistantModel) {
  await new Ollama({ host }).chat({
    model,
    messages: [],
    keep_alive: KEEP_ALIVE,
  })
}

/** Frees the model's memory now, as the bridge stops. */
export async function unload(host: string, model: AssistantModel) {
  await new Ollama({ host }).chat({ model, messages: [], keep_alive: 0 })
}

/** The assistant aliases Ollama holds, from its model list. */
export async function available(host: string): Promise<AssistantModel[]> {
  const { models } = await new Ollama({ host }).list()
  const names = new Set(
    models.map((model) => model.name.replace(/:latest$/, '')),
  )
  return assistantModel.options.filter((alias) => names.has(alias))
}
