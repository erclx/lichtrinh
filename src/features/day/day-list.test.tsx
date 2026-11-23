import '@/i18n/setup'

import type { Entry } from '@shared/entries.ts'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyLanguage } from '@/i18n/setup'
import { anEntry, aTrip } from '@/test/calendar'
import { aUser, failure, fakeApi, json } from '@/test/fake-api'
import { renderRoute } from '@/test/render-route'

type User = ReturnType<typeof userEvent.setup>

const dayPath = '/trips/trip-river/days/2031-05-15'

function dayWith(entries: Entry[]) {
  return fakeApi({
    'GET /auth/me': () => json(aUser()),
    'GET /trips/trip-river': () => json({ trip: aTrip(), entries }),
  })
}

/** Presses on the row, drags it left past the reveal, and lets go. */
async function swipeLeft(user: User, target: Element) {
  await user.pointer([
    { keys: '[TouchA>]', target, coords: { clientX: 300, clientY: 40 } },
    { pointerName: 'TouchA', target, coords: { clientX: 250, clientY: 41 } },
    { pointerName: 'TouchA', target, coords: { clientX: 200, clientY: 42 } },
    { keys: '[/TouchA]', target },
  ])
}

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
  // 09:30 on 15 May 2031 in Vietnam time, with only the clock faked.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2031-05-15T02:30:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('DayList', () => {
  it('offers Add on a day with nothing planned', async () => {
    dayWith([])
    renderRoute(dayPath)

    expect(
      await screen.findByText('Nothing planned this day yet.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add' })).toHaveAttribute(
      'href',
      '/entries/new?trip=trip-river&date=2031-05-15',
    )
  })

  it('collapses a done entry to its title, marked done', async () => {
    dayWith([
      anEntry({ title: 'Pho breakfast', startTime: '07:00', endTime: '08:00' }),
    ])
    renderRoute(dayPath)

    const row = await screen.findByRole('link', { name: /Pho breakfast/ })
    expect(row).toHaveTextContent('Done, Pho breakfast')
    expect(row).not.toHaveTextContent('Happening now')
  })

  it('expands the entry happening now with its time left', async () => {
    dayWith([
      anEntry({ title: 'Flower market', startTime: '09:00', endTime: '10:15' }),
    ])
    renderRoute(dayPath)

    const card = await screen.findByRole('link', { name: /Flower market/ })
    expect(card).toHaveTextContent('Happening now · 45 min left')
  })

  it('keeps the loaded day and says so when a background refresh fails', async () => {
    let reads = 0
    fakeApi({
      'GET /auth/me': () => json(aUser()),
      'GET /trips/trip-river': () =>
        reads++ === 0
          ? json({ trip: aTrip(), entries: [anEntry({ title: 'Lunch' })] })
          : failure('internal_error', 500),
    })
    const { client } = renderRoute(dayPath)

    await screen.findByText('Lunch')
    await act(() => client.refetchQueries())

    expect(
      await screen.findByText("Couldn't refresh, so this may be out of date"),
    ).toBeInTheDocument()
    expect(screen.getByText('Lunch')).toBeInTheDocument()
  })

  it('asks before a swiped Delete, and Keep it leaves the row', async () => {
    const api = dayWith([
      anEntry({ title: 'Sunset boat', startTime: '17:00', endTime: '18:00' }),
    ])
    const user = userEvent.setup()
    renderRoute(dayPath)

    await swipeLeft(user, await screen.findByText('Sunset boat'))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const sheet = await screen.findByRole('alertdialog', {
      name: 'Delete “Sunset boat”?',
    })
    await user.click(within(sheet).getByRole('button', { name: 'Keep it' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByText('Sunset boat')).toBeInTheDocument()
    expect(api.requests.some(({ method }) => method === 'DELETE')).toBe(false)
  })
})
