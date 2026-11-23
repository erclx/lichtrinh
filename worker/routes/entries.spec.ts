import { removed } from '@shared/changes.ts'
import { entryList, entryRead, entryWrite } from '@shared/entries.ts'
import { apiError } from '@shared/errors.ts'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { app } from '../app.ts'
import { bare, json } from '../test/requests.ts'
import { addEntry, addTrip, entryBody, postEntry } from '../test/trips.ts'
import { signedIn } from '../test/users.ts'

async function errorCode(res: Response) {
  return apiError.parse(await res.json()).error.code
}

function getEntry(cookie: string, id: string) {
  return app.request(`/api/entries/${id}`, bare('GET', cookie), env)
}

function patchEntry(cookie: string, id: string, body: unknown) {
  return app.request(`/api/entries/${id}`, json('PATCH', body, cookie), env)
}

function deleteEntry(cookie: string, id: string, version: number) {
  return app.request(
    `/api/entries/${id}`,
    json('DELETE', { version }, cookie),
    env,
  )
}

async function readRange(cookie: string, query: string) {
  const res = await app.request(
    `/api/entries?${query}`,
    bare('GET', cookie),
    env,
  )
  return entryList.parse(await res.json()).entries
}

describe('POST /api/entries', () => {
  it('stores the entry in the trip zone at version 1', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, { timeZone: 'Asia/Ho_Chi_Minh' })
    const body = entryBody(trip.id, { kind: 'sights', costMinor: 200000 })

    const res = await postEntry(cookie, body)

    expect(res.status).toBe(201)
    expect(entryWrite.parse(await res.json()).entry).toMatchObject({
      id: body.id,
      tripId: trip.id,
      title: 'Invented Harbor Walk',
      notes: null,
      kind: 'sights',
      startsOn: '2031-04-10',
      startTime: '09:00',
      endsOn: '2031-04-10',
      endTime: '10:30',
      timeZone: 'Asia/Ho_Chi_Minh',
      costMinor: 200000,
      version: 1,
    })
  })

  it('keeps a zone of its own when the body names one', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, { timeZone: 'Asia/Ho_Chi_Minh' })

    const { entry } = await addEntry(cookie, trip.id, {
      timeZone: 'Asia/Tokyo',
    })

    expect(entry.timeZone).toBe('Asia/Tokyo')
  })

  it('names the account that added it as both adder and changer', async () => {
    const { cookie, user } = await signedIn()
    const { trip } = await addTrip(cookie)

    const { entry } = await addEntry(cookie, trip.id)

    expect(entry.addedBy).toMatchObject({
      displayName: user.displayName,
      source: 'person',
    })
    expect(entry.changedBy).toEqual(entry.addedBy)
  })

  it('answers a retried create with the stored entry and change', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const body = entryBody(trip.id)
    const first = entryWrite.parse(await (await postEntry(cookie, body)).json())

    const res = await postEntry(cookie, body)

    expect(res.status).toBe(201)
    expect(entryWrite.parse(await res.json())).toEqual(first)
  })

  it('refuses a reused id with another body with id_conflict', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const body = entryBody(trip.id)
    await postEntry(cookie, body)

    const res = await postEntry(cookie, { ...body, title: 'Another Walk' })

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('id_conflict')
  })

  it.each([
    ['the day before the trip', '2031-04-09'],
    ['the day after the trip', '2031-04-17'],
  ])('refuses a start on %s with entries_outside_range', async (_case, day) => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, {
      startsOn: '2031-04-10',
      endsOn: '2031-04-16',
    })

    const res = await postEntry(
      cookie,
      entryBody(trip.id, { startsOn: day, endsOn: day }),
    )

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('entries_outside_range')
  })

  it('accepts a start on the last day of the trip', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, {
      startsOn: '2031-04-10',
      endsOn: '2031-04-16',
    })

    const res = await postEntry(
      cookie,
      entryBody(trip.id, { startsOn: '2031-04-16', endsOn: '2031-04-16' }),
    )

    expect(res.status).toBe(201)
  })

  it('refuses an end before its start on one date with validation_failed', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)

    const res = await postEntry(
      cookie,
      entryBody(trip.id, { startTime: '22:00', endTime: '06:00' }),
    )

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })

  it('accepts an entry ending the next day at an earlier clock time', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)

    const res = await postEntry(
      cookie,
      entryBody(trip.id, {
        startsOn: '2031-04-10',
        startTime: '22:00',
        endsOn: '2031-04-11',
        endTime: '06:00',
      }),
    )

    expect(res.status).toBe(201)
  })

  it('answers not_found for a trip id no trip holds', async () => {
    const { cookie } = await signedIn()

    const res = await postEntry(cookie, entryBody(crypto.randomUUID()))

    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('not_found')
  })

  it('refuses a signed-out caller with unauthenticated', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)

    const res = await app.request(
      '/api/entries',
      json('POST', entryBody(trip.id)),
      env,
    )

    expect(res.status).toBe(401)
  })
})

describe('GET /api/entries', () => {
  it('reads every live trip in the range by date and start time', async () => {
    const { cookie } = await signedIn()
    const coast = await addTrip(cookie, {
      startsOn: '2032-06-01',
      endsOn: '2032-06-10',
    })
    const hills = await addTrip(cookie, {
      startsOn: '2032-06-05',
      endsOn: '2032-06-12',
    })
    const late = await addEntry(cookie, coast.trip.id, {
      startsOn: '2032-06-06',
      startTime: '18:00',
      endsOn: '2032-06-06',
      endTime: '19:00',
    })
    const early = await addEntry(cookie, hills.trip.id, {
      startsOn: '2032-06-06',
      startTime: '08:00',
      endsOn: '2032-06-06',
      endTime: '09:00',
    })
    const first = await addEntry(cookie, coast.trip.id, {
      startsOn: '2032-06-02',
      endsOn: '2032-06-02',
    })
    await addEntry(cookie, hills.trip.id, {
      startsOn: '2032-06-11',
      endsOn: '2032-06-11',
    })

    const entries = await readRange(cookie, 'from=2032-06-01&to=2032-06-07')

    expect(entries.map((e) => e.id)).toEqual([
      first.entry.id,
      early.entry.id,
      late.entry.id,
    ])
  })

  it('narrows to one trip when the query names it', async () => {
    const { cookie } = await signedIn()
    const coast = await addTrip(cookie, {
      startsOn: '2033-01-01',
      endsOn: '2033-01-05',
    })
    const hills = await addTrip(cookie, {
      startsOn: '2033-01-01',
      endsOn: '2033-01-05',
    })
    const kept = await addEntry(cookie, coast.trip.id, {
      startsOn: '2033-01-02',
      endsOn: '2033-01-02',
    })
    await addEntry(cookie, hills.trip.id, {
      startsOn: '2033-01-02',
      endsOn: '2033-01-02',
    })

    const entries = await readRange(
      cookie,
      `from=2033-01-01&to=2033-01-05&tripId=${coast.trip.id}`,
    )

    expect(entries.map((e) => e.id)).toEqual([kept.entry.id])
  })

  it('leaves out the entries of a deleted trip', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, {
      startsOn: '2034-02-01',
      endsOn: '2034-02-03',
    })
    await addEntry(cookie, trip.id, {
      startsOn: '2034-02-02',
      endsOn: '2034-02-02',
    })
    await app.request(
      `/api/trips/${trip.id}`,
      json('DELETE', { version: 1 }, cookie),
      env,
    )

    const entries = await readRange(cookie, 'from=2034-02-01&to=2034-02-03')

    expect(entries).toEqual([])
  })

  it.each([
    ['a range ending before it starts', 'from=2031-04-10&to=2031-04-09'],
    ['a range with no start', 'to=2031-04-09'],
    ['a date that is not a date', 'from=2031-04-10&to=tomorrow'],
  ])('refuses %s with validation_failed', async (_case, query) => {
    const { cookie } = await signedIn()

    const res = await app.request(
      `/api/entries?${query}`,
      bare('GET', cookie),
      env,
    )

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })
})

describe('PATCH /api/entries/:id', () => {
  it('changes the named fields, bumps the version, and names the changer', async () => {
    const adder = await signedIn()
    const changer = await signedIn()
    const { trip } = await addTrip(adder.cookie)
    const { entry } = await addEntry(adder.cookie, trip.id)

    const res = await patchEntry(changer.cookie, entry.id, {
      version: 1,
      title: 'Invented Night Market',
      notes: 'Bring cash',
    })

    expect(res.status).toBe(200)
    const changed = entryWrite.parse(await res.json()).entry
    expect(changed).toMatchObject({
      title: 'Invented Night Market',
      notes: 'Bring cash',
      startTime: '09:00',
      version: 2,
    })
    expect(changed.addedBy.displayName).toBe(adder.user.displayName)
    expect(changed.changedBy.displayName).toBe(changer.user.displayName)
  })

  it('refuses a stale version with edit_conflict and changes nothing', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id)
    await patchEntry(cookie, entry.id, { version: 1, title: 'First Edit' })

    const res = await patchEntry(cookie, entry.id, {
      version: 1,
      title: 'Second Edit',
    })

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('edit_conflict')
    const stored = entryRead.parse(
      await (await getEntry(cookie, entry.id)).json(),
    )
    expect(stored.entry.title).toBe('First Edit')
  })

  it('refuses a move outside the trip with entries_outside_range', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, {
      startsOn: '2031-04-10',
      endsOn: '2031-04-16',
    })
    const { entry } = await addEntry(cookie, trip.id)

    const res = await patchEntry(cookie, entry.id, {
      version: 1,
      startsOn: '2031-04-20',
      endsOn: '2031-04-20',
    })

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('entries_outside_range')
  })

  it('refuses an end moved before the stored start with validation_failed', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id, {
      startTime: '09:00',
      endTime: '10:30',
    })

    const res = await patchEntry(cookie, entry.id, {
      version: 1,
      endTime: '08:00',
    })

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })
})

describe('DELETE /api/entries/:id', () => {
  it('hides the entry from a read and answers its change', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id)

    const res = await deleteEntry(cookie, entry.id, 1)

    expect(res.status).toBe(200)
    expect(removed.parse(await res.json()).changeId).toEqual(expect.any(String))
    expect((await getEntry(cookie, entry.id)).status).toBe(404)
  })

  it('leaves the entry out of the range read', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, {
      startsOn: '2035-03-01',
      endsOn: '2035-03-02',
    })
    const { entry } = await addEntry(cookie, trip.id, {
      startsOn: '2035-03-01',
      endsOn: '2035-03-01',
    })

    await deleteEntry(cookie, entry.id, 1)

    expect(await readRange(cookie, 'from=2035-03-01&to=2035-03-02')).toEqual([])
  })

  it('refuses an update to a deleted entry with not_found', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id)
    await deleteEntry(cookie, entry.id, 1)

    const res = await patchEntry(cookie, entry.id, {
      version: 2,
      title: 'Back Again',
    })

    expect(res.status).toBe(404)
  })

  it('refuses a stale version with edit_conflict', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id)
    await patchEntry(cookie, entry.id, { version: 1, title: 'Edited' })

    const res = await deleteEntry(cookie, entry.id, 1)

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('edit_conflict')
  })
})

describe('GET /api/entries/:id', () => {
  it('refuses a signed-out caller with unauthenticated', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id)

    const res = await app.request(`/api/entries/${entry.id}`, bare('GET'), env)

    expect(res.status).toBe(401)
  })
})
