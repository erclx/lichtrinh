import type { Trip } from '@shared/trips.ts'
import { describe, expect, it } from 'vitest'

import { chooseTrip } from './chats.ts'

function trip(id: string, startsOn: string, endsOn: string, timeZone = 'UTC') {
  return {
    id,
    name: `Invented ${id}`,
    startsOn,
    endsOn,
    timeZone,
    currency: 'VND',
    homeCurrency: 'USD',
    version: 1,
  } satisfies Trip
}

const at = new Date('2031-04-12T12:00:00Z')

describe('chooseTrip', () => {
  it('takes the trip under way', () => {
    const trips = [
      trip('past', '2031-03-01', '2031-03-05'),
      trip('now', '2031-04-10', '2031-04-16'),
      trip('next', '2031-05-01', '2031-05-04'),
    ]

    expect(chooseTrip(trips, at)?.id).toBe('now')
  })

  it('reads under way in the trip zone, not in UTC', () => {
    const trips = [
      trip('tomorrow-in-utc', '2031-04-13', '2031-04-14', 'Pacific/Kiritimati'),
      trip('next', '2031-05-01', '2031-05-04'),
    ]

    expect(chooseTrip(trips, at)?.id).toBe('tomorrow-in-utc')
  })

  it('takes the next trip to start when none is under way', () => {
    const trips = [
      trip('later', '2031-06-01', '2031-06-04'),
      trip('past', '2031-03-01', '2031-03-05'),
      trip('sooner', '2031-05-01', '2031-05-04'),
    ]

    expect(chooseTrip(trips, at)?.id).toBe('sooner')
  })

  it('takes the latest trip when every trip has ended', () => {
    const trips = [
      trip('older', '2031-01-01', '2031-01-05'),
      trip('latest', '2031-03-01', '2031-03-05'),
    ]

    expect(chooseTrip(trips, at)?.id).toBe('latest')
  })

  it('finds nothing with no trips', () => {
    expect(chooseTrip([], at)).toBeUndefined()
  })
})
