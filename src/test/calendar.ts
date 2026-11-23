import type { Entry } from '@shared/entries.ts'
import type { Trip } from '@shared/trips.ts'

/** An invented trip in 2031, eight days in Vietnam time, priced in dong. */
export function aTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-river',
    version: 1,
    name: 'Trip to Sông Mây',
    startsOn: '2031-05-13',
    endsOn: '2031-05-20',
    timeZone: 'Asia/Ho_Chi_Minh',
    currency: 'VND',
    homeCurrency: 'USD',
    ...overrides,
  }
}

const stamp = {
  displayName: 'Du khách',
  source: 'person',
  at: '2031-05-12T08:00:00.000Z',
} as const

/** An invented hour-long entry on the trip's third day. */
export function anEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-market',
    version: 1,
    tripId: 'trip-river',
    title: 'Flower market',
    notes: null,
    kind: 'sights',
    startsOn: '2031-05-15',
    startTime: '09:00',
    endsOn: '2031-05-15',
    endTime: '10:00',
    timeZone: 'Asia/Ho_Chi_Minh',
    costMinor: null,
    addedBy: stamp,
    changedBy: stamp,
    ...overrides,
  }
}
