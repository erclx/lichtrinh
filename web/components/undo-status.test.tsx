import '@/i18n/setup'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useOfferUndo } from '@/components/undo-context'
import { UndoProvider } from '@/components/undo-status'
import { applyLanguage } from '@/i18n/setup'
import { failure, fakeApi, json } from '@/test/fake-api'

const undoneChange = {
  change: {
    id: 'change-undo',
    at: '2031-05-15T02:30:00.000Z',
    actor: { id: 'user-member', displayName: 'Thành viên' },
    source: 'person',
    op: 'undo',
    entity: 'entry',
    entityId: 'entry-market',
    undoneBy: null,
    before: null,
    after: null,
  },
}

function DeleteSomething() {
  const offer = useOfferUndo()
  return (
    <button type="button" onClick={() => offer('Deleted “Lunch”', 'change-1')}>
      Delete
    </button>
  )
}

function renderWithUndo() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <UndoProvider>
        <DeleteSomething />
      </UndoProvider>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await applyLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('UndoProvider', () => {
  it('names the change in a status that takes no focus', async () => {
    fakeApi({})
    const user = userEvent.setup()
    renderWithUndo()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByRole('status')).toHaveTextContent('Deleted “Lunch”')
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
  })

  it('keeps Undo offline, saying it needs a connection, and sends nothing', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const api = fakeApi({})
    const user = userEvent.setup()
    renderWithUndo()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const undo = screen.getByRole('button', { name: 'Needs a connection' })
    await user.click(undo)

    expect(undo).toHaveAttribute('aria-disabled', 'true')
    expect(api.requests).toHaveLength(0)
    vi.restoreAllMocks()
  })

  it('undoes the change by its id and says so', async () => {
    const api = fakeApi({
      'POST /changes/change-1/undo': () => json(undoneChange, 201),
    })
    const user = userEvent.setup()
    renderWithUndo()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(await screen.findByText('Undone')).toBeInTheDocument()
    expect(api.requests.at(-1)?.body).toEqual({
      undoId: expect.any(String),
    })
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('says plainly when someone changed it after', async () => {
    fakeApi({
      'POST /changes/change-1/undo': () => failure('undo_conflict', 409),
    })
    const user = userEvent.setup()
    renderWithUndo()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(
      await screen.findByText("Can't undo, since someone changed it after."),
    ).toBeInTheDocument()
  })
})
