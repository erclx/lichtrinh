import type { ChatEvent, ChatMessage } from '@shared/chats.ts'

import { sendMessage } from '@/features/chat/stream'
import { ApiFailure } from '@/lib/api'

const request = { id: '5b0c2b8e-6f4c-4b8e-9a51-0c6a1f6f6a01', text: 'an pho' }

function aReply(): ChatMessage {
  return {
    id: 'reply-1',
    role: 'assistant',
    text: 'Added.',
    status: 'complete',
    model: 'lichtrinh-assistant',
    at: '2031-05-15T02:00:00.000Z',
    changes: [],
  }
}

/** A streamed answer whose body arrives in exactly these pieces. */
function streamOf(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, {
    headers: { 'content-type': 'application/x-ndjson' },
  })
}

function respondWith(response: Response | Error) {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof globalThis.fetch>(async () => {
      if (response instanceof Error) throw response
      return response
    }),
  )
}

async function collect(events: AsyncIterable<ChatEvent>) {
  const seen: ChatEvent[] = []
  for await (const event of events) seen.push(event)
  return seen
}

async function refusalOf(promise: Promise<unknown>): Promise<ApiFailure> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ApiFailure) return error
    throw error
  }
  throw new Error('expected the send to be refused')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sendMessage', () => {
  it('reads an event split across two chunks as one event', async () => {
    const done = JSON.stringify({ type: 'done', message: aReply() })
    respondWith(
      streamOf([
        '{"type":"delta","te',
        'xt":"Add"}\n',
        done.slice(0, 20),
        `${done.slice(20)}\n`,
      ]),
    )

    const events = await collect(
      await sendMessage('chat-1', request, new AbortController().signal),
    )

    expect(events).toEqual([
      { type: 'delta', text: 'Add' },
      { type: 'done', message: aReply() },
    ])
  })

  it('reads a last event that ends without a newline', async () => {
    respondWith(streamOf(['{"type":"change","changeId":"change-1"}']))

    const events = await collect(
      await sendMessage('chat-1', request, new AbortController().signal),
    )

    expect(events).toEqual([{ type: 'change', changeId: 'change-1' }])
  })

  it('skips a malformed line and keeps reading', async () => {
    respondWith(
      streamOf([
        'not json\n',
        '{"type":"delta","nope":1}\n',
        '{"type":"delta","text":"ok"}\n',
      ]),
    )

    const events = await collect(
      await sendMessage('chat-1', request, new AbortController().signal),
    )

    expect(events).toEqual([{ type: 'delta', text: 'ok' }])
  })

  it('throws the refusal code when the send is refused', async () => {
    respondWith(
      Response.json(
        { error: { code: 'assistant_busy', message: 'English text' } },
        { status: 409 },
      ),
    )

    const failure = await refusalOf(
      sendMessage('chat-1', request, new AbortController().signal),
    )

    expect(failure.code).toBe('assistant_busy')
  })

  it('throws network when no answer arrives', async () => {
    respondWith(new TypeError('Failed to fetch'))

    const failure = await refusalOf(
      sendMessage('chat-1', request, new AbortController().signal),
    )

    expect(failure.code).toBe('network')
  })

  it('posts the request to the chat it names', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => streamOf([]))
    vi.stubGlobal('fetch', fetch)

    await collect(
      await sendMessage('chat 1', request, new AbortController().signal),
    )

    const [path, init] = fetch.mock.calls[0] ?? []
    expect(path).toBe('/api/chats/chat%201/messages')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual(request)
  })
})
