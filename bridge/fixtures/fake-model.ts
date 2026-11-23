import type { ChatChunk, ChatRequest, TurnModel } from '../ollama.ts'

/** One round of the model's stream: the chunks it yields, then its end. */
export type Round = ChatChunk[] | { fail: Error } | 'hang'

/**
 * A stand-in for one turn's Ollama client that plays scripted rounds, one
 * per chat request, and records every request it was sent. A `hang` round
 * yields nothing until the turn aborts it.
 */
export function fakeModel(rounds: Round[]) {
  const requests: ChatRequest[] = []
  let aborted = false
  let wake: () => void = () => {}
  const model: TurnModel = {
    async chat(request) {
      requests.push(structuredClone(request))
      const round = rounds[Math.min(requests.length, rounds.length) - 1]
      if (round === undefined) throw new Error('The script ran out of rounds')
      if (!Array.isArray(round) && round !== 'hang') throw round.fail
      return (async function* () {
        if (round !== 'hang') {
          for (const chunk of round) yield chunk
        } else if (!aborted) {
          await new Promise<void>((resolve) => {
            wake = resolve
          })
        }
        if (aborted) throw new DOMException('Aborted', 'AbortError')
      })()
    },
    abort() {
      aborted = true
      wake()
    },
  }
  return { model, requests, wasAborted: () => aborted }
}

export function text(content: string): ChatChunk {
  return { message: { role: 'assistant', content } }
}

export function thought(thinking: string): ChatChunk {
  return { message: { role: 'assistant', content: '', thinking } }
}

export function calls(
  ...called: { name: string; arguments: Record<string, unknown> }[]
): ChatChunk {
  return {
    message: {
      role: 'assistant',
      content: '',
      tool_calls: called.map((fn) => ({ function: fn })),
    },
  }
}
