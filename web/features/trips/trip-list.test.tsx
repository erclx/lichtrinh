import '@/i18n/setup'

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyLanguage } from '@/i18n/setup'
import { aTrip } from '@/test/calendar'
import { aUser, fakeApi, json } from '@/test/fake-api'
import { renderRoute } from '@/test/render-route'

const trips = [
  aTrip({
    id: 'trip-past',
    name: 'Winter in Núi Sương',
    startsOn: '2031-01-10',
    endsOn: '2031-01-15',
  }),
  aTrip({
    id: 'trip-coming',
    name: 'Summer on Đảo Lam',
    startsOn: '2031-07-02',
    endsOn: '2031-07-09',
  }),
  aTrip(),
]

function serve() {
  fakeApi({
    'GET /auth/me': () => json(aUser()),
    'GET /trips': () => json({ trips }),
    'GET /entries?from=2031-01-10&to=2031-07-09': () => json({ entries: [] }),
  })
}

// Matches the min-width queries a device of `width` pixels would.
function deviceWidth(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)?.[1]
    return {
      matches: min !== undefined && width >= Number(min),
      addEventListener: () => {},
      removeEventListener: () => {},
    }
  })
}

async function tripList() {
  const list = await screen.findByRole('list', { name: 'Trips' })
  return {
    list,
    names: within(list)
      .getAllByRole('link')
      .map((link) => link.querySelector('span')?.textContent),
  }
}

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2031-05-15T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('TripList', () => {
  it('opens as a list on a phone, under way first, then coming, then past', async () => {
    deviceWidth(390)
    serve()

    renderRoute('/trips')

    const { list, names } = await tripList()
    expect(list).toHaveAttribute('data-layout', 'list')
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(names).toEqual([
      'Trip to Sông Mây',
      'Summer on Đảo Lam',
      'Winter in Núi Sương',
    ])
  })

  it('opens as a grid from 480 pixels up, in the same order', async () => {
    deviceWidth(834)
    serve()

    renderRoute('/trips')

    const { list, names } = await tripList()
    expect(list).toHaveAttribute('data-layout', 'grid')
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(names).toEqual([
      'Trip to Sông Mây',
      'Summer on Đảo Lam',
      'Winter in Núi Sương',
    ])
  })

  it('keeps a stored List on a wide screen', async () => {
    deviceWidth(1440)
    localStorage.setItem('lichtrinh.trips-layout', 'list')
    serve()

    renderRoute('/trips')

    expect((await tripList()).list).toHaveAttribute('data-layout', 'list')
  })

  it('opens at the width default when the stored layout is not an option', async () => {
    deviceWidth(1440)
    localStorage.setItem('lichtrinh.trips-layout', 'mosaic')
    serve()

    renderRoute('/trips')

    expect((await tripList()).list).toHaveAttribute('data-layout', 'grid')
  })

  it('switches to the grid on a phone and remembers it', async () => {
    deviceWidth(390)
    serve()
    renderRoute('/trips')
    await tripList()

    await userEvent.click(screen.getByRole('button', { name: 'Grid' }))

    expect((await tripList()).list).toHaveAttribute('data-layout', 'grid')
    expect(localStorage.getItem('lichtrinh.trips-layout')).toBe('grid')
  })

  it('names the switch in Vietnamese', async () => {
    await applyLanguage('vi')
    deviceWidth(390)
    serve()

    renderRoute('/trips')

    const layout = await screen.findByRole('group', { name: 'Bố cục' })
    expect(
      within(layout).getByRole('button', { name: 'Lưới' }),
    ).toBeInTheDocument()
    expect(
      within(layout).getByRole('button', { name: 'Danh sách' }),
    ).toBeInTheDocument()
  })
})
