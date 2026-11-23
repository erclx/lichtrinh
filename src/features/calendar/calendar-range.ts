import type { Trip } from '@shared/trips.ts'

import { monthCells } from '@/lib/month-cells'

/** One trip on one day, with whether the day opens or closes the trip. */
export interface TripOnDay {
  trip: Trip
  starts: boolean
  ends: boolean
}

export interface CalendarDay {
  /** `YYYY-MM-DD`, with no zone attached. */
  date: string
  /** False for the days of the months around it that fill a month's weeks. */
  inMonth: boolean
  /** Every trip covering the day, in start order. */
  trips: TripOnDay[]
}

export interface WeekGroup {
  /** The trip the run of days belongs to, or null for days outside any trip. */
  trip: Trip | null
  days: CalendarDay[]
}

const dayMs = 86_400_000

/** The date `count` days after `date`, or before it when negative. */
export function addDays(date: string, count: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + count * dayMs)
    .toISOString()
    .slice(0, 10)
}

/** The Monday of the week holding `date`. */
export function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, -((weekday + 6) % 7))
}

/** The first of the month `count` months from the one holding `date`. */
export function shiftMonth(date: string, count: number): string {
  const [year, month] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 + count, 1))
    .toISOString()
    .slice(0, 10)
}

/**
 * The trips covering `date`, in start order. A date where one trip ends and
 * the next starts carries both, the ending trip first, so a cell can split.
 */
export function tripsOn(date: string, trips: Trip[]): TripOnDay[] {
  return trips
    .filter((trip) => trip.startsOn <= date && date <= trip.endsOn)
    .sort(
      (a, b) =>
        a.startsOn.localeCompare(b.startsOn) || a.id.localeCompare(b.id),
    )
    .map((trip) => ({
      trip,
      starts: trip.startsOn === date,
      ends: trip.endsOn === date,
    }))
}

/** The Monday-first weeks of the month holding `date`, each day with its trips. */
export function monthWeeks(date: string, trips: Trip[]): CalendarDay[][] {
  const [year, month] = date.split('-').map(Number)
  return monthCells(year, month).map((week) =>
    week.map((cell) => ({ ...cell, trips: tripsOn(cell.date, trips) })),
  )
}

/** The seven days from the Monday of the week holding `date`. */
export function weekDays(date: string, trips: Trip[]): CalendarDay[] {
  const monday = mondayOf(date)
  return Array.from({ length: 7 }, (_, offset) => {
    const day = addDays(monday, offset)
    return { date: day, inMonth: true, trips: tripsOn(day, trips) }
  })
}

/**
 * A week cut into runs of days by trip. A date two trips share joins the
 * trip starting on it, since its entries open the new trip's first day.
 */
export function weekGroups(days: CalendarDay[]): WeekGroup[] {
  const groups: WeekGroup[] = []
  for (const day of days) {
    const trip = day.trips.at(-1)?.trip ?? null
    const last = groups.at(-1)
    if (last !== undefined && last.trip?.id === trip?.id) {
      last.days.push(day)
    } else {
      groups.push({ trip, days: [day] })
    }
  }
  return groups
}
