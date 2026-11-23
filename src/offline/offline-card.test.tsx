import '@/i18n/setup'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'

import { calendarKeys } from '@/calendar-data/queries'
import { applyLanguage } from '@/i18n/setup'
import { OfflineCard } from '@/offline/offline-card'
import { aTrip } from '@/test/calendar'

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
