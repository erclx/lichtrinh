import { z } from 'zod'

import { clockTime, localDate } from './trip-time.ts'

/** Who made a change: a person in the app, or the assistant for them. */
export const changeSource = z.enum(['person', 'assistant'])
export type ChangeSource = z.infer<typeof changeSource>

/**
 * A row's version, which every update and delete sends back as read, so a
 * write made against a stale copy is refused rather than overwriting.
 */
export const rowVersion = z.number().int().min(1)

export const deleteRequest = z.strictObject({ version: rowVersion })
export type DeleteRequest = z.infer<typeof deleteRequest>

/** What a delete answers: the change to pass to undo. */
export const removed = z.strictObject({ changeId: z.string() })
export type Removed = z.infer<typeof removed>

// The fields a person sets on a trip, which the change log snapshots. Read
// back from storage, so it checks shape rather than the input rules.
export const tripFields = z.strictObject({
  name: z.string(),
  startsOn: localDate,
  endsOn: localDate,
  timeZone: z.string(),
  currency: z.string(),
  homeCurrency: z.string(),
})
export type TripFields = z.infer<typeof tripFields>

export const entryKind = z.enum([
  'food',
  'sights',
  'rest',
  'transport',
  'activity',
])
export type EntryKind = z.infer<typeof entryKind>

// The fields a person sets on an entry, snapshotted the same way. The
// times read on the wall in `timeZone`, and `costMinor` is an integer in
// the trip currency's minor unit.
export const entryFields = z.strictObject({
  tripId: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  kind: entryKind.nullable(),
  startsOn: localDate,
  startTime: clockTime,
  endsOn: localDate,
  endTime: clockTime,
  timeZone: z.string(),
  costMinor: z.number().int().nullable(),
})
export type EntryFields = z.infer<typeof entryFields>
