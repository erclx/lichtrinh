import { removed } from '@shared/changes.ts'
import { apiError } from '@shared/errors.ts'
import { tripList, tripWithEntries, tripWrite } from '@shared/trips.ts'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { app } from '../app.ts'
import { bare, json } from '../test/requests.ts'
import { addEntry, addTrip, postTrip, tripBody } from '../test/trips.ts'
import { signedIn } from '../test/users.ts'

async function errorCode(res: Response) {
  return apiError.parse(await res.json()).error.code
}

async function listTrips(cookie: string) {
  const res = await app.request('/api/trips', bare('GET', cookie), env)
  return tripList.parse(await res.json()).trips
}

async function readTrip(cookie: string, id: string) {
  const res = await app.request(`/api/trips/${id}`, bare('GET', cookie), env)
  return tripWithEntries.parse(await res.json())
}

function patchTrip(cookie: string, id: string, body: unknown) {
  return app.request(`/api/trips/${id}`, json('PATCH', body, cookie), env)
}

function deleteTrip(cookie: string, id: string, version: number) {
  return app.request(
    `/api/trips/${id}`,
    json('DELETE', { version }, cookie),
    env,
  )
}

describe('POST /api/trips', () => {
  it('stores the dates, zone, and currencies at version 1', async () => {
    const { cookie } = await signedIn()
    const body = tripBody({ timeZone: 'Asia/Tokyo', currency: 'JPY' })

    const res = await postTrip(cookie, body)

    expect(res.status).toBe(201)
    expect(tripWrite.parse(await res.json()).trip).toEqual({
      id: body.id,
      name: 'Invented Coast Trip',
      startsOn: '2031-04-10',
      endsOn: '2031-04-16',
      timeZone: 'Asia/Tokyo',
      currency: 'JPY',
      homeCurrency: 'USD',
      version: 1,
    })
  })

  it('shows the new trip to another account', async () => {
    const { cookie } = await signedIn()
    const other = await signedIn()
    const { trip } = await addTrip(cookie)

    const trips = await listTrips(other.cookie)

    expect(trips.map((t) => t.id)).toContain(trip.id)
  })

  it('answers a retried create with the stored trip and change', async () => {
    const { cookie } = await signedIn()
    const body = tripBody()
    const first = tripWrite.parse(await (await postTrip(cookie, body)).json())

    const res = await postTrip(cookie, body)

    expect(res.status).toBe(201)
    expect(tripWrite.parse(await res.json())).toEqual(first)
    const ids = (await listTrips(cookie)).map((t) => t.id)
    expect(ids.filter((id) => id === body.id)).toHaveLength(1)
  })

  it('refuses a reused id with another body with id_conflict', async () => {
    const { cookie } = await signedIn()
    const body = tripBody()
    await postTrip(cookie, body)

    const res = await postTrip(cookie, { ...body, name: 'Another Trip' })

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('id_conflict')
  })

  it('refuses a trip ending before it starts with validation_failed', async () => {
    const { cookie } = await signedIn()

    const res = await postTrip(
      cookie,
      tripBody({ startsOn: '2031-04-10', endsOn: '2031-04-09' }),
    )

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })

  it('accepts a one-day trip', async () => {
    const { cookie } = await signedIn()

    const res = await postTrip(
      cookie,
      tripBody({ startsOn: '2031-04-10', endsOn: '2031-04-10' }),
    )

    expect(res.status).toBe(201)
  })

  it.each([
    ['an unknown zone', { timeZone: 'Mars/Olympus_Mons' }],
    ['an unknown currency', { currency: 'XYZ' }],
    ['an id that is not a UUID', { id: 'trip-1' }],
  ])('refuses %s with validation_failed', async (_case, overrides) => {
    const { cookie } = await signedIn()

    const res = await postTrip(cookie, tripBody(overrides))

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })

  it('reads a lowercase currency as its code', async () => {
    const { cookie } = await signedIn()

    const res = await postTrip(cookie, tripBody({ homeCurrency: 'eur' }))

    expect(tripWrite.parse(await res.json()).trip.homeCurrency).toBe('EUR')
  })
})

describe('GET /api/trips', () => {
  it('orders trips by start date', async () => {
    const { cookie } = await signedIn()
    const later = await addTrip(cookie, {
      startsOn: '2031-09-01',
      endsOn: '2031-09-05',
    })
    const earlier = await addTrip(cookie, {
      startsOn: '2031-01-01',
      endsOn: '2031-01-05',
    })

    const ids = (await listTrips(cookie)).map((t) => t.id)

    expect(ids.indexOf(earlier.trip.id)).toBeLessThan(
      ids.indexOf(later.trip.id),
    )
  })

  it('refuses a signed-out caller with unauthenticated', async () => {
    const res = await app.request('/api/trips', bare('GET'), env)

    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('unauthenticated')
  })
})

describe('signed-out writes', () => {
  it('refuses a create with unauthenticated', async () => {
    const res = await app.request('/api/trips', json('POST', tripBody()), env)

    expect(res.status).toBe(401)
  })

  it('refuses an update and a delete with unauthenticated', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)

    const patch = await app.request(
      `/api/trips/${trip.id}`,
      json('PATCH', { version: 1, name: 'Renamed' }),
      env,
    )
    const del = await app.request(
      `/api/trips/${trip.id}`,
      json('DELETE', { version: 1 }),
      env,
    )

    expect([patch.status, del.status]).toEqual([401, 401])
  })
})

describe('PATCH /api/trips/:id', () => {
  it('changes the named fields and bumps the version', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)

    const res = await patchTrip(cookie, trip.id, {
      version: 1,
      name: 'Renamed Coast Trip',
    })

    expect(res.status).toBe(200)
    expect(tripWrite.parse(await res.json()).trip).toEqual({
      ...trip,
      name: 'Renamed Coast Trip',
      version: 2,
    })
  })

  it('refuses a stale version with edit_conflict and changes nothing', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    await patchTrip(cookie, trip.id, { version: 1, name: 'First Edit' })

    const res = await patchTrip(cookie, trip.id, {
      version: 1,
      name: 'Second Edit',
    })

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('edit_conflict')
    const stored = (await listTrips(cookie)).find((t) => t.id === trip.id)
    expect(stored?.name).toBe('First Edit')
  })

  it('refuses an end date before the stored start with validation_failed', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, {
      startsOn: '2031-04-10',
      endsOn: '2031-04-16',
    })

    const res = await patchTrip(cookie, trip.id, {
      version: 1,
      endsOn: '2031-04-09',
    })

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })

  it('refuses a body without a version with validation_failed', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)

    const res = await patchTrip(cookie, trip.id, { name: 'No Version' })

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })

  it('answers not_found for an id no trip holds', async () => {
    const { cookie } = await signedIn()

    const res = await patchTrip(cookie, crypto.randomUUID(), {
      version: 1,
      name: 'Nobody',
    })

    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('not_found')
  })
})

describe('a trip date change', () => {
  it('refuses dates leaving a live entry outside with entries_outside_range', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, {
      startsOn: '2031-04-10',
      endsOn: '2031-04-16',
    })
    await addEntry(cookie, trip.id, {
      startsOn: '2031-04-15',
      endsOn: '2031-04-15',
    })

    const res = await patchTrip(cookie, trip.id, {
      version: 1,
      endsOn: '2031-04-14',
    })

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('entries_outside_range')
    const stored = (await listTrips(cookie)).find((t) => t.id === trip.id)
    expect(stored?.endsOn).toBe('2031-04-16')
  })

  it('allows dates that still hold every live entry', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, {
      startsOn: '2031-04-10',
      endsOn: '2031-04-16',
    })
    await addEntry(cookie, trip.id, {
      startsOn: '2031-04-12',
      endsOn: '2031-04-12',
    })

    const res = await patchTrip(cookie, trip.id, {
      version: 1,
      startsOn: '2031-04-12',
      endsOn: '2031-04-12',
    })

    expect(res.status).toBe(200)
  })

  it('ignores a deleted entry outside the new dates', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, {
      startsOn: '2031-04-10',
      endsOn: '2031-04-16',
    })
    const { entry } = await addEntry(cookie, trip.id, {
      startsOn: '2031-04-15',
      endsOn: '2031-04-15',
    })
    await app.request(
      `/api/entries/${entry.id}`,
      json('DELETE', { version: 1 }, cookie),
      env,
    )

    const res = await patchTrip(cookie, trip.id, {
      version: 1,
      endsOn: '2031-04-14',
    })

    expect(res.status).toBe(200)
  })
})

describe('a trip currency change', () => {
  it('refuses a trip whose entries carry a cost with currency_has_costs', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, { currency: 'VND' })
    await addEntry(cookie, trip.id, { costMinor: 450000 })

    const res = await patchTrip(cookie, trip.id, {
      version: 1,
      currency: 'USD',
    })

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('currency_has_costs')
    const stored = (await listTrips(cookie)).find((t) => t.id === trip.id)
    expect(stored?.currency).toBe('VND')
  })

  it('allows it while no live entry carries a cost', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, { currency: 'VND' })
    await addEntry(cookie, trip.id, { costMinor: null })

    const res = await patchTrip(cookie, trip.id, {
      version: 1,
      currency: 'USD',
    })

    expect(res.status).toBe(200)
  })

  it('allows a home currency change over costed entries', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, { homeCurrency: 'USD' })
    await addEntry(cookie, trip.id, { costMinor: 450000 })

    const res = await patchTrip(cookie, trip.id, {
      version: 1,
      homeCurrency: 'EUR',
    })

    expect(res.status).toBe(200)
  })
})

describe('a trip zone change', () => {
  it('moves entries in the old zone and keeps their clock times', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, { timeZone: 'Asia/Ho_Chi_Minh' })
    const { entry } = await addEntry(cookie, trip.id, {
      startTime: '09:00',
      endTime: '10:30',
    })

    await patchTrip(cookie, trip.id, { version: 1, timeZone: 'Asia/Bangkok' })

    const detail = await readTrip(cookie, trip.id)
    expect(detail.entries.find((e) => e.id === entry.id)).toMatchObject({
      timeZone: 'Asia/Bangkok',
      startTime: '09:00',
      endTime: '10:30',
      version: 2,
    })
  })

  it('leaves an entry in another zone as it was', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie, { timeZone: 'Asia/Ho_Chi_Minh' })
    const { entry } = await addEntry(cookie, trip.id, {
      timeZone: 'Asia/Tokyo',
    })

    await patchTrip(cookie, trip.id, { version: 1, timeZone: 'Asia/Bangkok' })

    const detail = await readTrip(cookie, trip.id)
    expect(detail.entries.find((e) => e.id === entry.id)).toMatchObject({
      timeZone: 'Asia/Tokyo',
      version: 1,
    })
  })
})

describe('GET /api/trips/:id', () => {
  it('answers the trip with its live entries in date and time order', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    const later = await addEntry(cookie, trip.id, {
      startsOn: '2031-04-12',
      endsOn: '2031-04-12',
    })
    const earlier = await addEntry(cookie, trip.id, {
      startsOn: '2031-04-11',
      endsOn: '2031-04-11',
    })
    const gone = await addEntry(cookie, trip.id)
    await app.request(
      `/api/entries/${gone.entry.id}`,
      json('DELETE', { version: 1 }, cookie),
      env,
    )

    const detail = await readTrip(cookie, trip.id)

    expect(detail.trip).toEqual(trip)
    expect(detail.entries.map((e) => e.id)).toEqual([
      earlier.entry.id,
      later.entry.id,
    ])
  })

  it('answers not_found for a deleted trip', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    await deleteTrip(cookie, trip.id, 1)

    const res = await app.request(
      `/api/trips/${trip.id}`,
      bare('GET', cookie),
      env,
    )

    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('not_found')
  })
})

describe('DELETE /api/trips/:id', () => {
  it('removes the trip from the list and answers its change', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)

    const res = await deleteTrip(cookie, trip.id, 1)

    expect(res.status).toBe(200)
    expect(removed.parse(await res.json()).changeId).toEqual(expect.any(String))
    expect((await listTrips(cookie)).map((t) => t.id)).not.toContain(trip.id)
  })

  it('refuses a stale version with edit_conflict', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    await patchTrip(cookie, trip.id, { version: 1, name: 'Edited' })

    const res = await deleteTrip(cookie, trip.id, 1)

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('edit_conflict')
  })

  it('refuses an update to a deleted trip with not_found', async () => {
    const { cookie } = await signedIn()
    const { trip } = await addTrip(cookie)
    await deleteTrip(cookie, trip.id, 1)

    const res = await patchTrip(cookie, trip.id, {
      version: 2,
      name: 'Back From The Dead',
    })

    expect(res.status).toBe(404)
  })
})
