import { sumCosts, tripBudget } from './budget.ts'
import type { EntryKind } from './changes.ts'

const trip = { startsOn: '2031-05-13', endsOn: '2031-05-15' }

function costed(
  startsOn: string,
  costMinor: number | null,
  kind: EntryKind | null = 'food',
) {
  return { startsOn, costMinor, kind }
}

describe('tripBudget', () => {
  it('totals every costed entry', () => {
    const entries = [
      costed('2031-05-13', 120_000),
      costed('2031-05-14', 50_000, 'sights'),
    ]

    expect(tripBudget(trip, entries).totalMinor).toBe(170_000)
  })

  it('lists every trip day with an empty day at zero', () => {
    const entries = [
      costed('2031-05-13', 120_000),
      costed('2031-05-15', 90_000),
    ]

    expect(tripBudget(trip, entries).byDay).toEqual([
      { date: '2031-05-13', totalMinor: 120_000 },
      { date: '2031-05-14', totalMinor: 0 },
      { date: '2031-05-15', totalMinor: 90_000 },
    ])
  })

  it('counts an entry past midnight on its start day', () => {
    const late = { ...costed('2031-05-13', 300_000), endsOn: '2031-05-14' }

    expect(tripBudget(trip, [late]).byDay).toEqual([
      { date: '2031-05-13', totalMinor: 300_000 },
      { date: '2031-05-14', totalMinor: 0 },
      { date: '2031-05-15', totalMinor: 0 },
    ])
  })

  it('splits by kind in the frame order, with no kind its own bucket last', () => {
    const entries = [
      costed('2031-05-13', 10_000, null),
      costed('2031-05-13', 20_000, 'rest'),
      costed('2031-05-13', 30_000, 'food'),
      costed('2031-05-14', 40_000, 'activity'),
      costed('2031-05-14', 5_000, 'food'),
    ]

    expect(tripBudget(trip, entries).byKind).toEqual([
      { kind: 'food', totalMinor: 35_000 },
      { kind: 'activity', totalMinor: 40_000 },
      { kind: 'rest', totalMinor: 20_000 },
      { kind: null, totalMinor: 10_000 },
    ])
  })

  it('adds nothing for an uncosted entry and counts it', () => {
    const entries = [
      costed('2031-05-13', 120_000),
      costed('2031-05-13', null),
      costed('2031-05-14', null, 'rest'),
    ]

    const budget = tripBudget(trip, entries)

    expect(budget.totalMinor).toBe(120_000)
    expect(budget.uncosted).toBe(2)
    expect(budget.byKind).toEqual([{ kind: 'food', totalMinor: 120_000 }])
  })

  it('keeps a free entry in its kind at zero', () => {
    expect(
      tripBudget(trip, [costed('2031-05-13', 0, 'sights')]).byKind,
    ).toEqual([{ kind: 'sights', totalMinor: 0 }])
  })

  it('answers zero and no kinds for a trip with no entries', () => {
    const budget = tripBudget(trip, [])

    expect(budget.totalMinor).toBe(0)
    expect(budget.byKind).toEqual([])
    expect(budget.uncosted).toBe(0)
    expect(budget.byDay).toHaveLength(3)
  })
})

describe('sumCosts', () => {
  it('sums the costs, skipping an entry with none', () => {
    expect(
      sumCosts([
        { costMinor: 90_000 },
        { costMinor: null },
        { costMinor: 10_000 },
      ]),
    ).toBe(100_000)
  })

  it('answers null when no entry carries a cost', () => {
    expect(sumCosts([{ costMinor: null }])).toBeNull()
  })

  it('answers zero for a free entry rather than null', () => {
    expect(sumCosts([{ costMinor: 0 }])).toBe(0)
  })
})
