import { describe, expect, it } from 'vitest'

import {
  accountRows,
  appTables,
  FIXTURE_ENTRIES,
  FIXTURE_TRIPS,
  fixtureToday,
  resetRows,
  todayFixtures,
} from './seed'

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

  it('shares no id with a trip written under another key', () => {
    const first = todayFixtures('2026-11-24', 'staging-2026-11-24')
    const second = todayFixtures('2026-12-10', 'staging-2026-12-10')

    const ids = [first, second].flatMap(({ trip, entries }) => [
      trip.id,
      ...entries.map(({ id }) => id),
    ])

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the ids a dev database already holds when no key is named', () => {
    const { trip, entries } = todayFixtures('2026-11-24')

    expect(trip.id).toBe('dev-trip-today')
    expect(entries[0]?.id).toBe('dev-entry-arrive')
  })
})

describe('fixtureToday', () => {
  it('reads the date where the fixture trips are', () => {
    expect(fixtureToday(new Date('2026-11-24T18:30:00Z'))).toBe('2026-11-25')
  })
})

describe('accountRows', () => {
  it('writes the hash it is given, null included, beside each username', () => {
    const rows = accountRows(
      { prepare: () => ({ bind: (...values: unknown[]) => values }) },
      1_700_000_000_000,
      ({ role }) => (role === 'admin' ? 'invented-hash' : null),
    )

    expect(rows.map((values) => [values[1], values[5]])).toEqual([
      ['admin', 'invented-hash'],
      ['traveler', null],
    ])
  })
})

describe('appTables', () => {
  it('keeps the app tables and drops the migrations and internal ones', () => {
    const tables = appTables([
      'users',
      'd1_migrations',
      '_cf_KV',
      'sqlite_sequence',
      'entries',
    ])

    expect(tables).toEqual(['users', 'entries'])
  })

  it('returns no table for a database the migrations have not reached', () => {
    expect(appTables(['_cf_KV'])).toEqual([])
  })

  it('refuses a name it cannot write as a plain identifier', () => {
    expect(() => appTables(['users', 'bad"; DROP'])).toThrow(/bad"; DROP/)
  })
})

describe('resetRows', () => {
  const db = { prepare: (query: string) => ({ bind: () => query }) }

  it('defers the foreign keys ahead of every delete', () => {
    const statements = resetRows(db, ['users', 'chats'])

    expect(statements).toEqual([
      'PRAGMA defer_foreign_keys = on',
      'DELETE FROM "users"',
      'DELETE FROM "chats"',
    ])
  })

  it('writes no statement when there is no table', () => {
    expect(resetRows(db, [])).toEqual([])
  })
})
