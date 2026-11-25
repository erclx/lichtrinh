import type { Change } from '@shared/changes.ts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { useChangeUndo } from '@/components/change-undo'
import { anAddChange } from '@/test/chat'
import { failure, fakeApi, json, offline } from '@/test/fake-api'

const undoPath = 'POST /changes/change-breakfast/undo'

function undone() {
  return json({ change: anAddChange({ id: 'change-undo', op: 'undo' }) })
}

function undoIdOf(body: unknown): unknown {
  return typeof body === 'object' && body !== null && 'undoId' in body
    ? body.undoId
    : undefined
}

interface ShownProps {
  shown: Change
  restoredBy?: string
}

function renderUndo(
  change: Change,
  onUndone?: (undo: Change) => void,
  restoredBy?: string,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  const initialProps: ShownProps = { shown: change, restoredBy }
  return renderHook(
    (props: ShownProps) =>
      useChangeUndo(props.shown, { onUndone, restoredBy: props.restoredBy }),
    { wrapper, initialProps },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useChangeUndo', () => {
  it('starts ready for a change that stands', () => {
    const { result } = renderUndo(anAddChange())

    expect(result.current.outcome).toBe('ready')
  })

  it('starts undone for a change already undone', () => {
    const { result } = renderUndo(anAddChange({ undoneBy: 'change-undo' }))

    expect(result.current.outcome).toBe('undone')
  })

  it('reads undone once a refresh says another device undid it', () => {
    const { result, rerender } = renderUndo(anAddChange())

    rerender({ shown: anAddChange({ undoneBy: 'change-undo' }) })

    expect(result.current.outcome).toBe('undone')
  })

  it('passes the undo it made to the caller', async () => {
    fakeApi({ [undoPath]: undone })
    const undos: string[] = []
    const { result } = renderUndo(anAddChange(), ({ id }) => undos.push(id))

    act(() => result.current.run())

    await waitFor(() => expect(result.current.outcome).toBe('undone'))
    expect(undos).toEqual(['change-undo'])
  })

  it.each([
    ['undo_conflict', 'conflict'],
    ['already_undone', 'alreadyUndone'],
    ['entries_outside_range', 'outsideDates'],
    ['currency_has_costs', 'otherCurrency'],
    ['internal_error', 'failed'],
  ] as const)('reads %s as %s', async (code, outcome) => {
    fakeApi({ [undoPath]: () => failure(code, 409) })
    const { result } = renderUndo(anAddChange())

    act(() => result.current.run())

    await waitFor(() => expect(result.current.outcome).toBe(outcome))
  })

  it('keeps the plain refusal after a refresh confirms the other undo', async () => {
    fakeApi({ [undoPath]: () => failure('already_undone', 409) })
    const { result, rerender } = renderUndo(anAddChange())
    act(() => result.current.run())
    await waitFor(() => expect(result.current.outcome).toBe('alreadyUndone'))

    rerender({ shown: anAddChange({ undoneBy: 'change-undo' }) })

    expect(result.current.outcome).toBe('alreadyUndone')
  })

  it('drops a conflict once an undo puts the entity back', async () => {
    fakeApi({ [undoPath]: () => failure('undo_conflict', 409) })
    const { result, rerender } = renderUndo(anAddChange())
    act(() => result.current.run())
    await waitFor(() => expect(result.current.outcome).toBe('conflict'))

    rerender({ shown: anAddChange(), restoredBy: 'change-undo-of-move' })

    expect(result.current.outcome).toBe('ready')
  })

  it('keeps a conflict when the refresh shows the change it lost to', async () => {
    fakeApi({ [undoPath]: () => failure('undo_conflict', 409) })
    const { result, rerender } = renderUndo(
      anAddChange(),
      undefined,
      'change-breakfast',
    )
    act(() => result.current.run())
    await waitFor(() => expect(result.current.outcome).toBe('conflict'))

    rerender({ shown: anAddChange(), restoredBy: undefined })

    expect(result.current.outcome).toBe('conflict')
  })

  it('keeps a conflict while the list it was refused against stands', async () => {
    fakeApi({ [undoPath]: () => failure('undo_conflict', 409) })
    const { result, rerender } = renderUndo(
      anAddChange(),
      undefined,
      'change-breakfast',
    )
    act(() => result.current.run())
    await waitFor(() => expect(result.current.outcome).toBe('conflict'))

    rerender({ shown: anAddChange(), restoredBy: 'change-breakfast' })

    expect(result.current.outcome).toBe('conflict')
  })

  it('reuses the undo id when a lost answer is asked again', async () => {
    let calls = 0
    const { requests } = fakeApi({
      [undoPath]: () => {
        calls += 1
        return calls === 1 ? offline() : undone()
      },
    })
    const { result } = renderUndo(anAddChange())
    act(() => result.current.run())
    await waitFor(() => expect(result.current.outcome).toBe('network'))

    act(() => result.current.run())

    await waitFor(() => expect(result.current.outcome).toBe('undone'))
    expect(undoIdOf(requests[1]?.body)).toBe(undoIdOf(requests[0]?.body))
  })

  it('sends one request for a double tap', async () => {
    const { requests } = fakeApi({ [undoPath]: undone })
    const { result } = renderUndo(anAddChange())

    act(() => {
      result.current.run()
      result.current.run()
    })

    await waitFor(() => expect(result.current.outcome).toBe('undone'))
    expect(requests).toHaveLength(1)
  })

  it('sends nothing for a change already undone', () => {
    const { requests } = fakeApi({ [undoPath]: undone })
    const { result } = renderUndo(anAddChange({ undoneBy: 'change-undo' }))

    act(() => result.current.run())

    expect(requests).toHaveLength(0)
  })
})
