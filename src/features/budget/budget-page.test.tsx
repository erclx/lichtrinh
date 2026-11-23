import '@/i18n/setup'

import type { Entry } from '@shared/entries.ts'
import type { Rate } from '@shared/rates.ts'
import { screen, within } from '@testing-library/react'

import { applyLanguage } from '@/i18n/setup'
import { anEntry,aTrip } from '@/test/calendar'
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

  it('lists each kind with an Uncategorized row for entries of no kind', async () => {
    serve(costedTrip)

    renderRoute('/trips/trip-river/budget')

    const kinds = await screen.findByRole('list', { name: 'Cost by kind' })
    expect(
      within(kinds)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Food ₫4,000,000',
      'Sights ₫2,000,000',
      'Uncategorized ₫840,000',
    ])
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
    expect(screen.getByText('Chưa phân loại 840.000 ₫')).toBeInTheDocument()
  })
})
