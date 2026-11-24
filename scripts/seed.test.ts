import { describe, expect, it } from 'vitest'

import { FIXTURE_ENTRIES, FIXTURE_TRIPS, todayFixtures } from './seed'

describe('todayFixtures', () => {
  it('spans two days before the date to four after', () => {
    const { trip } = todayFixtures('2026-11-24')

    expect(trip.startsOn).toBe('2026-11-22')
    expect(trip.endsOn).toBe('2026-11-28')
  })

  it('carries the span across a month and a year end', () => {
    const { trip } = todayFixtures('2026-12-30')

    expect(trip.startsOn).toBe('2026-12-28')
    expect(trip.endsOn).toBe('2027-01-03')
  })

  it('fills the date from morning to night with no overlap', () => {
    const { entries } = todayFixtures('2026-11-24')

    const today = entries.filter(({ startsOn }) => startsOn === '2026-11-24')

    expect(today.at(0)?.startTime).toBe('07:00')
    expect(today.at(-1)?.endTime).toBe('22:00')
    expect(
      today.every(
        (entry, index) =>
          index === 0 || (today[index - 1]?.endTime ?? '') <= entry.startTime,
      ),
    ).toBe(true)
  })

  it('places every entry inside the trip', () => {
    const { trip, entries } = todayFixtures('2026-11-24')

    expect(
      entries.every(
        ({ tripId, startsOn, endsOn }) =>
          tripId === trip.id &&
          startsOn >= trip.startsOn &&
          endsOn <= trip.endsOn,
      ),
    ).toBe(true)
  })

  it('shares no id with the fixtures the tests and captures read', () => {
    const { trip, entries } = todayFixtures('2026-11-24')
    const fixtureIds = new Set([
      ...FIXTURE_TRIPS.map(({ id }) => id),
      ...FIXTURE_ENTRIES.map(({ id }) => id),
    ])

    expect(
      [trip.id, ...entries.map(({ id }) => id)].some((id) =>
        fixtureIds.has(id),
      ),
    ).toBe(false)
  })
})
