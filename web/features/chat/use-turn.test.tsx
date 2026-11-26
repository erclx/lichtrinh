import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'

import { useTurn } from '@/features/chat/use-turn'
import { fakeApi } from '@/test/fake-api'
import { isHeld } from '@/update/holds'

/** A send's answer that stays open until `end` is called. */
function anOpenStream() {
  let end = () => {}
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      end = () => controller.close()
    },
  })
  const response = new Response(body, {
    headers: { 'content-type': 'application/x-ndjson' },
  })
  return { response, end: () => end() }
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useTurn holding a release', () => {
  it('holds from the send to the end of the stream, after its page leaves', async () => {
    const stream = anOpenStream()
    fakeApi({ 'POST /chats/chat-today/messages': () => stream.response })
    const { result, unmount } = renderHook(() => useTurn('chat-today'), {
      wrapper,
    })

    let sent: Promise<boolean> = Promise.resolve(false)
    act(() => {
      sent = result.current.send('pho sang mai luc 7 gio')
    })
    unmount()

    expect(isHeld()).toBe(true)
    stream.end()
    await sent
    expect(isHeld()).toBe(false)
  })

  it('lets go when the send is turned away', async () => {
    fakeApi({})
    const { result } = renderHook(() => useTurn('chat-today'), { wrapper })

    let accepted = true
    await act(async () => {
      accepted = await result.current.send('pho sang mai luc 7 gio')
    })

    expect(accepted).toBe(false)
    expect(isHeld()).toBe(false)
  })
})
