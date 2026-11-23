import type { Entry } from '@shared/entries.ts'

export interface Prefill {
  /** `HH:MM`, always one of the half-hour start times. */
  startTime: string
  minutes: number
}

const lastHour = 23

/**
 * Where a new entry on a day starts: the first whole hour after the day's
 * last entry ends, or 09:00 on an empty day, for one hour. An end past
 * midnight leaves 23:00, the latest whole hour the day still holds.
 */
export function prefillFor(dayEntries: Entry[]): Prefill {
  if (dayEntries.length === 0) return { startTime: '09:00', minutes: 60 }
  const crossesMidnight = dayEntries.some(
    (entry) => entry.endsOn > entry.startsOn,
  )
  const lastEnd = dayEntries
    .map((entry) => entry.endTime)
    .reduce((latest, time) => (time > latest ? time : latest))
  const [hours, minutes] = lastEnd.split(':').map(Number)
  const hour = crossesMidnight
    ? lastHour
    : Math.min(lastHour, minutes > 0 ? hours + 1 : hours)
  return { startTime: `${String(hour).padStart(2, '0')}:00`, minutes: 60 }
}
