import { changePage, removed, undone } from '@shared/changes.ts'
import { entryRead, entryWrite } from '@shared/entries.ts'
import { apiError } from '@shared/errors.ts'
import { tripWithEntries, tripWrite } from '@shared/trips.ts'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { app } from '../app.ts'
import { createEntry } from '../calendar/entries.ts'
import { createDb } from '../db/client.ts'
import { bare, json } from '../test/requests.ts'
import { addEntry, addTrip, entryBody } from '../test/trips.ts'
import { signedIn } from '../test/users.ts'

async function errorCode(res: Response) {
  return apiError.parse(await res.json()).error.code
}

async function history(cookie: string, tripId: string, query = '') {
  const res = await app.request(
    `/api/trips/${tripId}/changes${query}`,
    bare('GET', cookie),
    env,
  )
  return changePage.parse(await res.json())
}

function undo(cookie: string, changeId: string, undoId = crypto.randomUUID()) {
  return app.request(
    `/api/changes/${changeId}/undo`,
    json('POST', { undoId }, cookie),
    env,
  )
}

async function undoOk(cookie: string, changeId: string) {
  const res = await undo(cookie, changeId)
  if (res.status !== 201) throw new Error(`Undo answered ${res.status}`)
  return undone.parse(await res.json()).change
}

function patch(cookie: string, path: string, body: unknown) {
  return app.request(path, json('PATCH', body, cookie), env)
}

function remove(cookie: string, path: string, version: number) {
  return app.request(path, json('DELETE', { version }, cookie), env)
}

async function readEntry(cookie: string, id: string) {
  return app.request(`/api/entries/${id}`, bare('GET', cookie), env)
}

async function readTrip(cookie: string, id: string) {
  const res = await app.request(`/api/trips/${id}`, bare('GET', cookie), env)
  return tripWithEntries.parse(await res.json())
}

describe('GET /api/trips/:id/changes', () => {
  it('lists one change per write, newest first, naming the person', async () => {
    const { cookie, user } = await signedIn()
    const { trip } = await addTrip(cookie)
    await patch(cookie, `/api/trips/${trip.id}`, {
      version: 1,
      name: 'Renamed',
    })
    const { entry } = await addEntry(cookie, trip.id)
    await patch(cookie, `/api/entries/${entry.id}`, {
      version: 1,
      title: 'Retitled',
    })
    await remove(cookie, `/api/entries/${entry.id}`, 2)

    const { changes } = await history(cookie, trip.id)

    expect(changes.map((c) => [c.op, c.entity])).toEqual([
      ['delete', 'entry'],
      ['update', 'entry'],
      ['create', 'entry'],
      ['update', 'trip'],
      ['create', 'trip'],
    ])
    expect(changes.every((c) => c.source === 'person')).toBe(true)
    expect(changes.every((c) => c.actor.displayName === user.displayName)).toBe(
      true,
    )
  })

  it('snapshots the fields on both sides of an update', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, { name: 'Old Name' })
    await patch(cookie, `/api/trips/${trip.id}`, {
      version: 1,
      name: 'New Name',
    })

    const [latest] = (await history(cookie, trip.id)).changes

    expect(latest.before).toMatchObject({ name: 'Old Name' })
    expect(latest.after).toMatchObject({ name: 'New Name' })
  })

  it('pages through history with nextBefore', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    await patch(cookie, `/api/trips/${trip.id}`, { version: 1, name: 'Two' })
    await patch(cookie, `/api/trips/${trip.id}`, { version: 2, name: 'Three' })

    const first = await history(cookie, trip.id, '?limit=2')
    const second = await history(
      cookie,
      trip.id,
      `?limit=2&before=${first.nextBefore}`,
    )

    expect(first.changes.map((c) => c.after)).toMatchObject([
      { name: 'Three' },
      { name: 'Two' },
    ])
    expect(second.changes.map((c) => c.op)).toEqual(['create'])
    expect(second.nextBefore).toBeNull()
  })

  it('leaves no change behind for a refused write', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    await patch(cookie, `/api/trips/${trip.id}`, { version: 1, name: 'Kept' })

    await patch(cookie, `/api/trips/${trip.id}`, { version: 1, name: 'Stale' })

    expect((await history(cookie, trip.id)).changes).toHaveLength(2)
  })

  it('records the assistant as the source of a write it makes', async () => {
    const { cookie, user } = await signedIn()
    const { trip } = await addTrip(cookie)
    await createEntry(
      createDb(env.DB),
      { userId: user.id, source: 'assistant' },
      {
        ...entryBody(trip.id),
        notes: null,
        kind: null,
        costMinor: null,
        timeZone: undefined,
      },
      new Date(),
    )

    const [latest] = (await history(cookie, trip.id)).changes

    expect(latest).toMatchObject({ op: 'create', source: 'assistant' })
    expect(latest.actor.displayName).toBe(user.displayName)
  })

  it('refuses a limit past the maximum with validation_failed', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)

    const res = await app.request(
      `/api/trips/${trip.id}/changes?limit=101`,
      bare('GET', cookie),
      env,
    )

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })

  it('refuses a signed-out caller with unauthenticated', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)

    const res = await app.request(
      `/api/trips/${trip.id}/changes`,
      bare('GET'),
      env,
    )

    expect(res.status).toBe(401)
  })
})

describe('POST /api/changes/:id/undo', () => {
  it('restores a deleted entry', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id)
    const res = await remove(cookie, `/api/entries/${entry.id}`, 1)
    const { changeId } = removed.parse(await res.json())

    await undoOk(cookie, changeId)

    const restored = entryRead.parse(
      await (await readEntry(cookie, entry.id)).json(),
    ).entry
    expect(restored).toMatchObject({ title: entry.title, version: 3 })
  })

  it('reverts an update', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id, { title: 'Before' })
    const res = await patch(cookie, `/api/entries/${entry.id}`, {
      version: 1,
      title: 'After',
    })
    const { changeId } = entryWrite.parse(await res.json())

    await undoOk(cookie, changeId)

    const restored = entryRead.parse(
      await (await readEntry(cookie, entry.id)).json(),
    ).entry
    expect(restored.title).toBe('Before')
  })

  it('removes a created entry', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { entry, changeId } = await addEntry(cookie, trip.id)

    await undoOk(cookie, changeId)

    expect((await readEntry(cookie, entry.id)).status).toBe(404)
  })

  it('brings a deleted trip back with every entry it held', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id)
    const res = await remove(cookie, `/api/trips/${trip.id}`, 1)
    const { changeId } = removed.parse(await res.json())

    await undoOk(cookie, changeId)

    const detail = await readTrip(cookie, trip.id)
    expect(detail.trip.name).toBe(trip.name)
    expect(detail.entries.map((e) => e.id)).toEqual([entry.id])
  })

  it('moves the entries a zone change carried back to the old zone', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, { timeZone: 'Asia/Ho_Chi_Minh' })
    const carried = await addEntry(cookie, trip.id)
    const own = await addEntry(cookie, trip.id, { timeZone: 'Asia/Tokyo' })
    const res = await patch(cookie, `/api/trips/${trip.id}`, {
      version: 1,
      timeZone: 'Asia/Bangkok',
    })
    const { changeId } = tripWrite.parse(await res.json())

    await undoOk(cookie, changeId)

    const detail = await readTrip(cookie, trip.id)
    const zones = Object.fromEntries(
      detail.entries.map((e) => [e.id, e.timeZone]),
    )
    expect(detail.trip.timeZone).toBe('Asia/Ho_Chi_Minh')
    expect(zones).toEqual({
      [carried.entry.id]: 'Asia/Ho_Chi_Minh',
      [own.entry.id]: 'Asia/Tokyo',
    })
  })

  it('answers a retried undo with the stored undo', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { changeId } = await addEntry(cookie, trip.id)
    const undoId = crypto.randomUUID()
    const first = undone.parse(
      await (await undo(cookie, changeId, undoId)).json(),
    )

    const res = await undo(cookie, changeId, undoId)

    expect(res.status).toBe(201)
    expect(undone.parse(await res.json())).toEqual(first)
  })

  it('refuses a second undo of one change with already_undone', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { changeId } = await addEntry(cookie, trip.id)
    await undoOk(cookie, changeId)

    const res = await undo(cookie, changeId)

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('already_undone')
  })

  it('refuses an undo after a later live change with undo_conflict', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id)
    const first = entryWrite.parse(
      await (
        await patch(cookie, `/api/entries/${entry.id}`, {
          version: 1,
          title: 'First',
        })
      ).json(),
    )
    await patch(cookie, `/api/entries/${entry.id}`, {
      version: 2,
      title: 'Second',
    })

    const res = await undo(cookie, first.changeId)

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('undo_conflict')
    const stored = entryRead.parse(
      await (await readEntry(cookie, entry.id)).json(),
    ).entry
    expect(stored.title).toBe('Second')
  })

  it('undoes an earlier change once the later one is undone', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id, { title: 'Start' })
    const first = entryWrite.parse(
      await (
        await patch(cookie, `/api/entries/${entry.id}`, {
          version: 1,
          title: 'First',
        })
      ).json(),
    )
    const second = entryWrite.parse(
      await (
        await patch(cookie, `/api/entries/${entry.id}`, {
          version: 2,
          title: 'Second',
        })
      ).json(),
    )
    await undoOk(cookie, second.changeId)

    await undoOk(cookie, first.changeId)

    const stored = entryRead.parse(
      await (await readEntry(cookie, entry.id)).json(),
    ).entry
    expect(stored.title).toBe('Start')
  })

  it('redoes a change by undoing its undo', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id, { title: 'Before' })
    const edit = entryWrite.parse(
      await (
        await patch(cookie, `/api/entries/${entry.id}`, {
          version: 1,
          title: 'After',
        })
      ).json(),
    )
    const reverted = await undoOk(cookie, edit.changeId)

    await undoOk(cookie, reverted.id)

    const stored = entryRead.parse(
      await (await readEntry(cookie, entry.id)).json(),
    ).entry
    expect(stored.title).toBe('After')
  })

  it('records the undo in history and marks the change it undid', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { changeId } = await addEntry(cookie, trip.id)

    const reverted = await undoOk(cookie, changeId)

    const { changes } = await history(cookie, trip.id)
    expect(changes[0]).toMatchObject({ id: reverted.id, op: 'undo' })
    expect(changes.find((c) => c.id === changeId)?.undoneBy).toBe(reverted.id)
  })

  it('refuses an undo restoring dates that leave an entry outside', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, {
      startsOn: '2031-04-10',
      endsOn: '2031-04-16',
    })
    const widen = tripWrite.parse(
      await (
        await patch(cookie, `/api/trips/${trip.id}`, {
          version: 1,
          endsOn: '2031-04-20',
        })
      ).json(),
    )
    await addEntry(cookie, trip.id, {
      startsOn: '2031-04-19',
      endsOn: '2031-04-19',
    })

    const res = await undo(cookie, widen.changeId)

    expect(await errorCode(res)).toBe('entries_outside_range')
  })

  it('refuses undoing a currency change once an entry carries a cost', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, { currency: 'VND' })
    const switched = tripWrite.parse(
      await (
        await patch(cookie, `/api/trips/${trip.id}`, {
          version: 1,
          currency: 'USD',
        })
      ).json(),
    )
    await addEntry(cookie, trip.id, { costMinor: 1250 })

    const res = await undo(cookie, switched.changeId)

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('currency_has_costs')
  })

  it('applies two concurrent undos under one undo id once', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id, { title: 'Before' })
    const edit = entryWrite.parse(
      await (
        await patch(cookie, `/api/entries/${entry.id}`, {
          version: 1,
          title: 'After',
        })
      ).json(),
    )
    const undoId = crypto.randomUUID()

    const [first, second] = await Promise.all([
      undo(cookie, edit.changeId, undoId),
      undo(cookie, edit.changeId, undoId),
    ])

    expect([first.status, second.status]).toEqual([201, 201])
    const stored = entryRead.parse(
      await (await readEntry(cookie, entry.id)).json(),
    ).entry
    expect(stored).toMatchObject({ title: 'Before', version: 3 })
    const undos = (await history(cookie, trip.id)).changes.filter(
      (c) => c.op === 'undo',
    )
    expect(undos.map((c) => c.id)).toEqual([undoId])
  })

  it('refuses restoring a deleted cost after a currency change', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, { currency: 'VND' })
    const { entry } = await addEntry(cookie, trip.id, { costMinor: 450000 })
    const res = await remove(cookie, `/api/entries/${entry.id}`, 1)
    const { changeId } = removed.parse(await res.json())
    await patch(cookie, `/api/trips/${trip.id}`, {
      version: 1,
      currency: 'USD',
    })

    const undone = await undo(cookie, changeId)

    expect(undone.status).toBe(409)
    expect(await errorCode(undone)).toBe('currency_has_costs')
    expect((await readEntry(cookie, entry.id)).status).toBe(404)
  })

  it('refuses undoing an update that cleared a cost after a currency change', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, { currency: 'VND' })
    const { entry } = await addEntry(cookie, trip.id, { costMinor: 450000 })
    const cleared = entryWrite.parse(
      await (
        await patch(cookie, `/api/entries/${entry.id}`, {
          version: 1,
          costMinor: null,
        })
      ).json(),
    )
    await patch(cookie, `/api/trips/${trip.id}`, {
      version: 1,
      currency: 'USD',
    })

    const res = await undo(cookie, cleared.changeId)

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('currency_has_costs')
  })

  it('restores an entry with no cost after a currency change', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, { currency: 'VND' })
    const { entry } = await addEntry(cookie, trip.id, { costMinor: null })
    const res = await remove(cookie, `/api/entries/${entry.id}`, 1)
    const { changeId } = removed.parse(await res.json())
    await patch(cookie, `/api/trips/${trip.id}`, {
      version: 1,
      currency: 'USD',
    })

    const restored = await undo(cookie, changeId)

    expect(restored.status).toBe(201)
  })

  it('refuses an undo id another change holds with id_conflict', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const one = await addEntry(cookie, trip.id)
    const two = await addEntry(cookie, trip.id)
    const undoId = crypto.randomUUID()
    await undo(cookie, one.changeId, undoId)

    const res = await undo(cookie, two.changeId, undoId)

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('id_conflict')
  })

  it('answers not_found for an id no change holds', async () => {
    const { cookie } = await signedIn()

    const res = await undo(cookie, crypto.randomUUID())

    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('not_found')
  })

  it('refuses a signed-out caller with unauthenticated', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { changeId } = await addEntry(cookie, trip.id)

    const res = await app.request(
      `/api/changes/${changeId}/undo`,
      json('POST', { undoId: crypto.randomUUID() }),
      env,
    )

    expect(res.status).toBe(401)
  })
})
