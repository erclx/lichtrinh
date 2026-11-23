import type { ToolCall } from '@shared/assistant-tools.ts'
import { parseToolCall } from '@shared/assistant-tools.ts'
import type { TurnStep } from '@shared/chats.ts'
import { minorDigits } from '@shared/currency.ts'
import type { Entry } from '@shared/entries.ts'
import { firstFreeHour } from '@shared/entries.ts'
import { minutesBetween, shiftClock } from '@shared/trip-time.ts'

import {
  createEntry,
  deleteEntry,
  entriesOfTrip,
  getEntry,
  updateEntry,
} from '../calendar/entries.ts'
import type { Actor, Db, Refused } from '../calendar/record.ts'
import { isRefused } from '../calendar/record.ts'
import { liveTrip } from '../calendar/trips.ts'

/** What one turn's tool calls act on and as whom. */
export interface ToolContext {
  db: Db
  ownerId: string
  tripId: string
  // Each entry's version as the turn's prompt showed it. A write carries
  // this version, so an entry a person edited mid-turn refuses, and the
  // turn's own writes update it so the model can act on them again.
  versions: Map<string, number>
  at: Date
}

/** An entry as the model reads it back, its cost in the trip currency. */
export type ToolEntry = {
  id: string
  title: string
  date: string
  start: string
  end: string
  cost: number | null
  notes: string | null
}

export type ToolResult =
  | { ok: true; entry: ToolEntry; filled?: ('start' | 'end')[] }
  | { ok: false; error: string; hint?: string }

/** The model's answer, and on a write the step to show and the change. */
export interface ToolOutcome {
  result: ToolResult
  step?: TurnStep
  changeId?: string
}

const HINTS: Partial<Record<Refused['refused'], string>> = {
  not_found: 'No entry with that id in this trip',
  edit_conflict:
    'Someone changed this entry during the turn. Tell the traveler and do not retry',
  entries_outside_range: 'That date falls outside the trip',
  validation_failed: 'The end falls before the start',
}

/**
 * Runs one tool call as the chat's owner with `source: 'assistant'`. The
 * call is parsed here whatever the bridge checked, since the socket is
 * input, and every refusal returns to the model rather than throwing.
 */
export async function runTool(
  context: ToolContext,
  name: string,
  args: unknown,
): Promise<ToolOutcome> {
  const parsed = parseToolCall(name, args)
  if (!parsed.ok) return { result: { ok: false, error: parsed.error } }
  const trip = await liveTrip(context.db, context.tripId)
  if (trip === undefined) return { result: { ok: false, error: 'no_trip' } }
  const digits = minorDigits(trip.currency)
  const outcome = await write(context, parsed.call, digits)
  if (isRefused(outcome)) return refusal(outcome)
  const { entry, changeId, kind, filled } = outcome
  if (kind === 'remove') context.versions.delete(entry.id)
  else context.versions.set(entry.id, entry.version)
  return {
    result: { ok: true, entry: toolEntry(entry, digits), filled },
    step: {
      kind,
      title: entry.title,
      date: entry.startsOn,
      time: entry.startTime,
    },
    changeId,
  }
}

interface Written {
  entry: Entry
  changeId: string
  kind: TurnStep['kind']
  filled?: ('start' | 'end')[]
}

async function write(
  context: ToolContext,
  call: ToolCall,
  digits: number,
): Promise<Written | Refused> {
  const { db, at } = context
  const actor: Actor = { userId: context.ownerId, source: 'assistant' }
  const toMinor = (cost: number) => Math.round(cost * 10 ** digits)
  if (call.name === 'add_entry') {
    const { args } = call
    const start = args.start ?? (await freeHourOn(context, args.date))
    const ends =
      args.end === undefined
        ? shiftClock({ date: args.date, time: start }, 60)
        : endAfter(args.date, start, args.end)
    const added = await createEntry(
      db,
      actor,
      {
        id: crypto.randomUUID(),
        tripId: context.tripId,
        title: args.title,
        notes: args.notes ?? null,
        kind: null,
        startsOn: args.date,
        startTime: start,
        endsOn: ends.date,
        endTime: ends.time,
        costMinor: args.cost === undefined ? null : toMinor(args.cost),
      },
      at,
    )
    if (isRefused(added)) return added
    const filled = [
      ...(args.start === undefined ? (['start'] as const) : []),
      ...(args.end === undefined ? (['end'] as const) : []),
    ]
    return {
      ...added,
      kind: 'add',
      filled: filled.length > 0 ? filled : undefined,
    }
  }
  const version = context.versions.get(call.args.entry_id)
  const entry =
    version === undefined ? undefined : await getEntry(db, call.args.entry_id)
  if (
    version === undefined ||
    entry === undefined ||
    entry.tripId !== context.tripId
  ) {
    return { refused: 'not_found' }
  }
  if (call.name === 'remove_entry') {
    const removed = await deleteEntry(db, actor, entry.id, { version }, at)
    if (isRefused(removed)) return removed
    return { entry, changeId: removed.changeId, kind: 'remove' }
  }
  if (call.name === 'move_entry') {
    const { args } = call
    const start = {
      date: args.date ?? entry.startsOn,
      time: args.start ?? entry.startTime,
    }
    const end =
      args.end === undefined
        ? shiftClock(
            start,
            minutesBetween(
              { date: entry.startsOn, time: entry.startTime },
              { date: entry.endsOn, time: entry.endTime },
            ),
          )
        : endAfter(start.date, start.time, args.end)
    const moved = await updateEntry(
      db,
      actor,
      entry.id,
      {
        version,
        startsOn: start.date,
        startTime: start.time,
        endsOn: end.date,
        endTime: end.time,
      },
      at,
    )
    if (isRefused(moved)) return moved
    return { ...moved, kind: 'move' }
  }
  const { args } = call
  const updated = await updateEntry(
    db,
    actor,
    entry.id,
    {
      version,
      title: args.title,
      notes: args.notes,
      costMinor:
        args.cost === undefined || args.cost === null
          ? args.cost
          : toMinor(args.cost),
    },
    at,
  )
  if (isRefused(updated)) return updated
  return { ...updated, kind: 'update' }
}

async function freeHourOn(context: ToolContext, date: string) {
  const entries = await entriesOfTrip(context.db, context.tripId)
  return firstFreeHour(entries.filter((entry) => entry.startsOn === date))
}

// A clock time alone names no date, so an end before the start is read as
// the next morning, as a late dinner running past midnight would be.
function endAfter(date: string, start: string, end: string) {
  const sameDay = { date, time: end }
  return end < start ? shiftClock(sameDay, 24 * 60) : sameDay
}

export function toolEntry(entry: Entry, digits: number): ToolEntry {
  return {
    id: entry.id,
    title: entry.title,
    date: entry.startsOn,
    start: entry.startTime,
    end: entry.endTime,
    cost: entry.costMinor === null ? null : entry.costMinor / 10 ** digits,
    notes: entry.notes,
  }
}

function refusal({ refused }: Refused): ToolOutcome {
  return { result: { ok: false, error: refused, hint: HINTS[refused] } }
}
