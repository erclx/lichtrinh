import '@/i18n/setup'

import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyLanguage } from '@/i18n/setup'
import { anEntry, aTrip } from '@/test/calendar'
import { aUser, failure, fakeApi, json } from '@/test/fake-api'
import { renderRoute } from '@/test/render-route'

const market = anEntry({ id: 'entry-market', title: 'Flower market' })

// The first read finds the entry and every later one finds it deleted.
function deletedAfterFirstRead() {
  let reads = 0
  return fakeApi({
    'GET /auth/me': () => json(aUser()),
    'GET /entries/entry-market': () =>
      reads++ === 0 ? json({ entry: market }) : failure('not_found', 404),
    'GET /trips/trip-river': () => json({ trip: aTrip(), entries: [market] }),
  })
}

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('deleting from the entry page', () => {
  it('opens the day with Undo once the delete holds', async () => {
    let deleted = false
    const api = fakeApi({
      'GET /auth/me': () => json(aUser()),
      'GET /entries/entry-market': () =>
        deleted ? failure('not_found', 404) : json({ entry: market }),
      'GET /trips/trip-river': () =>
        json({ trip: aTrip(), entries: deleted ? [] : [market] }),
      'DELETE /entries/entry-market': () => {
        deleted = true
        return json({ changeId: 'change-delete' })
      },
    })
    const user = userEvent.setup()
    const { router } = renderRoute('/entries/entry-market')

    await user.click(
      await screen.findByRole('button', { name: 'Delete this activity' }),
    )
    const sheet = await screen.findByRole('alertdialog')
    await user.click(within(sheet).getByRole('button', { name: 'Delete' }))

    expect(
      await screen.findByText('Deleted “Flower market”'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(
      '/trips/trip-river/days/2031-05-15',
    )
    // A re-read answers not_found, which can render before the move lands.
    const afterDelete = api.requests.slice(
      api.requests.findIndex(({ method }) => method === 'DELETE'),
    )
    expect(
      afterDelete.some(
        ({ method, path }) =>
          method === 'GET' && path === '/entries/entry-market',
      ),
    ).toBe(false)
  })
})

describe('an entry someone else deleted', () => {
  it('reads as gone on the detail page rather than out of date', async () => {
    deletedAfterFirstRead()
    const { client } = renderRoute('/entries/entry-market')

    await screen.findByText('Flower market')
    await act(() => client.refetchQueries())

    expect(
      await screen.findByText(
        "This activity isn't here. It may have been deleted.",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Flower market')).toBeNull()
  })

  it('reads as gone on the edit page rather than out of date', async () => {
    deletedAfterFirstRead()
    const { client } = renderRoute('/entries/entry-market/edit')

    await screen.findByDisplayValue('Flower market')
    await act(() => client.refetchQueries())

    expect(
      await screen.findByText(
        "This activity isn't here. It may have been deleted.",
      ),
    ).toBeInTheDocument()
  })
})
