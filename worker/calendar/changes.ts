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
import { and, desc, eq, exists, inArray, isNull, lt, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { z } from 'zod'

import { changes, entries, trips, users } from '../db/schema.ts'
import { logOutcome } from '../log.ts'
import { entryFieldsOf, tripHolds } from './entries.ts'
import type { Actor, Db, Refused } from './record.ts'
import {
  claimChange,
  deferForeignKeys,
  isConstraintFailure,
  recorded,
  refused,
  sameFields,
  stampedBy,
} from './record.ts'
import {
  brokenMoveRule,
  liveTrip,
  tripFieldsOf,
  tripMoveHolds,
} from './trips.ts'

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

// D1 binds at most 100 parameters to one statement.
const IDS_PER_QUERY = 90

/**
 * The changes with these ids, keyed by id, in one query per 90 ids. An id
 * with no change is left out, whatever trip each belongs to.
 */
export async function changesByIds(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, Change>> {
  const unique = [...new Set(ids)]
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += IDS_PER_QUERY) {
    chunks.push(unique.slice(i, i + IDS_PER_QUERY))
  }
  const pages = await Promise.all(
    chunks.map((chunk) => readChanges(db, inArray(changes.id, chunk))),
  )
  return new Map(pages.flat().map((row) => [row.row.id, toChange(row)]))
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
 * Writes a change's `before` back as an `undo` change, refusing unless the row
 * still holds what it left. The `undoes` index and the undo id's key abort a
 * second undo of it, so concurrent retries apply once.
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
          await tripCurrencyAt(db, target),
        )
  try {
    await db.batch([
      deferForeignKeys(db),
      claimChange(
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
        plan.condition,
      ),
      ...plan.writes(recorded(db, undoId)),
    ])
  } catch (error) {
    if (!isConstraintFailure(error)) throw error
    const raced = await settledUndo(db, target.id, undoId)
    if (raced !== undefined) return raced
    const now = await stateOf(db, target)
    if (now?.version !== state.version) return refused('undo_conflict')
    return plan.brokenRule()
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

// Moves back only the entries the change carried that still sit in the zone
// it moved them to, so an entry given its own zone since stays put.
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
  const current =
    state.current !== null && 'currency' in state.current ? state.current : null
  const fromZone = current?.timeZone
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
        : (and(atVersion, tripMoveHolds(db, id, current, restore)) ??
          atVersion),
    brokenRule: (): Promise<Refused> =>
      restore === null
        ? Promise.resolve(refused('undo_conflict'))
        : brokenMoveRule(db, id, current, restore),
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

// The trip currency in force when the target change was made, read off the
// trip's last change before it, which every trip has from its create.
async function tripCurrencyAt(db: Db, target: ChangeRow) {
  const last = await db
    .select({ before: changes.before, after: changes.after })
    .from(changes)
    .where(
      and(
        eq(changes.entity, 'trip'),
        eq(changes.entityId, target.tripId),
        lt(changes.seq, target.seq),
      ),
    )
    .orderBy(desc(changes.seq))
    .get()
  return parseSide(tripFields, last?.after ?? last?.before ?? null)?.currency
}

// A restored cost was written in the currency of its own change, so it lands
// only while the trip still uses that currency.
function undoEntry(
  db: Db,
  actor: Actor,
  at: Date,
  target: ChangeRow,
  state: RowState,
  restore: EntryFields | null,
  currencyThen: string | undefined,
) {
  const id = target.entityId
  const atVersion = exists(
    db
      .select({ one: sql`1` })
      .from(entries)
      .where(and(eq(entries.id, id), eq(entries.version, state.version))),
  )
  const costCurrency =
    restore?.costMinor != null && currencyThen !== undefined
      ? currencyThen
      : undefined
  const stillPriced =
    restore === null || costCurrency === undefined
      ? undefined
      : exists(
          db
            .select({ one: sql`1` })
            .from(trips)
            .where(
              and(
                eq(trips.id, restore.tripId),
                eq(trips.currency, costCurrency),
              ),
            ),
        )
  return {
    restore,
    condition:
      restore === null
        ? atVersion
        : (and(
            atVersion,
            tripHolds(db, restore.tripId, restore.startsOn),
            stillPriced,
          ) ?? atVersion),
    brokenRule: async (): Promise<Refused> => {
      if (restore === null || costCurrency === undefined) {
        return refused('entries_outside_range')
      }
      const trip = await db
        .select({ currency: trips.currency })
        .from(trips)
        .where(eq(trips.id, restore.tripId))
        .get()
      return refused(
        trip?.currency === costCurrency
          ? 'entries_outside_range'
          : 'currency_has_costs',
      )
    },
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
