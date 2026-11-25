import '@/i18n/setup'

import type { Change } from '@shared/changes.ts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ChangeCard } from '@/features/chat/change-card'
import { applyLanguage } from '@/i18n/setup'
import { apiFetch } from '@/lib/api'
import { aMoveChange, anAddChange } from '@/test/chat'
import { failure, fakeApi, json, offline } from '@/test/fake-api'

function renderCards(...changes: Change[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      {changes.map((change) => (
        <ChangeCard key={change.id} change={change} />
      ))}
    </QueryClientProvider>,
  )
}

function undone() {
  return json({ change: anAddChange({ id: 'change-undo', op: 'undo' }) })
}

function undoIdOf(body: unknown): unknown {
  return typeof body === 'object' && body !== null && 'undoId' in body
    ? body.undoId
    : undefined
}

const uuid = /^[0-9a-f-]{36}$/

beforeEach(async () => {
  await applyLanguage('en')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ChangeCard', () => {
  it('shows the entry title and its time span on the day', () => {
    renderCards(anAddChange())

    expect(screen.getByText('Pho breakfast')).toBeInTheDocument()
    expect(screen.getByText('07:00–08:00 · Fri, May 16')).toBeInTheDocument()
  })

  it('shows the old and the new time of a move', () => {
    renderCards(aMoveChange())

    expect(screen.getByText('17:00 → 17:30')).toBeInTheDocument()
  })

  it('undoes the change under a generated id and shows Undone', async () => {
    const user = userEvent.setup()
    const { requests } = fakeApi({
      'POST /changes/change-breakfast/undo': undone,
    })
    renderCards(anAddChange())

    await user.click(screen.getByRole('button', { name: /^Undo/ }))

    expect(await screen.findByText('Undone')).toBeInTheDocument()
    expect(undoIdOf(requests[0]?.body)).toMatch(uuid)
  })

  it('waits for a connection and sends nothing on a press', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { requests } = fakeApi({})
    renderCards(anAddChange())

    const undo = screen.getByRole('button', { name: 'Undo “Pho breakfast”' })
    await user.click(undo)

    expect(undo).toHaveAttribute('aria-disabled', 'true')
    expect(requests).toEqual([])
  })

  it('gives each card its own undo id', async () => {
    const user = userEvent.setup()
    const { requests } = fakeApi({
      'POST /changes/change-breakfast/undo': undone,
      'POST /changes/change-move/undo': undone,
    })
    renderCards(anAddChange(), aMoveChange())

    await user.click(
      screen.getByRole('button', { name: 'Undo “Pho breakfast”' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Undo “Sunset boat trip”' }),
    )

    expect(await screen.findAllByText('Undone')).toHaveLength(2)
    expect(undoIdOf(requests[0]?.body)).not.toBe(undoIdOf(requests[1]?.body))
  })

  it('sends the same id again when a press is retried after a lost answer', async () => {
    const user = userEvent.setup()
    let calls = 0
    const { requests } = fakeApi({
      'POST /changes/change-breakfast/undo': () => {
        calls += 1
        return calls === 1 ? offline() : undone()
      },
      // Any answer tells the app its connection is back.
      'GET /settings': () => json({ contactName: null }),
    })
    renderCards(anAddChange())

    await user.click(screen.getByRole('button', { name: /^Undo/ }))
    await screen.findByText(/Can't connect/)
    await act(() => apiFetch('/settings'))
    await user.click(screen.getByRole('button', { name: /^Undo/ }))

    expect(await screen.findByText('Undone')).toBeInTheDocument()
    const undos = requests.filter(({ method }) => method === 'POST')
    expect(undoIdOf(undos[1]?.body)).toBe(undoIdOf(undos[0]?.body))
  })

  it('says someone changed it since on a conflict, and offers no Undo', async () => {
    const user = userEvent.setup()
    fakeApi({
      'POST /changes/change-breakfast/undo': () =>
        failure('undo_conflict', 409),
    })
    renderCards(anAddChange())

    await user.click(screen.getByRole('button', { name: /^Undo/ }))

    expect(await screen.findByText(/Someone changed it since/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Undo/ })).toBeNull()
  })

  it('shows Undone when the change was already undone elsewhere', async () => {
    const user = userEvent.setup()
    fakeApi({
      'POST /changes/change-breakfast/undo': () =>
        failure('already_undone', 409),
    })
    renderCards(anAddChange())

    await user.click(screen.getByRole('button', { name: /^Undo/ }))

    expect(await screen.findByText('Undone')).toBeInTheDocument()
  })

  it('opens as Undone for a change undone before the chat was opened', () => {
    renderCards(anAddChange({ undoneBy: 'change-undo' }))

    expect(screen.getByText('Undone')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Undo/ })).toBeNull()
  })
})
