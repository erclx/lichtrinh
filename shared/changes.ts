import { z } from 'zod'

import { localDate } from './trip-time.ts'

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
