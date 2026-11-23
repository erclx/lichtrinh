import type { ChangeSource } from '@shared/changes.ts'
import type { ApiErrorCode } from '@shared/errors.ts'
import {
  and,
  eq,
  exists,
  getTableColumns,
  is,
  notExists,
  SQL,
  sql,
} from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'

import type { createDb } from '../db/client.ts'
import { changes } from '../db/schema.ts'

export type Db = ReturnType<typeof createDb>

/** Who a calendar write is for, and whether they made it or the assistant. */
export interface Actor {
  userId: string
  source: ChangeSource
}

/** A refusal a caller branches on, as the API's error code. */
export interface Refused {
  refused: Extract<
    ApiErrorCode,
    | 'not_found'
    | 'validation_failed'
    | 'edit_conflict'
    | 'id_conflict'
    | 'entries_outside_range'
    | 'currency_has_costs'
    | 'undo_conflict'
    | 'already_undone'
  >
}

export function refused(code: Refused['refused']): Refused {
  return { refused: code }
}

export function isRefused(outcome: object): outcome is Refused {
  return 'refused' in outcome
}

interface ChangeRecord {
  id: string
  tripId: string
  op: 'create' | 'update' | 'delete' | 'undo'
  entity: 'trip' | 'entry'
  entityId: string
  before: object | null
  after: object | null
  undoes?: string
  // A subquery yielding the JSON array of entries a zone change moves.
  rezoned?: SQL
}

// D1 checks a foreign key per statement unless told to wait for the end of
// the batch, and the change row lands ahead of the trip a create inserts.
export function deferForeignKeys(db: Db) {
  return db.run(sql`pragma defer_foreign_keys = on`)
}

type Stored = SQL | string | number | null

/**
 * One row inserted only while `condition` holds, laid out in table column
 * order with a missing column null. Drizzle's D1 batch binds no raw SQL.
 */
export function insertWhen<T extends SQLiteTable>(
  db: Db,
  table: T,
  values: Partial<Record<keyof T['$inferSelect'], Stored>>,
  condition: SQL,
) {
  const row = Object.keys(getTableColumns(table)).map((key) => {
    const value: Stored = values[key as keyof T['$inferSelect']] ?? null
    return is(value, SQL) ? value : sql`${value}`
  })
  return db
    .insert(table)
    .select(sql`select ${sql.join(row, sql`, `)} where ${condition}`)
}

/**
 * Opens every calendar write batch, inserting the change row only while
 * `condition` holds. Later statements carry `recorded()`, so a refused check
 * leaves no write and no orphan change.
 */
export function recordChange(
  db: Db,
  actor: Actor,
  at: Date,
  change: ChangeRecord,
  condition: SQL,
) {
  return insertWhen(
    db,
    changes,
    changeRow(actor, at, change, nextSeq),
    and(condition, notExists(changeWithId(db, change.id))) ?? condition,
  )
}

/**
 * The opening statement for a change under a client-chosen id. A refused
 * `condition` nulls `seq` and a taken id breaks the key, so either aborts the
 * whole batch, since `recorded()` cannot tell this batch's row from a retry's.
 */
export function claimChange(
  db: Db,
  actor: Actor,
  at: Date,
  change: ChangeRecord,
  condition: SQL,
) {
  const seq = sql`case when ${condition} then ${nextSeq} end`
  return insertWhen(db, changes, changeRow(actor, at, change, seq), sql`1`)
}

/** Whether a batch failed on a constraint, as `claimChange()` aborts one. */
export function isConstraintFailure(error: unknown) {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (/constraint failed/i.test(cause.message)) return true
  }
  return false
}

const nextSeq = sql`(select coalesce(max(${changes.seq}), 0) + 1 from ${changes})`

function changeWithId(db: Db, id: string) {
  return db
    .select({ one: sql`1` })
    .from(changes)
    .where(eq(changes.id, id))
}

function changeRow(actor: Actor, at: Date, change: ChangeRecord, seq: SQL) {
  const snapshot = (fields: object | null) =>
    fields === null ? null : JSON.stringify(fields)
  return {
    id: change.id,
    seq,
    tripId: change.tripId,
    userId: actor.userId,
    source: actor.source,
    op: change.op,
    entity: change.entity,
    entityId: change.entityId,
    before: snapshot(change.before),
    after: snapshot(change.after),
    undoes: change.undoes ?? null,
    rezonedEntryIds: change.rezoned ?? null,
    createdAt: at.getTime(),
  }
}

/** Holds a statement to the batch's change row having landed. */
export function recorded(db: Db, changeId: string) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(changes)
      .where(eq(changes.id, changeId)),
  )
}

/** The columns any write to an entry stamps with who made it. */
export function stampedBy(actor: Actor, at: Date) {
  return {
    updatedBy: actor.userId,
    updatedSource: actor.source,
    updatedAt: at,
  }
}

/** Whether two field snapshots of one entity hold the same values. */
export function sameFields(a: object | null, b: object | null) {
  if (a === null || b === null) return a === b
  const left = Object.entries(a)
  const right = new Map(Object.entries(b))
  return (
    left.length === right.size &&
    left.every(([key, value]) => right.get(key) === value)
  )
}
