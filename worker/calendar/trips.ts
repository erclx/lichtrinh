import type { DeleteRequest, Removed, TripFields } from '@shared/changes.ts'
import { tripFields } from '@shared/changes.ts'
import type {
  createTripRequest,
  Trip,
  TripWrite,
  updateTripRequest,
} from '@shared/trips.ts'
import {
  and,
  asc,
  eq,
  exists,
  gt,
  isNotNull,
  isNull,
  lt,
  notExists,
  or,
  sql,
} from 'drizzle-orm'
import type { z } from 'zod'

import { changes, entries, trips } from '../db/schema.ts'
import { logOutcome } from '../log.ts'
import type { Actor, Db, Refused } from './record.ts'
import {
  deferForeignKeys,
  insertWhen,
  recordChange,
  recorded,
  refused,
  sameFields,
  stampedBy,
} from './record.ts'

type TripRow = typeof trips.$inferSelect

export function tripFieldsOf(row: TripRow): TripFields {
  return {
    name: row.name,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    timeZone: row.timeZone,
    currency: row.currency,
    homeCurrency: row.homeCurrency,
  }
}

export function toTrip(row: TripRow): Trip {
  return { id: row.id, ...tripFieldsOf(row), version: row.version }
}

/** The condition that the trip is live and still at the version read. */
export function tripAt(db: Db, id: string, version: number) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(trips)
      .where(
        and(
          eq(trips.id, id),
          eq(trips.version, version),
          isNull(trips.deletedAt),
        ),
      ),
  )
}

/**
 * The condition that every live entry of the trip starts inside `dates`,
 * since an entry outside its trip's dates drops out of every view.
 */
export function holdsEveryEntry(
  db: Db,
  tripId: string,
  dates: { startsOn: string; endsOn: string },
) {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(entries)
      .where(
        and(
          eq(entries.tripId, tripId),
          isNull(entries.deletedAt),
          or(
            lt(entries.startsOn, dates.startsOn),
            gt(entries.startsOn, dates.endsOn),
          ),
        ),
      ),
  )
}

// A cost is stored in the trip currency's minor unit, so a new currency
// would reread every cost, and no exchange rate exists to rescale them.
function costedEntries(db: Db, tripId: string) {
  return db
    .select({ one: sql`1` })
    .from(entries)
    .where(
      and(
        eq(entries.tripId, tripId),
        isNull(entries.deletedAt),
        isNotNull(entries.costMinor),
      ),
    )
}

/**
 * The conditions a trip moving from `from` to `to` meets, where a null
 * `from` is a deleted trip coming back: every live entry inside the new
 * dates, and no live cost when the currency changes.
 */
export function tripMoveHolds(
  db: Db,
  id: string,
  from: TripFields | null,
  to: TripFields,
) {
  const datesMoved =
    from === null || from.startsOn !== to.startsOn || from.endsOn !== to.endsOn
  const currencyMoved = from !== null && from.currency !== to.currency
  return and(
    datesMoved ? holdsEveryEntry(db, id, to) : undefined,
    currencyMoved ? notExists(costedEntries(db, id)) : undefined,
  )
}

/** Which rule a refused `tripMoveHolds()` broke, read from the rows now. */
export async function brokenMoveRule(
  db: Db,
  id: string,
  from: TripFields | null,
  to: TripFields,
): Promise<Refused> {
  const currencyMoved = from !== null && from.currency !== to.currency
  if (currencyMoved && (await costedEntries(db, id).get()) !== undefined) {
    return refused('currency_has_costs')
  }
  return refused('entries_outside_range')
}

export function liveTrip(db: Db, id: string) {
  return db
    .select()
    .from(trips)
    .where(and(eq(trips.id, id), isNull(trips.deletedAt)))
    .get()
}

// Classifies a write whose guard refused it, from the row as it stands now.
async function whyRefused(
  db: Db,
  id: string,
  version: number,
  move?: { from: TripFields; to: TripFields },
) {
  const row = await liveTrip(db, id)
  if (row === undefined) return refused('not_found')
  if (row.version !== version || move === undefined) {
    return refused('edit_conflict')
  }
  return brokenMoveRule(db, id, move.from, move.to)
}

export function listTrips(db: Db): Promise<Trip[]> {
  return db
    .select()
    .from(trips)
    .where(isNull(trips.deletedAt))
    .orderBy(asc(trips.startsOn), asc(trips.endsOn), asc(trips.id))
    .then((rows) => rows.map(toTrip))
}

export async function createTrip(
  db: Db,
  actor: Actor,
  request: z.output<typeof createTripRequest>,
  at: Date,
): Promise<TripWrite | Refused> {
  const { id, ...fields } = request
  const changeId = crypto.randomUUID()
  const [, guard] = await db.batch([
    deferForeignKeys(db),
    recordChange(
      db,
      actor,
      at,
      {
        id: changeId,
        tripId: id,
        op: 'create',
        entity: 'trip',
        entityId: id,
        before: null,
        after: fields,
      },
      sql`not exists (select 1 from trips where id = ${id})`,
    ),
    insertWhen(
      db,
      trips,
      { id, ...fields, version: 1 },
      recorded(db, changeId),
    ),
  ])
  if (guard.meta.changes === 0) return replayCreate(db, id, fields)
  logOutcome('trip_created', { tripId: id, changeId, byUserId: actor.userId })
  const row = await liveTrip(db, id)
  if (row === undefined) throw new Error('A created trip did not read back')
  return { trip: toTrip(row), changeId }
}

// The id is taken, so this is a retry of that create or a client bug. A
// retry carries the body the first create stored, and answers what the
// first one answered.
async function replayCreate(
  db: Db,
  id: string,
  fields: TripFields,
): Promise<TripWrite | Refused> {
  const [row, created] = await Promise.all([
    liveTrip(db, id),
    db
      .select({ id: changes.id, after: changes.after })
      .from(changes)
      .where(
        and(
          eq(changes.entity, 'trip'),
          eq(changes.entityId, id),
          eq(changes.op, 'create'),
        ),
      )
      .get(),
  ])
  if (row === undefined || created?.after == null) {
    return refused('id_conflict')
  }
  const stored = tripFields.parse(JSON.parse(created.after))
  if (!sameFields(stored, fields)) return refused('id_conflict')
  return { trip: toTrip(row), changeId: created.id }
}

// A zone change reads the entries it carries inside the batch, so the change
// row names exactly the entries the rewrite moves.
export async function updateTrip(
  db: Db,
  actor: Actor,
  id: string,
  request: z.output<typeof updateTripRequest>,
  at: Date,
): Promise<TripWrite | Refused> {
  const row = await liveTrip(db, id)
  if (row === undefined) return refused('not_found')
  if (row.version !== request.version) return refused('edit_conflict')
  const before = tripFieldsOf(row)
  const after: TripFields = {
    name: request.name ?? before.name,
    startsOn: request.startsOn ?? before.startsOn,
    endsOn: request.endsOn ?? before.endsOn,
    timeZone: request.timeZone ?? before.timeZone,
    currency: request.currency ?? before.currency,
    homeCurrency: request.homeCurrency ?? before.homeCurrency,
  }
  if (after.endsOn < after.startsOn) return refused('validation_failed')
  const changeId = crypto.randomUUID()
  const zoneMoved = after.timeZone !== before.timeZone
  const inOldZone = and(
    eq(entries.tripId, id),
    eq(entries.timeZone, before.timeZone),
    isNull(entries.deletedAt),
  )
  const rezone = db
    .update(entries)
    .set({
      timeZone: after.timeZone,
      version: sql`${entries.version} + 1`,
      ...stampedBy(actor, at),
    })
    .where(and(inOldZone, recorded(db, changeId)))
  const [, guard, updated] = await db.batch([
    deferForeignKeys(db),
    recordChange(
      db,
      actor,
      at,
      {
        id: changeId,
        tripId: id,
        op: 'update',
        entity: 'trip',
        entityId: id,
        before,
        after,
        rezoned: zoneMoved
          ? sql`(select json_group_array(${entries.id}) from ${entries} where ${inOldZone})`
          : undefined,
      },
      and(
        tripAt(db, id, request.version),
        tripMoveHolds(db, id, before, after),
      ) ?? sql`1`,
    ),
    db
      .update(trips)
      .set({ ...after, version: sql`${trips.version} + 1` })
      .where(and(eq(trips.id, id), recorded(db, changeId)))
      .returning(),
    ...(zoneMoved ? [rezone] : []),
  ])
  const trip = updated[0]
  if (guard.meta.changes === 0 || trip === undefined) {
    return whyRefused(db, id, request.version, { from: before, to: after })
  }
  logOutcome('trip_updated', { tripId: id, changeId, byUserId: actor.userId })
  return { trip: toTrip(trip), changeId }
}

/**
 * Soft-deletes the trip and leaves its entries as they are, so undoing the
 * delete brings the trip back with every entry it held.
 */
export async function deleteTrip(
  db: Db,
  actor: Actor,
  id: string,
  request: DeleteRequest,
  at: Date,
): Promise<Removed | Refused> {
  const row = await liveTrip(db, id)
  if (row === undefined) return refused('not_found')
  if (row.version !== request.version) return refused('edit_conflict')
  const changeId = crypto.randomUUID()
  const [, guard] = await db.batch([
    deferForeignKeys(db),
    recordChange(
      db,
      actor,
      at,
      {
        id: changeId,
        tripId: id,
        op: 'delete',
        entity: 'trip',
        entityId: id,
        before: tripFieldsOf(row),
        after: null,
      },
      tripAt(db, id, request.version),
    ),
    db
      .update(trips)
      .set({ deletedAt: at, version: sql`${trips.version} + 1` })
      .where(and(eq(trips.id, id), recorded(db, changeId))),
  ])
  if (guard.meta.changes === 0) return whyRefused(db, id, request.version)
  logOutcome('trip_deleted', { tripId: id, changeId, byUserId: actor.userId })
  return { changeId }
}
