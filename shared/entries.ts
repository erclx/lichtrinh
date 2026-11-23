import { z } from 'zod'

import { changeSource, entryFields, entryKind, rowVersion } from './changes.ts'
import { clockTime, localDate, timeZone } from './trip-time.ts'

/** Who added or last changed an entry, by name, and when. */
export const changeStamp = z.strictObject({
  displayName: z.string(),
  source: changeSource,
  at: z.iso.datetime(),
})
export type ChangeStamp = z.infer<typeof changeStamp>

/**
 * An entry as the API shows it. It lists on its start date, and an entry
 * past midnight carries the next date in `endsOn`.
 */
export const entry = entryFields.extend({
  id: z.string(),
  version: rowVersion,
  addedBy: changeStamp,
  changedBy: changeStamp,
})
export type Entry = z.infer<typeof entry>

interface Span {
  startsOn: string
  startTime: string
  endsOn: string
  endTime: string
}

/** Whether an entry's end falls before its start, read on one wall clock. */
export function endsBeforeStart(span: Span) {
  return `${span.endsOn}T${span.endTime}` < `${span.startsOn}T${span.startTime}`
}

const LAST_START_HOUR = 23

/**
 * The first whole hour after the last of `day`'s entries ends, 09:00 on an
 * empty day, and never past 23:00, for a new entry nobody named a time for.
 */
export function firstFreeHour(day: Span[]): string {
  if (day.length === 0) return '09:00'
  const last = day.reduce((latest, span) =>
    `${span.endsOn}T${span.endTime}` > `${latest.endsOn}T${latest.endTime}`
      ? span
      : latest,
  )
  const [hour, minute] = last.endTime.split(':').map(Number)
  const free = minute === 0 ? hour : hour + 1
  const pastMidnight = last.endsOn > last.startsOn
  const start = pastMidnight ? LAST_START_HOUR : Math.min(free, LAST_START_HOUR)
  return `${String(start).padStart(2, '0')}:00`
}

const endAfterStart = {
  message: 'An entry ends at or after its start',
  path: ['endTime'],
}

const title = z.string().trim().min(1).max(120)
// An emptied description is no description.
const notes = z
  .string()
  .trim()
  .max(2000)
  .transform((text) => (text === '' ? null : text))
  .nullable()
const costMinor = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

/**
 * A new entry. The client generates `id` as it does for a trip. The start
 * date falls inside the trip, and the zone defaults to the trip's.
 */
export const createEntryRequest = z
  .strictObject({
    id: z.uuid(),
    tripId: z.string(),
    title,
    notes: notes.default(null),
    kind: entryKind.nullable().default(null),
    startsOn: localDate,
    startTime: clockTime,
    endsOn: localDate,
    endTime: clockTime,
    timeZone: timeZone.optional(),
    costMinor: costMinor.nullable().default(null),
  })
  .refine((request) => !endsBeforeStart(request), endAfterStart)
export type CreateEntryRequest = z.input<typeof createEntryRequest>

/** A change to some of an entry's fields, at the version it was read. */
export const updateEntryRequest = z.strictObject({
  version: rowVersion,
  title: title.optional(),
  notes: notes.optional(),
  kind: entryKind.nullable().optional(),
  startsOn: localDate.optional(),
  startTime: clockTime.optional(),
  endsOn: localDate.optional(),
  endTime: clockTime.optional(),
  timeZone: timeZone.optional(),
  costMinor: costMinor.nullable().optional(),
})
export type UpdateEntryRequest = z.input<typeof updateEntryRequest>

/** The range read's query: start dates from `from` to `to`, both included. */
export const entryRange = z
  .strictObject({
    from: localDate,
    to: localDate,
    tripId: z.string().optional(),
  })
  .refine((range) => range.to >= range.from, {
    message: 'A range ends on or after it starts',
    path: ['to'],
  })
export type EntryRange = z.infer<typeof entryRange>

/** Live entries of live trips, by start date, start time, then end. */
export const entryList = z.strictObject({ entries: z.array(entry) })
export type EntryList = z.infer<typeof entryList>

export const entryRead = z.strictObject({ entry })
export type EntryRead = z.infer<typeof entryRead>

/** What a create or an update answers: the entry and the change to undo. */
export const entryWrite = z.strictObject({ entry, changeId: z.string() })
export type EntryWrite = z.infer<typeof entryWrite>
