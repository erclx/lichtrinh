import { z } from 'zod'

/** A calendar date in trip time, `YYYY-MM-DD`, with no zone of its own. */
export const localDate = z.iso.date()

/** A wall clock time in trip time, `HH:MM` on a 24-hour clock. */
export const clockTime = z.iso.time({ precision: -1 })

/** A date and a clock time read on the wall in some zone. */
export interface LocalClock {
  date: string
  time: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string) {
  let formatter = formatters.get(timeZone)
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

function wallClock(instant: number, timeZone: string) {
  const parts: Record<string, string> = {}
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    parts[part.type] = part.value
  }
  const date = `${parts.year}-${parts.month}-${parts.day}`
  const time = `${parts.hour}:${parts.minute}`
  return { date, time, minute: Number(parts.hour) * 60 + Number(parts.minute) }
}

// The wall clock read as if it were UTC, which is what makes an offset
// subtractable from it.
function wallAsUtc({ date, time }: LocalClock) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  return Date.UTC(year, month - 1, day, hour, minute)
}

function offsetAt(instant: number, timeZone: string) {
  const whole = instant - (instant % MINUTE_MS)
  return wallAsUtc(wallClock(whole, timeZone)) - whole
}

// Resolves the way Temporal's `compatible` option does: a clock time in an
// overlap takes the earlier instant, and one in a gap moves forward by the
// gap's length. A zone never changes offset twice within two days, so the
// offsets a day either side are the only two candidates.
function instantOf(clock: LocalClock, timeZone: string) {
  const wall = wallAsUtc(clock)
  const offsetBefore = offsetAt(wall - DAY_MS, timeZone)
  const offsetAfter = offsetAt(wall + DAY_MS, timeZone)
  const matching = [wall - offsetBefore, wall - offsetAfter].filter(
    (instant) => wallAsUtc(wallClock(instant, timeZone)) === wall,
  )
  return matching.length > 0 ? Math.min(...matching) : wall - offsetBefore
}

/** Whether `name` is a time zone this runtime's `Intl` knows. */
export function isTimeZone(name: string): boolean {
  try {
    formatterFor(name)
    return true
  } catch {
    return false
  }
}

/** The local date and the minute after local midnight at `at` in a zone. */
export function nowInZone(at: Date, timeZone: string) {
  const { date, minute } = wallClock(at.getTime(), timeZone)
  return { date, minute }
}

/** The wall clock in `to` at the moment `clock` shows on the wall in `from`. */
export function convertClock(
  clock: LocalClock,
  from: string,
  to: string,
): LocalClock {
  const { date, time } = wallClock(instantOf(clock, from), to)
  return { date, time }
}

export const timeZone = z.string().refine(isTimeZone, 'Not a time zone')
