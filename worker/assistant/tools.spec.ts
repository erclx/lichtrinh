import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { app } from '../app.ts'
import { entriesOfTrip, getEntry } from '../calendar/entries.ts'
import { createDb } from '../db/client.ts'
import { changes } from '../db/schema.ts'
import { json } from '../test/requests.ts'
import { addEntry, addTrip } from '../test/trips.ts'
import { signedIn } from '../test/users.ts'
import type { ToolContext, ToolOutcome } from './tools.ts'
import { runTool } from './tools.ts'

const db = createDb(env.DB)

/** A trip of the turn's owner, read the way a turn reads it. */
async function turnOn(overrides: Parameters<typeof addTrip>[1] = {}) {
  const { cookie, user } = await signedIn({ canChat: true })
  const { trip } = await addTrip(cookie, overrides)
  const context = async (): Promise<ToolContext> => ({
    db,
    ownerId: user.id,
    tripId: trip.id,
    versions: new Map(
      (await entriesOfTrip(db, trip.id)).map((e) => [e.id, e.version]),
    ),
    at: new Date('2031-04-09T08:00:00Z'),
  })
  return { cookie, user, trip, context }
}

function addedId(outcome: ToolOutcome) {
  if (!outcome.result.ok) throw new Error(`Refused ${outcome.result.error}`)
  return outcome.result.entry.id
}

async function changeRow(id: string | undefined) {
  if (id === undefined) throw new Error('No change id')
  const rows = await db.select().from(changes)
  return rows.find((row) => row.id === id)
}

describe('add_entry', () => {
  it('writes the entry as an assistant change by the chat owner', async () => {
    const { trip, user, context } = await turnOn()

    const outcome = await runTool(await context(), 'add_entry', {
      title: 'Invented Pier Lunch',
      date: '2031-04-11',
      start: '12:00',
      end: '13:00',
      cost: 200000,
    })

    expect(outcome.result).toMatchObject({
      ok: true,
      entry: {
        title: 'Invented Pier Lunch',
        date: '2031-04-11',
        start: '12:00',
        end: '13:00',
        cost: 200000,
      },
    })
    expect(outcome.step).toEqual({
      kind: 'add',
      title: 'Invented Pier Lunch',
      date: '2031-04-11',
      time: '12:00',
    })
    expect(await changeRow(outcome.changeId)).toMatchObject({
      tripId: trip.id,
      userId: user.id,
      source: 'assistant',
      op: 'create',
    })
  })

  it('starts at the first free hour and runs an hour when no time is named', async () => {
    const { cookie, trip, context } = await turnOn()
    await addEntry(cookie, trip.id, {
      startsOn: '2031-04-11',
      startTime: '09:00',
      endsOn: '2031-04-11',
      endTime: '10:30',
    })

    const outcome = await runTool(await context(), 'add_entry', {
      title: 'Invented Pier Lunch',
      date: '2031-04-11',
    })

    expect(outcome.result).toMatchObject({
      ok: true,
      entry: { start: '11:00', end: '12:00' },
    })
  })

  it('reads a cost in the trip currency into its minor unit', async () => {
    const { context } = await turnOn({ currency: 'USD', homeCurrency: 'VND' })

    const outcome = await runTool(await context(), 'add_entry', {
      title: 'Invented Pier Lunch',
      date: '2031-04-11',
      start: '12:00',
      cost: 12.5,
    })

    const id = addedId(outcome)
    expect((await getEntry(db, id))?.costMinor).toBe(1250)
    expect(outcome.result).toMatchObject({ entry: { cost: 12.5 } })
  })

  it('refuses a date outside the trip and writes nothing', async () => {
    const { trip, context } = await turnOn()

    const outcome = await runTool(await context(), 'add_entry', {
      title: 'Invented Pier Lunch',
      date: '2031-05-20',
      start: '12:00',
    })

    expect(outcome.result).toMatchObject({
      ok: false,
      error: 'entries_outside_range',
    })
    expect(outcome.changeId).toBeUndefined()
    expect(await entriesOfTrip(db, trip.id)).toEqual([])
  })

  it('lets a later call in the same turn move the entry it added', async () => {
    const { context } = await turnOn()
    const turn = await context()
    const added = await runTool(turn, 'add_entry', {
      title: 'Invented Pier Lunch',
      date: '2031-04-11',
      start: '12:00',
    })
    const id = addedId(added)

    const moved = await runTool(turn, 'move_entry', {
      entry_id: id,
      start: '13:00',
    })

    expect(moved.result).toMatchObject({ ok: true, entry: { start: '13:00' } })
  })
})

describe('move_entry', () => {
  it('keeps the length when only the start moves', async () => {
    const { cookie, trip, context } = await turnOn()
    const { entry } = await addEntry(cookie, trip.id, {
      startTime: '09:00',
      endTime: '10:30',
    })

    const outcome = await runTool(await context(), 'move_entry', {
      entry_id: entry.id,
      date: '2031-04-12',
      start: '15:00',
    })

    expect(outcome.result).toMatchObject({
      ok: true,
      entry: { date: '2031-04-12', start: '15:00', end: '16:30' },
    })
    expect(outcome.step).toEqual({
      kind: 'move',
      title: 'Invented Harbor Walk',
      date: '2031-04-12',
      time: '15:00',
    })
  })

  it('ends on the next day when the new end falls before the start', async () => {
    const { cookie, trip, context } = await turnOn()
    const { entry } = await addEntry(cookie, trip.id)

    await runTool(await context(), 'move_entry', {
      entry_id: entry.id,
      start: '22:00',
      end: '01:00',
    })

    expect(await getEntry(db, entry.id)).toMatchObject({
      startsOn: '2031-04-10',
      startTime: '22:00',
      endsOn: '2031-04-11',
      endTime: '01:00',
    })
  })

  it('refuses with edit_conflict when a person changed the entry mid-turn', async () => {
    const { cookie, trip, context } = await turnOn()
    const { entry } = await addEntry(cookie, trip.id)
    const turn = await context()
    await app.request(
      `/api/entries/${entry.id}`,
      json('PATCH', { version: entry.version, title: 'Edited' }, cookie),
      env,
    )

    const outcome = await runTool(turn, 'move_entry', {
      entry_id: entry.id,
      start: '15:00',
    })

    expect(outcome.result).toMatchObject({ ok: false, error: 'edit_conflict' })
    expect((await getEntry(db, entry.id))?.startTime).toBe('09:00')
  })

  it('refuses an entry of another trip as not found', async () => {
    const { cookie, context } = await turnOn()
    const { trip: other } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, other.id)

    const outcome = await runTool(await context(), 'move_entry', {
      entry_id: entry.id,
      start: '15:00',
    })

    expect(outcome.result).toMatchObject({ ok: false, error: 'not_found' })
    expect((await getEntry(db, entry.id))?.startTime).toBe('09:00')
  })
})

describe('update_entry', () => {
  it('changes the title and clears the cost', async () => {
    const { cookie, trip, context } = await turnOn()
    const { entry } = await addEntry(cookie, trip.id, { costMinor: 300000 })

    const outcome = await runTool(await context(), 'update_entry', {
      entry_id: entry.id,
      title: 'Invented Night Market',
      cost: null,
    })

    expect(await getEntry(db, entry.id)).toMatchObject({
      title: 'Invented Night Market',
      costMinor: null,
    })
    expect(outcome.step?.kind).toBe('update')
  })
})

describe('remove_entry', () => {
  it('deletes the entry and names it in the step', async () => {
    const { cookie, trip, context } = await turnOn()
    const { entry } = await addEntry(cookie, trip.id)

    const outcome = await runTool(await context(), 'remove_entry', {
      entry_id: entry.id,
    })

    expect(await getEntry(db, entry.id)).toBeUndefined()
    expect(outcome.step).toEqual({
      kind: 'remove',
      title: 'Invented Harbor Walk',
      date: '2031-04-10',
      time: '09:00',
    })
    expect((await changeRow(outcome.changeId))?.op).toBe('delete')
  })
})

describe('a call outside the four tools', () => {
  it('refuses an unknown tool name and writes nothing', async () => {
    const { trip, context } = await turnOn()

    const outcome = await runTool(await context(), 'delete_trip', {
      trip_id: trip.id,
    })

    expect(outcome).toEqual({
      result: { ok: false, error: 'unknown_tool' },
    })
  })

  it('refuses arguments failing the schema and writes nothing', async () => {
    const { trip, context } = await turnOn()

    const outcome = await runTool(await context(), 'add_entry', {
      title: 'Invented Pier Lunch',
      date: 'Thursday',
    })

    expect(outcome.result).toMatchObject({
      ok: false,
      error: 'invalid_arguments',
    })
    expect(await entriesOfTrip(db, trip.id)).toEqual([])
  })
})
