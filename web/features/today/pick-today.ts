import { nowInZone } from '@shared/trip-time.ts'
import type { Trip } from '@shared/trips.ts'

export type TodayPick =
  | { kind: 'under-way'; trip: Trip; date: string }
  | { kind: 'next'; trip: Trip }
  | { kind: 'none' }

/**
 * What Today opens on at `at`: the trip under way on its own zone's date,
 * else the soonest trip still to come, else nothing. Each trip's date is read
 * in its zone, since the trip's day can differ from the device's.
 */
export function pickToday(trips: Trip[], at: Date): TodayPick {
  const dated = trips.map((trip) => ({
    trip,
    today: nowInZone(at, trip.timeZone).date,
  }))
  const underWay = dated
    .filter(({ trip, today }) => trip.startsOn <= today && today <= trip.endsOn)
    .sort((a, b) => a.trip.startsOn.localeCompare(b.trip.startsOn))[0]
  if (underWay !== undefined) {
    return { kind: 'under-way', trip: underWay.trip, date: underWay.today }
  }
  const next = dated
    .filter(({ trip, today }) => trip.startsOn > today)
    .sort((a, b) => a.trip.startsOn.localeCompare(b.trip.startsOn))[0]
  return next === undefined
    ? { kind: 'none' }
    : { kind: 'next', trip: next.trip }
}
