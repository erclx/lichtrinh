import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

import type { PanelState } from '../state.ts'
import type { Press } from './copy.ts'
import { usePanelState } from './use-panel-state.ts'

const STATE: PanelState = {
  readAt: '2031-11-22T14:24:00.000Z',
  services: [],
  gpu: null,
  app: { reach: 'unset' },
}
const RESTART: Press = { on: 'service', id: 'bridge', action: 'restart' }

/** A panel server answering reads and presses as a test sets them. */
function server() {
  const requests: string[] = []
  const answers: Record<'state' | 'press', () => Response | Promise<Response>> =
    {
      state: () => Response.json(STATE),
      press: () => Response.json({ ok: true }),
    }
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? 'GET'} ${path}`)
    return path === '/api/state' ? answers.state() : answers.press()
  })
  return { requests, answers }
}

async function mounted() {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result, unmount } = renderHook(() => usePanelState(), { wrapper })
  await waitFor(() => expect(result.current.state).toEqual(STATE))
  return { result, unmount }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('usePanelState', () => {
  it('reads again right after a press ends', async () => {
    const { requests } = server()
    const { result } = await mounted()

    await act(() => result.current.press(RESTART))

    expect(requests).toEqual([
      'GET /api/state',
      'POST /api/services/bridge/restart',
      'GET /api/state',
    ])
    expect(result.current).toMatchObject({ pending: [], failure: null })
  })

  it('holds a press as pending until it answers', async () => {
    const { answers } = server()
    const { result } = await mounted()
    let answer: (response: Response) => void = () => {}
    answers.press = () =>
      new Promise<Response>((resolve) => {
        answer = resolve
      })

    let pressed: Promise<void> | undefined
    act(() => {
      pressed = result.current.press({ on: 'all', action: 'stop' })
    })

    expect(result.current.pending).toEqual([{ on: 'all', action: 'stop' }])
    await act(async () => {
      answer(Response.json({ ok: true }))
      await pressed
    })
    expect(result.current.pending).toEqual([])
  })

  it('keeps a refused press as the failure until the next one', async () => {
    const { answers } = server()
    const { result } = await mounted()
    answers.press = () =>
      Response.json(
        { error: { code: 'action_failed', message: 'exited 1' } },
        { status: 502 },
      )

    await act(() => result.current.press(RESTART))
    expect(result.current.failure).toEqual(RESTART)

    answers.press = () => Response.json({ ok: true })
    await act(() => result.current.press(RESTART))
    expect(result.current.failure).toBeNull()
  })

  it('keeps the last read, marked stale, while a later one fails', async () => {
    const { answers } = server()
    const { result } = await mounted()
    answers.state = () => new Response('', { status: 500 })

    await act(() => result.current.press(RESTART))

    await waitFor(() => expect(result.current.stale).toBe(true))
    expect(result.current.state).toEqual(STATE)
  })

  it('reads every three seconds on its own', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { requests } = server()
    await mounted()

    await act(() => vi.advanceTimersByTimeAsync(6_100))

    expect(requests).toEqual([
      'GET /api/state',
      'GET /api/state',
      'GET /api/state',
    ])
  })
})
