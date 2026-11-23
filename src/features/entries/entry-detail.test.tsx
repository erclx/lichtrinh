import '@/i18n/setup'

import { act, screen } from '@testing-library/react'

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
