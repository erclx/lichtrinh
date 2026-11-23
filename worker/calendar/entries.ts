import type { DeleteRequest, EntryFields, Removed } from '@shared/changes.ts'
import { entryFields } from '@shared/changes.ts'
import type {
  createEntryRequest,
  Entry,
  EntryRange,
  EntryWrite,
  updateEntryRequest,
} from '@shared/entries.ts'
import { endsBeforeStart } from '@shared/entries.ts'
import type { SQL } from 'drizzle-orm'
import {
  and,
  asc,
  eq,
  exists,
  gte,
  isNull,
  lte,
  notExists,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { z } from 'zod'

import { changes, entries, trips, users } from '../db/schema.ts'
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
import { liveTrip } from './trips.ts'

type EntryRow = typeof entries.$inferSelect

const addedBy = alias(users, 'added_by')
const changedBy = alias(users, 'changed_by')

export function entryFieldsOf(row: EntryRow): EntryFields {
  return {
    tripId: row.tripId,
    title: row.title,
    notes: row.notes,
    kind: row.kind,
    startsOn: row.startsOn,
    startTime: row.startTime,
    endsOn: row.endsOn,
    endTime: row.endTime,
    timeZone: row.timeZone,
    costMinor: row.costMinor,
  }
}

// An entry is live only while its trip is, so deleting a trip hides its
// entries without touching them, and undoing that delete shows them again.
function readEntries(db: Db, where: SQL | undefined) {
  return db
    .select({
      row: entries,
      addedName: addedBy.displayName,
      changedName: changedBy.displayName,
    })
    .from(entries)
    .innerJoin(trips, eq(trips.id, entries.tripId))
    .innerJoin(addedBy, eq(addedBy.id, entries.createdBy))
    .innerJoin(changedBy, eq(changedBy.id, entries.updatedBy))
    .where(and(isNull(entries.deletedAt), isNull(trips.deletedAt), where))
    .orderBy(
      asc(entries.startsOn),
      asc(entries.startTime),
      asc(entries.endsOn),
      asc(entries.endTime),
      asc(entries.id),
    )
    .then((rows) =>
      rows.map(({ row, addedName, changedName }): Entry => ({
        id: row.id,
        ...entryFieldsOf(row),
        version: row.version,
        addedBy: {
          displayName: addedName,
          source: row.createdSource,
          at: row.createdAt.toISOString(),
        },
        changedBy: {
          displayName: changedName,
          source: row.updatedSource,
          at: row.updatedAt.toISOString(),
        },
      })),
    )
}

export function listEntries(db: Db, range: EntryRange) {
  return readEntries(
    db,
    and(
      gte(entries.startsOn, range.from),
      lte(entries.startsOn, range.to),
      range.tripId === undefined ? undefined : eq(entries.tripId, range.tripId),
    ),
  )
}

export function entriesOfTrip(db: Db, tripId: string) {
  return readEntries(db, eq(entries.tripId, tripId))
}

export async function getEntry(db: Db, id: string) {
  const [entry] = await readEntries(db, eq(entries.id, id))
  return entry
}

async function liveEntry(db: Db, id: string) {
  const found = await db
    .select({ row: entries })
    .from(entries)
    .innerJoin(trips, eq(trips.id, entries.tripId))
    .where(
      and(
        eq(entries.id, id),
        isNull(entries.deletedAt),
        isNull(trips.deletedAt),
      ),
    )
    .get()
  return found?.row
}

/** The condition that the entry and its trip are live, at the version read. */
export function entryAt(db: Db, id: string, version: number) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(entries)
      .innerJoin(trips, eq(trips.id, entries.tripId))
      .where(
        and(
          eq(entries.id, id),
          eq(entries.version, version),
          isNull(entries.deletedAt),
          isNull(trips.deletedAt),
        ),
      ),
  )
}

/**
 * The condition that the trip holds `startsOn` among its dates. Only the
 * start date counts, since an entry lists on its start day alone and one
 * past midnight on a trip's last day ends after the trip.
 */
export function tripHolds(db: Db, tripId: string, startsOn: string) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(trips)
      .where(
        and(
          eq(trips.id, tripId),
          lte(trips.startsOn, startsOn),
          gte(trips.endsOn, startsOn),
        ),
      ),
  )
}

async function whyRefused(db: Db, id: string, version: number) {
  const row = await liveEntry(db, id)
  if (row === undefined) return refused('not_found')
  if (row.version !== version) return refused('edit_conflict')
  return refused('entries_outside_range')
}

async function written(db: Db, id: string, changeId: string) {
  const entry = await getEntry(db, id)
  if (entry === undefined) throw new Error('A written entry did not read back')
  return { entry, changeId }
}

export async function createEntry(
  db: Db,
  actor: Actor,
  request: z.output<typeof createEntryRequest>,
  at: Date,
): Promise<EntryWrite | Refused> {
  const trip = await liveTrip(db, request.tripId)
  if (trip === undefined) return refused('not_found')
  const { id } = request
  const fields: EntryFields = {
    tripId: request.tripId,
    title: request.title,
    notes: request.notes,
    kind: request.kind,
    startsOn: request.startsOn,
    startTime: request.startTime,
    endsOn: request.endsOn,
    endTime: request.endTime,
    timeZone: request.timeZone ?? trip.timeZone,
    costMinor: request.costMinor,
  }
  const changeId = crypto.randomUUID()
  const [, guard] = await db.batch([
    deferForeignKeys(db),
    recordChange(
      db,
      actor,
      at,
      {
        id: changeId,
        tripId: fields.tripId,
        op: 'create',
        entity: 'entry',
        entityId: id,
        before: null,
        after: fields,
      },
      and(
        notExists(
          db
            .select({ one: sql`1` })
            .from(entries)
            .where(eq(entries.id, id)),
        ),
        exists(
          db
            .select({ one: sql`1` })
            .from(trips)
            .where(and(eq(trips.id, fields.tripId), isNull(trips.deletedAt))),
        ),
        tripHolds(db, fields.tripId, fields.startsOn),
      ) ?? sql`1`,
    ),
    insertWhen(
      db,
      entries,
      {
        id,
        ...fields,
        version: 1,
        createdBy: actor.userId,
        createdSource: actor.source,
        createdAt: at.getTime(),
        updatedBy: actor.userId,
        updatedSource: actor.source,
        updatedAt: at.getTime(),
      },
      recorded(db, changeId),
    ),
  ])
  if (guard.meta.changes === 0) return createRefused(db, id, fields)
  logOutcome('entry_created', { entryId: id, changeId, byUserId: actor.userId })
  return written(db, id, changeId)
}

// A taken id is a retry of that create or a client bug, as for a trip.
async function createRefused(
  db: Db,
  id: string,
  fields: EntryFields,
): Promise<EntryWrite | Refused> {
  const created = await db
    .select({ id: changes.id, after: changes.after })
    .from(changes)
    .where(
      and(
        eq(changes.entity, 'entry'),
        eq(changes.entityId, id),
        eq(changes.op, 'create'),
      ),
    )
    .get()
  if (created === undefined) {
    const trip = await liveTrip(db, fields.tripId)
    return refused(trip === undefined ? 'not_found' : 'entries_outside_range')
  }
  const entry = await getEntry(db, id)
  const stored =
    created.after === null ? null : entryFields.parse(JSON.parse(created.after))
  if (entry === undefined || !sameFields(stored, fields)) {
    return refused('id_conflict')
  }
  return { entry, changeId: created.id }
}

export async function updateEntry(
  db: Db,
  actor: Actor,
  id: string,
  request: z.output<typeof updateEntryRequest>,
  at: Date,
): Promise<EntryWrite | Refused> {
  const row = await liveEntry(db, id)
  if (row === undefined) return refused('not_found')
  if (row.version !== request.version) return refused('edit_conflict')
  const before = entryFieldsOf(row)
  const after: EntryFields = {
    tripId: before.tripId,
    title: request.title ?? before.title,
    notes: request.notes === undefined ? before.notes : request.notes,
    kind: request.kind === undefined ? before.kind : request.kind,
    startsOn: request.startsOn ?? before.startsOn,
    startTime: request.startTime ?? before.startTime,
    endsOn: request.endsOn ?? before.endsOn,
    endTime: request.endTime ?? before.endTime,
    timeZone: request.timeZone ?? before.timeZone,
    costMinor:
      request.costMinor === undefined ? before.costMinor : request.costMinor,
  }
  if (endsBeforeStart(after)) return refused('validation_failed')
  const changeId = crypto.randomUUID()
  const [, guard] = await db.batch([
    deferForeignKeys(db),
    recordChange(
      db,
      actor,
      at,
      {
        id: changeId,
        tripId: before.tripId,
        op: 'update',
        entity: 'entry',
        entityId: id,
        before,
        after,
      },
      and(
        entryAt(db, id, request.version),
        tripHolds(db, after.tripId, after.startsOn),
      ) ?? sql`1`,
    ),
    db
      .update(entries)
      .set({
        ...after,
        version: sql`${entries.version} + 1`,
        ...stampedBy(actor, at),
      })
      .where(and(eq(entries.id, id), recorded(db, changeId))),
  ])
  if (guard.meta.changes === 0) return whyRefused(db, id, request.version)
  logOutcome('entry_updated', { entryId: id, changeId, byUserId: actor.userId })
  return written(db, id, changeId)
}

export async function deleteEntry(
  db: Db,
  actor: Actor,
  id: string,
  request: DeleteRequest,
  at: Date,
): Promise<Removed | Refused> {
  const row = await liveEntry(db, id)
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
        tripId: row.tripId,
        op: 'delete',
        entity: 'entry',
        entityId: id,
        before: entryFieldsOf(row),
        after: null,
      },
      entryAt(db, id, request.version),
    ),
    db
      .update(entries)
      .set({
        deletedAt: at,
        version: sql`${entries.version} + 1`,
        ...stampedBy(actor, at),
      })
      .where(and(eq(entries.id, id), recorded(db, changeId))),
  ])
  if (guard.meta.changes === 0) return whyRefused(db, id, request.version)
  logOutcome('entry_deleted', { entryId: id, changeId, byUserId: actor.userId })
  return { changeId }
}
