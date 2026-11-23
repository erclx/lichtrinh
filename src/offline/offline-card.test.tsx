import '@/i18n/setup'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { calendarKeys } from '@/calendar-data/queries'
import { applyLanguage } from '@/i18n/setup'
import { OfflineCard } from '@/offline/offline-card'
import { lastUserKey } from '@/session/provider'
import { anEntry, aTrip } from '@/test/calendar'
import { renderRoute } from '@/test/render-route'

// Built on the device's own clock, which the card reads the saved time in.
const morning = new Date(2031, 4, 15, 9, 45).getTime()
const dayBefore = new Date(2031, 4, 14, 20, 5).getTime()

function renderCard(savedAt?: number) {
  const client = new QueryClient()
  if (savedAt !== undefined) {
    client.setQueryData(calendarKeys.trips(), [aTrip()], { updatedAt: savedAt })
  }
  render(
    <QueryClientProvider client={client}>
      <OfflineCard />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2031, 4, 15, 10, 30))
  await applyLanguage('en')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the offline card', () => {
  it('names the time a plan saved today was loaded', () => {
    renderCard(morning)

    const card = screen.getByRole('status')
    expect(card).toHaveTextContent('No connection')
    expect(card).toHaveTextContent(
      'Showing the plan saved at 09:45. Editing comes back with the connection.',
    )
  })

  it('names the day too for a plan saved before today', () => {
    renderCard(dayBefore)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing the plan saved on 5/14 at 20:05.',
    )
  })

  it('says nothing is saved rather than naming a time', () => {
    renderCard()

    expect(screen.getByRole('status')).toHaveTextContent(
      'Nothing is saved on this phone yet',
    )
  })

  it('reads in Vietnamese', async () => {
    await applyLanguage('vi')

    renderCard(morning)

    const card = screen.getByRole('status')
    expect(card).toHaveTextContent('Đang không có mạng')
    expect(card).toHaveTextContent(
      'Đang xem bản lưu lúc 09:45. Có mạng lại thì sửa được.',
    )
  })
})

// A remembered person on a device where no call gets an answer, with the
// day's trip and entry already in the cache as a restore leaves them.
function offlineWithAPlan(path: string) {
  localStorage.setItem(
    lastUserKey,
    JSON.stringify({
      id: 'user-member',
      displayName: 'Thành viên',
      role: 'member',
      canChat: false,
      language: null,
    }),
  )
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
  const market = anEntry()
  const { client } = renderRoute(path)
  client.setQueryData(calendarKeys.entry(market.id), market)
  client.setQueryData(calendarKeys.trip(market.tripId), {
    trip: aTrip(),
    entries: [market],
  })
}

describe('edits while offline', () => {
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('keeps Add on the day, saying it waits for the connection', async () => {
    offlineWithAPlan('/trips/trip-river/days/2031-05-15')

    const add = await screen.findByRole('button', {
      name: 'Add an activity on Thursday, May 15',
    })
    expect(add).toHaveAttribute('aria-disabled', 'true')
    expect(add).toHaveAccessibleDescription(/Editing comes back/)
    expect(screen.getByText('Flower market')).toBeInTheDocument()
  })

  it('keeps Edit and Delete on the entry, saying editing waits', async () => {
    offlineWithAPlan('/entries/entry-market')

    const edit = await screen.findByRole('button', { name: 'Edit' })
    const remove = screen.getByRole('button', { name: 'Delete this activity' })
    expect(edit).toHaveAttribute('aria-disabled', 'true')
    expect(remove).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Editing needs a connection.')).toBeInTheDocument()
  })

  it('opens no delete sheet on a press', async () => {
    const user = userEvent.setup()
    offlineWithAPlan('/entries/entry-market')

    await user.click(
      await screen.findByRole('button', { name: 'Delete this activity' }),
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
