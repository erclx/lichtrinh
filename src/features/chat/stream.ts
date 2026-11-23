import type { ChatEvent, SendMessageRequest } from '@shared/chats.ts'
import { chatEvent } from '@shared/chats.ts'

import { ApiFailure, failureFrom } from '@/lib/api'

/**
 * Sends one message, throwing `ApiFailure` on a refused or unanswered send,
 * and answers its events, whose iteration throws on a connection lost
 * partway. Aborting `signal` stops the turn, keeping what it changed.
 */
export async function sendMessage(
  chatId: string,
  request: SendMessageRequest,
  signal: AbortSignal,
): Promise<AsyncIterable<ChatEvent>> {
  let response: Response
  try {
    response = await fetch(
      `/api/chats/${encodeURIComponent(chatId)}/messages`,
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      },
    )
  } catch (error) {
    if (signal.aborted) throw error
    throw new ApiFailure('network', 0, null)
  }
  if (!response.ok) throw await failureFrom(response)
  if (response.body === null) {
    throw new ApiFailure('unexpected_response', response.status, null)
  }
  return eventsOf(response.body)
}

async function* eventsOf(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    pending += decoder.decode(value, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      const event = parseLine(line)
      if (event !== null) yield event
    }
  }
  const last = parseLine(pending + decoder.decode())
  if (last !== null) yield last
}

// A line the app cannot read is skipped rather than thrown, since throwing
// cancels the stream and the API reads a cancel as the traveler's Stop. The
// saved reply on `done` carries the whole text either way.
function parseLine(line: string): ChatEvent | null {
  if (line.trim() === '') return null
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return null
  }
  const parsed = chatEvent.safeParse(raw)
  return parsed.success ? parsed.data : null
}
