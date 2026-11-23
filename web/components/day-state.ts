import type { Entry } from '@shared/entries.ts'
import { nowInZone } from '@shared/trip-time.ts'

export type EntryState = 'done' | 'now' | 'upcoming'

export interface DayRow {
  entry: Entry
  state: EntryState
  /** Minutes until a `now` entry ends, null otherwise. */
  minutesLeft: number | null
  /** How far through a `now` entry the instant falls, 0 to 1, null otherwise. */
  progress: number | null
}

const minuteMs = 60_000

// Two wall clocks in one zone subtract as if both were UTC.
function wallMinutes(date: string, time: string) {
  return Date.parse(`${date}T${time}:00Z`) / minuteMs
}

function rowOf(entry: Entry, at: Date): DayRow {
  const now = nowInZone(at, entry.timeZone)
  const current = wallMinutes(now.date, '00:00') + now.minute
  const start = wallMinutes(entry.startsOn, entry.startTime)
  const end = wallMinutes(entry.endsOn, entry.endTime)
  if (end <= current) {
    return { entry, state: 'done', minutesLeft: null, progress: null }
  }
  if (start > current) {
    return { entry, state: 'upcoming', minutesLeft: null, progress: null }
  }
  return {
    entry,
    state: 'now',
    minutesLeft: end - current,
    progress: (current - start) / (end - start),
  }
}

function byStart(a: Entry, b: Entry) {
  return (
    a.startTime.localeCompare(b.startTime) ||
    `${a.endsOn}T${a.endTime}`.localeCompare(`${b.endsOn}T${b.endTime}`) ||
    a.id.localeCompare(b.id)
  )
}

/**
 * The entries starting on `date`, in start order, each marked done, now, or
 * upcoming at the instant `at` on its own zone's wall clock, so a phone in
 * another zone reads the trip's clock rather than its own.
 */
export function dayRows(entries: Entry[], date: string, at: Date): DayRow[] {
  return entries
    .filter((entry) => entry.startsOn === date)
    .sort(byStart)
    .map((entry) => rowOf(entry, at))
}
