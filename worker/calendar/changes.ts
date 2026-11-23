import type {
  Change,
  ChangePage,
  changePageQuery,
  EntryFields,
  TripFields,
  Undone,
  UndoRequest,
} from '@shared/changes.ts'
import { entryFields, tripFields } from '@shared/changes.ts'
import type { SQL } from 'drizzle-orm'
import { and, desc, eq, exists, isNull, lt, notExists, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { z } from 'zod'

import { changes, entries, trips, users } from '../db/schema.ts'
import { logOutcome } from '../log.ts'
import { entryFieldsOf, tripHolds } from './entries.ts'
import type { Actor, Db, Refused } from './record.ts'
import {
  deferForeignKeys,
  recordChange,
  recorded,
  refused,
  sameFields,
  stampedBy,
} from './record.ts'
import { holdsEveryEntry, liveTrip, tripFieldsOf } from './trips.ts'

type ChangeRow = typeof changes.$inferSelect

const undoer = alias(changes, 'undoer')

// A snapshot read back from storage is input, so it is parsed, not trusted.
function parseSide<S extends z.ZodType>(schema: S, side: string | null) {
  return side === null ? null : (schema.parse(JSON.parse(side)) as z.output<S>)
}

function snapshotSchema(row: ChangeRow) {
  return row.entity === 'trip' ? tripFields : entryFields
}

function readChanges(db: Db, where: SQL | undefined) {
  return db
    .select({
      row: changes,
      actorName: users.displayName,
      undoneBy: undoer.id,
    })
    .from(changes)
    .innerJoin(users, eq(users.id, changes.userId))
    .leftJoin(undoer, eq(undoer.undoes, changes.id))
    .where(where)
    .orderBy(desc(changes.seq))
}

function toChange({
  row,
  actorName,
  undoneBy,
}: {
  row: ChangeRow
  actorName: string
  undoneBy: string | null
}): Change {
  const base = {
    id: row.id,
    at: row.createdAt.toISOString(),
    actor: { id: row.userId, displayName: actorName },
    source: row.source,
    op: row.op,
    entityId: row.entityId,
    undoneBy,
  }
  return row.entity === 'trip'
    ? {
        ...base,
        entity: 'trip',
        before: parseSide(tripFields, row.before),
        after: parseSide(tripFields, row.after),
      }
    : {
        ...base,
        entity: 'entry',
        before: parseSide(entryFields, row.before),
        after: parseSide(entryFields, row.after),
      }
}

async function readChange(db: Db, id: string) {
  const [found] = await readChanges(db, eq(changes.id, id)).limit(1)
  if (found === undefined)
    throw new Error('A recorded change did not read back')
  return toChange(found)
}

/**
 * A live trip's history, its own changes and its entries', newest first.
 * A deleted trip answers not found, like every other read of it, so undoing
 * its delete goes through the change id the delete answered.
 */
export async function listChanges(
  db: Db,
  tripId: string,
  query: z.output<typeof changePageQuery>,
): Promise<ChangePage | Refused> {
  if ((await liveTrip(db, tripId)) === undefined) return refused('not_found')
  const older =
    query.before === undefined
      ? undefined
      : lt(
          changes.seq,
          db
            .select({ seq: undoer.seq })
            .from(undoer)
            .where(eq(undoer.id, query.before)),
        )
  const rows = await readChanges(
    db,
    and(eq(changes.tripId, tripId), older),
  ).limit(query.limit + 1)
  const page = rows.slice(0, query.limit).map(toChange)
  const more = rows.length > query.limit
  return { changes: page, nextBefore: more ? page[page.length - 1].id : null }
}

interface RowState {
  version: number
  // Null while the row is deleted.
  current: TripFields | EntryFields | null
}

async function stateOf(db: Db, row: ChangeRow): Promise<RowState | undefined> {
  if (row.entity === 'trip') {
    const trip = await db
      .select()
      .from(trips)
      .where(eq(trips.id, row.entityId))
      .get()
    return (
      trip && {
        version: trip.version,
        current: trip.deletedAt === null ? tripFieldsOf(trip) : null,
      }
    )
  }
  const entry = await db
    .select()
    .from(entries)
    .where(eq(entries.id, row.entityId))
    .get()
  return (
    entry && {
      version: entry.version,
      current: entry.deletedAt === null ? entryFieldsOf(entry) : null,
    }
  )
}

function findChange(db: Db, where: SQL) {
  return db.select().from(changes).where(where).get()
}

/**
 * Undoes one change by writing its `before` back as a new `undo` change.
 * Refuses with `undo_conflict` unless the row still holds what the change
 * left, since restoring over a later edit would erase it.
 */
export async function undoChange(
  db: Db,
  actor: Actor,
  changeId: string,
  request: UndoRequest,
  at: Date,
): Promise<Undone | Refused> {
  const { undoId } = request
  const target = await findChange(db, eq(changes.id, changeId))
  if (target === undefined) return refused('not_found')
  const settled = await settledUndo(db, target.id, undoId)
  if (settled !== undefined) return settled
  const state = await stateOf(db, target)
  if (state === undefined) return refused('not_found')
  const left = parseSide(snapshotSchema(target), target.after)
  if (!sameFields(state.current, left)) return refused('undo_conflict')
  const plan =
    target.entity === 'trip'
      ? undoTrip(
          db,
          actor,
          at,
          target,
          state,
          parseSide(tripFields, target.before),
        )
      : undoEntry(
          db,
          actor,
          at,
          target,
          state,
          parseSide(entryFields, target.before),
        )
  const [, guard] = await db.batch([
    deferForeignKeys(db),
    recordChange(
      db,
      actor,
      at,
      {
        id: undoId,
        tripId: target.tripId,
        op: 'undo',
        entity: target.entity,
        entityId: target.entityId,
        before: state.current,
        after: plan.restore,
        undoes: target.id,
        rezoned: plan.rezoned,
      },
      and(
        plan.condition,
        notExists(
          db
            .select({ one: sql`1` })
            .from(undoer)
            .where(eq(undoer.undoes, target.id)),
        ),
      ) ?? plan.condition,
    ),
    ...plan.writes(recorded(db, undoId)),
  ])
  if (guard.meta.changes === 0) {
    const raced = await settledUndo(db, target.id, undoId)
    if (raced !== undefined) return raced
    const now = await stateOf(db, target)
    return refused(
      now?.version === state.version
        ? 'entries_outside_range'
        : 'undo_conflict',
    )
  }
  logOutcome('change_undone', { changeId: undoId, byUserId: actor.userId })
  return { change: await readChange(db, undoId) }
}

// An undo already on record: this same request retried, another undo of the
// change, or the undo id taken by an undo of something else.
async function settledUndo(
  db: Db,
  targetId: string,
  undoId: string,
): Promise<Undone | Refused | undefined> {
  const [byId, byTarget] = await Promise.all([
    findChange(db, eq(changes.id, undoId)),
    findChange(db, eq(changes.undoes, targetId)),
  ])
  if (byId !== undefined) {
    if (byId.undoes !== targetId) return refused('id_conflict')
    return { change: await readChange(db, undoId) }
  }
  if (byTarget !== undefined) return refused('already_undone')
  return undefined
}

function undoTrip(
  db: Db,
  actor: Actor,
  at: Date,
  target: ChangeRow,
  state: RowState,
  restore: TripFields | null,
) {
  const id = target.entityId
  const atVersion = exists(
    db
      .select({ one: sql`1` })
      .from(trips)
      .where(and(eq(trips.id, id), eq(trips.version, state.version))),
  )
  const fromZone = state.current?.timeZone
  // Moves back only the entries the change carried that still sit in the
  // zone it moved them to, so an entry given its own zone since stays put.
  const rezone =
    fromZone !== undefined && restore !== null && fromZone !== restore.timeZone
      ? and(
          sql`${entries.id} in (select value from json_each(${target.rezonedEntryIds ?? '[]'}))`,
          eq(entries.tripId, id),
          eq(entries.timeZone, fromZone),
          isNull(entries.deletedAt),
        )
      : undefined
  return {
    restore,
    condition:
      restore === null
        ? atVersion
        : (and(atVersion, holdsEveryEntry(db, id, restore)) ?? atVersion),
    rezoned:
      rezone === undefined
        ? undefined
        : sql`(select json_group_array(${entries.id}) from ${entries} where ${rezone})`,
    writes: (landed: SQL) => [
      db
        .update(trips)
        .set(
          restore === null
            ? { deletedAt: at, version: sql`${trips.version} + 1` }
            : {
                ...restore,
                deletedAt: null,
                version: sql`${trips.version} + 1`,
              },
        )
        .where(and(eq(trips.id, id), landed)),
      ...(rezone === undefined || restore === null
        ? []
        : [
            db
              .update(entries)
              .set({
                timeZone: restore.timeZone,
                version: sql`${entries.version} + 1`,
                ...stampedBy(actor, at),
              })
              .where(and(rezone, landed)),
          ]),
    ],
  }
}

function undoEntry(
  db: Db,
  actor: Actor,
  at: Date,
  target: ChangeRow,
  state: RowState,
  restore: EntryFields | null,
) {
  const id = target.entityId
  const atVersion = exists(
    db
      .select({ one: sql`1` })
      .from(entries)
      .where(and(eq(entries.id, id), eq(entries.version, state.version))),
  )
  return {
    restore,
    condition:
      restore === null
        ? atVersion
        : (and(atVersion, tripHolds(db, restore.tripId, restore.startsOn)) ??
          atVersion),
    rezoned: undefined,
    writes: (landed: SQL) => [
      db
        .update(entries)
        .set({
          ...(restore === null
            ? { deletedAt: at }
            : { ...restore, deletedAt: null }),
          version: sql`${entries.version} + 1`,
          ...stampedBy(actor, at),
        })
        .where(and(eq(entries.id, id), landed)),
    ],
  }
}
