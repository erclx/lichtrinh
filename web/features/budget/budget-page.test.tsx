import '@/i18n/setup'

import type { Entry } from '@shared/entries.ts'
import type { Rate } from '@shared/rates.ts'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyLanguage } from '@/i18n/setup'
import { anEntry, aTrip } from '@/test/calendar'
import { aUser, fakeApi, json } from '@/test/fake-api'
import { renderRoute } from '@/test/render-route'

const usdRate: Rate = {
  from: 'USD',
  to: 'VND',
  rate: '25500',
  updatedAt: '2031-05-01T00:00:00.000Z',
}

function serve(entries: Entry[], rates: Rate[] = [usdRate]) {
  return fakeApi({
    'GET /auth/me': () => json(aUser()),
    'GET /trips/trip-river': () => json({ trip: aTrip(), entries }),
    'GET /rates': () => json({ rates }),
  })
}

const costedTrip = [
  anEntry({
    id: 'e1',
    kind: 'food',
    startsOn: '2031-05-13',
    costMinor: 4_000_000,
  }),
  anEntry({
    id: 'e2',
    kind: 'sights',
    startsOn: '2031-05-15',
    costMinor: 2_000_000,
  }),
  anEntry({ id: 'e3', kind: null, startsOn: '2031-05-15', costMinor: 840_000 }),
]

async function kindRows(name = 'Cost by kind') {
  const kinds = await screen.findByRole('list', { name })
  return within(kinds)
    .getAllByRole('listitem')
    .map((item) => item.textContent.replace(/\s+/g, ' '))
}

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BudgetPage', () => {
  it('shows the trip total with its home figure', async () => {
    serve(costedTrip)

    renderRoute('/trips/trip-river/budget')

    expect(await screen.findByText('₫6,840,000')).toBeInTheDocument()
    expect(await screen.findByText('about 268 USD')).toBeInTheDocument()
  })

  it('lists each kind with its share and an Uncategorized row for entries of no kind', async () => {
    serve(costedTrip)

    renderRoute('/trips/trip-river/budget')

    expect(await kindRows()).toEqual([
      'Food ₫4,000,000 58%',
      'Sights ₫2,000,000 29%',
      'Uncategorized ₫840,000 12%',
    ])
  })

  it('lists the kinds largest first, ties in the fixed kind order', async () => {
    serve([
      anEntry({ id: 'e1', kind: 'food', costMinor: 1_000_000 }),
      anEntry({ id: 'e2', kind: 'transport', costMinor: 3_000_000 }),
      anEntry({ id: 'e3', kind: 'rest', costMinor: 1_000_000 }),
    ])

    renderRoute('/trips/trip-river/budget')

    expect(await kindRows()).toEqual([
      'Transport ₫3,000,000 60%',
      'Food ₫1,000,000 20%',
      'Rest ₫1,000,000 20%',
    ])
  })

  it('reads a share under one percent as under one percent, not zero', async () => {
    serve([
      anEntry({ id: 'e1', kind: 'food', costMinor: 4_000_000 }),
      anEntry({ id: 'e2', kind: 'sights', costMinor: 20_000 }),
    ])

    renderRoute('/trips/trip-river/budget')

    expect(await kindRows()).toEqual([
      'Food ₫4,000,000 100%',
      'Sights ₫20,000 <1%',
    ])
  })

  it('opens on the ring and switches to the bars, remembering the choice', async () => {
    serve(costedTrip)
    renderRoute('/trips/trip-river/budget')

    const chart = await screen.findByRole('group', { name: 'Chart type' })
    expect(within(chart).getByRole('button', { name: 'Ring' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('kind-split')).toHaveAttribute(
      'data-view',
      'ring',
    )

    await userEvent.click(within(chart).getByRole('button', { name: 'Bars' }))

    expect(screen.getByTestId('kind-split')).toHaveAttribute(
      'data-view',
      'bars',
    )
    expect(localStorage.getItem('lichtrinh.budget-chart')).toBe('bars')
    expect(await kindRows()).toHaveLength(3)
  })

  it('opens on a stored Bars', async () => {
    localStorage.setItem('lichtrinh.budget-chart', 'bars')
    serve(costedTrip)

    renderRoute('/trips/trip-river/budget')

    expect(await screen.findByTestId('kind-split')).toHaveAttribute(
      'data-view',
      'bars',
    )
  })

  it('opens on the ring when the stored chart is not an option', async () => {
    localStorage.setItem('lichtrinh.budget-chart', 'pie')
    serve(costedTrip)

    renderRoute('/trips/trip-river/budget')

    expect(await screen.findByTestId('kind-split')).toHaveAttribute(
      'data-view',
      'ring',
    )
  })

  it('lists every trip day, an empty day at zero', async () => {
    serve(costedTrip)

    renderRoute('/trips/trip-river/budget')

    await screen.findByRole('heading', { name: 'By day' })
    const days = screen.getAllByRole('list').at(-1)
    if (days === undefined) throw new Error('No day list')
    const rows = within(days).getAllByRole('listitem')
    expect(rows).toHaveLength(8)
    expect(rows[0]).toHaveTextContent('₫4,000,000')
    expect(rows[1]).toHaveTextContent('₫0')
    expect(rows[2]).toHaveTextContent('₫2,840,000')
  })

  it('says how many entries carry no cost yet', async () => {
    serve([
      ...costedTrip,
      anEntry({ id: 'e4', costMinor: null }),
      anEntry({ id: 'e5', costMinor: null }),
    ])

    renderRoute('/trips/trip-river/budget')

    expect(
      await screen.findByText('2 activities have no cost yet'),
    ).toBeInTheDocument()
  })

  it('shows no home figure when no rate is stored', async () => {
    serve(costedTrip, [])

    renderRoute('/trips/trip-river/budget')

    await screen.findByText('₫6,840,000')
    expect(screen.queryByText(/^about/)).not.toBeInTheDocument()
  })

  it('says a trip with no costs has none yet', async () => {
    serve([])

    renderRoute('/trips/trip-river/budget')

    expect(await screen.findByText(/^No costs yet/)).toBeInTheDocument()
    expect(
      screen.queryByRole('list', { name: 'Cost by kind' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: 'Chart type' }),
    ).not.toBeInTheDocument()
  })

  it('reads in Vietnamese', async () => {
    await applyLanguage('vi')
    serve(costedTrip)

    renderRoute('/trips/trip-river/budget')

    expect(
      await screen.findByRole('heading', { name: 'Ngân sách' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('6.840.000 ₫')).toBeInTheDocument()
    expect(await screen.findByText('khoảng 268 USD')).toBeInTheDocument()
    expect(
      await screen.findByRole('group', { name: 'Kiểu biểu đồ' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tròn' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cột' })).toBeInTheDocument()
    expect(await kindRows('Chi phí theo loại')).toContain(
      'Chưa phân loại 840.000 ₫ 12%',
    )
  })
})

describe('the trip overview', () => {
  it('shows the home figure beside the trip total and links the budget', async () => {
    serve(costedTrip)

    renderRoute('/trips/trip-river')

    expect(await screen.findByText('about 268 USD')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Budget' })).toHaveAttribute(
      'href',
      '/trips/trip-river/budget',
    )
  })

  it('shows no home figure when no rate is stored', async () => {
    serve(costedTrip, [])

    renderRoute('/trips/trip-river')

    await screen.findByText('₫6,840,000')
    expect(screen.queryByText(/^about/)).not.toBeInTheDocument()
  })

  it('shows no home figure when the trip is priced in its home currency', async () => {
    fakeApi({
      'GET /auth/me': () => json(aUser()),
      'GET /trips/trip-river': () =>
        json({
          trip: aTrip({ currency: 'USD', homeCurrency: 'USD' }),
          entries: [anEntry({ costMinor: 4_500 })],
        }),
      'GET /rates': () => json({ rates: [usdRate] }),
    })

    renderRoute('/trips/trip-river')

    await screen.findAllByText('$45.00')
    expect(screen.queryByText(/^about/)).not.toBeInTheDocument()
  })
})

describe('the day view', () => {
  it('shows the home figure beside the day total', async () => {
    serve([anEntry({ costMinor: 1_640_000 })])

    renderRoute('/trips/trip-river/days/2031-05-15')

    expect(await screen.findByText('about 64 USD')).toBeInTheDocument()
  })
})
