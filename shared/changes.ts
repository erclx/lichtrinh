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

export const changeOp = z.enum(['create', 'update', 'delete', 'undo'])
export type ChangeOp = z.infer<typeof changeOp>

const changeBase = {
  id: z.string(),
  at: z.iso.datetime(),
  actor: z.strictObject({ id: z.string(), displayName: z.string() }),
  source: changeSource,
  op: changeOp,
  entityId: z.string(),
  // The undo change that reversed this one, or null while it stands.
  undoneBy: z.string().nullable(),
}

/**
 * One write in a trip's history. `before` and `after` snapshot the entity's
 * fields on either side, null where it was absent or deleted, and an undo
 * records the state it restored as its `after`.
 */
export const change = z.discriminatedUnion('entity', [
  z.strictObject({
    ...changeBase,
    entity: z.literal('trip'),
    before: tripFields.nullable(),
    after: tripFields.nullable(),
  }),
  z.strictObject({
    ...changeBase,
    entity: z.literal('entry'),
    before: entryFields.nullable(),
    after: entryFields.nullable(),
  }),
])
export type Change = z.infer<typeof change>

/** The history query: changes older than `before`, newest first. */
export const changePageQuery = z.strictObject({
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
export type ChangePageQuery = z.input<typeof changePageQuery>

/** A page of history, with `nextBefore` to read the next or null at the end. */
export const changePage = z.strictObject({
  changes: z.array(change),
  nextBefore: z.string().nullable(),
})
export type ChangePage = z.infer<typeof changePage>

/**
 * An undo, under an id the client generates, so a retry answers the stored
 * undo. A change is undone at most once, and an undo is a change that can
 * itself be undone.
 */
export const undoRequest = z.strictObject({ undoId: z.uuid() })
export type UndoRequest = z.infer<typeof undoRequest>

export const undone = z.strictObject({ change })
export type Undone = z.infer<typeof undone>
