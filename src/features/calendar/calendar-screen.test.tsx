import '@/i18n/setup'

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyLanguage } from '@/i18n/setup'
import { anEntry, aTrip } from '@/test/calendar'
import { aUser, fakeApi, json } from '@/test/fake-api'
import { renderRoute } from '@/test/render-route'

const river = aTrip()
const island = aTrip({
  id: 'trip-island',
  name: 'Trip to Đảo Lam',
  startsOn: '2031-06-03',
  endsOn: '2031-06-07',
})

const market = anEntry({ title: 'Flower market', startsOn: '2031-05-15' })

function calendarApi(entries: Record<string, unknown[]> = {}) {
  return fakeApi({
    'GET /auth/me': () => json(aUser()),
    'GET /trips': () => json({ trips: [river, island] }),
    ...Object.fromEntries(
      Object.entries(entries).map(([query, list]) => [
        `GET /entries?${query}`,
        () => json({ entries: list }),
      ]),
    ),
  })
}

// Noon UTC on 15 May 2031 reads as 15 May on almost every device's clock,
// so the unfiltered calendar's device date holds wherever the suite runs.
const noonOnTheFifteenth = new Date('2031-05-15T12:00:00Z')

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(noonOnTheFifteenth)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('CalendarScreen', () => {
  it('opens on the month holding today, every trip shown', async () => {
    calendarApi({ 'from=2031-04-28&to=2031-06-01': [market] })
    renderRoute('/calendar')

    expect(
      await screen.findByRole('link', {
        name: 'Thursday, May 15, Trip to Sông Mây, 1 entry',
      }),
    ).toHaveAttribute('aria-current', 'date')
    expect(screen.getByRole('button', { name: 'All trips' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('switches to the week and keeps the view in the address', async () => {
    const user = userEvent.setup()
    calendarApi({
      'from=2031-04-28&to=2031-06-01': [market],
      'from=2031-05-12&to=2031-05-18': [market],
    })
    const { router } = renderRoute('/calendar')
    await screen.findByRole('heading', { name: 'May 2031' })

    await user.click(screen.getByRole('button', { name: 'Week' }))

    expect(
      await screen.findByRole('link', { name: 'Thursday, May 15' }),
    ).toHaveTextContent('1 entry')
    expect(router.state.location.search).toBe('?view=week&date=2031-05-15')
  })

  it('narrows to one trip and jumps to its first date', async () => {
    const user = userEvent.setup()
    const api = calendarApi({
      'from=2031-04-28&to=2031-06-01': [market],
      'from=2031-05-26&to=2031-07-06&tripId=trip-island': [],
    })
    renderRoute('/calendar')

    await user.click(
      await screen.findByRole('button', { name: 'Trip to Đảo Lam' }),
    )

    expect(
      await screen.findByRole('heading', { name: 'June 2031' }),
    ).toBeInTheDocument()
    expect(api.requests.map((request) => request.path)).toContain(
      '/entries?from=2031-05-26&to=2031-07-06&tripId=trip-island',
    )
  })

  it('returns to the same view, date, and trip after a reload', async () => {
    calendarApi({
      'from=2031-06-02&to=2031-06-08&tripId=trip-island': [],
    })
    renderRoute('/calendar?view=week&date=2031-06-04&trip=trip-island')

    expect(
      await screen.findByRole('region', {
        name: /^Trip to Đảo Lam, Jun 3/,
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(
      screen.getByRole('button', { name: 'Trip to Đảo Lam' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('still draws a month no trip falls in, saying so', async () => {
    calendarApi({ 'from=2031-07-28&to=2031-08-31': [] })
    renderRoute('/calendar?view=month&date=2031-08-10')

    expect(
      await screen.findByText('No trip falls in this month.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Friday, August 1' }),
    ).toBeInTheDocument()
  })

  it('offers every trip back from an empty filtered month', async () => {
    calendarApi({
      'from=2031-07-28&to=2031-08-31&tripId=trip-island': [],
    })
    renderRoute('/calendar?view=month&date=2031-08-10&trip=trip-island')

    expect(
      await screen.findByRole('link', { name: 'Show all trips' }),
    ).toHaveAttribute('href', '/calendar?view=month&date=2031-08-10')
  })

  it('shows the day list of each trip on a day', async () => {
    calendarApi({ 'from=2031-05-15&to=2031-05-15': [market] })
    renderRoute('/calendar?view=day&date=2031-05-15')

    expect(
      await screen.findByRole('link', { name: /Flower market/ }),
    ).toHaveAttribute('href', '/entries/entry-market')
  })
})
