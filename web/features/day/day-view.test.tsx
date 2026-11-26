import '@/i18n/setup'

import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

import { applyLanguage } from '@/i18n/setup'
import { aTrip } from '@/test/calendar'

import { DayView } from './day-view'

const addName = 'Add an activity on Thursday, May 15'

function renderDay(isHome: boolean) {
  render(
    <MemoryRouter>
      <DayView trip={aTrip()} entries={[]} date="2031-05-15" isHome={isHome} />
    </MemoryRouter>,
  )
  return screen.getByRole('heading', { level: 1 })
}

beforeEach(async () => {
  await applyLanguage('en')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the day header', () => {
  it('puts Add on the date row of Today, with no Back', () => {
    const heading = renderDay(true)

    const row = heading.parentElement as HTMLElement
    expect(within(row).getByRole('link', { name: addName })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('keeps Add on the Back row of the day page', () => {
    renderDay(false)

    const add = screen.getByRole('link', { name: addName })
    const back = screen.getByRole('link', { name: 'Back' })
    expect(add.parentElement?.parentElement).toBe(back.parentElement)
  })

  it('shows the waiting Add on the date row when offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    const heading = renderDay(true)

    const row = heading.parentElement as HTMLElement
    const add = within(row).getByRole('button', { name: addName })
    expect(add).toHaveAttribute('aria-disabled', 'true')
  })
})
