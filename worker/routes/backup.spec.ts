import type { Backup } from '@shared/backup.ts'
import { backup } from '@shared/backup.ts'
import { apiError } from '@shared/errors.ts'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { app } from '../app.ts'
import { bare, json } from '../test/requests.ts'
import { addEntry, addTrip } from '../test/trips.ts'
import { signedIn } from '../test/users.ts'

// The D1 queries one invocation may make on the free plan, which the local
// database does not enforce.
const FREE_PLAN_QUERIES = 50

function getBackup(cookie?: string) {
  return app.request('/api/admin/backup', bare('GET', cookie), env)
}

async function readBackup(cookie: string) {
  return backup.parse(await (await getBackup(cookie)).json())
}

async function errorCode(res: Response) {
  return apiError.parse(await res.json()).error.code
}

function remove(cookie: string, path: string, version: number) {
  return app.request(path, json('DELETE', { version }, cookie), env)
}

function tripIds({ trips }: Backup) {
  return trips.map(({ trip }) => trip.id)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/admin/backup', () => {
  it('names its format, its version, and when it was exported', async () => {
    const { cookie } = await signedIn({ role: 'admin' })

    const body = await readBackup(cookie)

    expect(body.format).toBe('lichtrinh-backup')
    expect(body.formatVersion).toBe(1)
    expect(Math.abs(Date.now() - Date.parse(body.exportedAt))).toBeLessThan(
      60_000,
    )
  })

  it('holds each trip whole with the entries under it', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id, {
      notes: 'Invented note',
      costMinor: 200000,
    })

    const { trips } = await readBackup(cookie)

    expect(trips).toContainEqual({ trip, entries: [entry] })
  })

  it('holds the trips another account made', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    const member = await signedIn()
    const { trip } = await addTrip(member.cookie)

    const body = await readBackup(cookie)

    expect(tripIds(body)).toContain(trip.id)
  })

  it('orders trips by start date and entries by when they start', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    const later = await addTrip(cookie, {
      startsOn: '2031-08-02',
      endsOn: '2031-08-04',
    })
    const sooner = await addTrip(cookie, {
      startsOn: '2031-08-01',
      endsOn: '2031-08-04',
    })
    const dinner = await addEntry(cookie, later.trip.id, {
      startsOn: '2031-08-02',
      startTime: '19:00',
      endsOn: '2031-08-02',
      endTime: '20:00',
    })
    const breakfast = await addEntry(cookie, later.trip.id, {
      startsOn: '2031-08-02',
      startTime: '07:00',
      endsOn: '2031-08-02',
      endTime: '08:00',
    })

    const { trips } = await readBackup(cookie)

    const added = trips.filter(({ trip }) =>
      [later.trip.id, sooner.trip.id].includes(trip.id),
    )
    expect(added).toEqual([
      { trip: sooner.trip, entries: [] },
      { trip: later.trip, entries: [breakfast.entry, dinner.entry] },
    ])
  })

  it('leaves out a deleted entry and keeps its trip', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id)
    await remove(cookie, `/api/entries/${entry.id}`, entry.version)

    const { trips } = await readBackup(cookie)

    expect(trips).toContainEqual({ trip, entries: [] })
  })

  it('leaves out a deleted trip and the live entries under it', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    const { trip } = await addTrip(cookie)
    const { entry } = await addEntry(cookie, trip.id)
    await remove(cookie, `/api/trips/${trip.id}`, trip.version)

    const text = await (await getBackup(cookie)).text()

    expect(text).toContain('lichtrinh-backup')
    expect(text).not.toContain(trip.id)
    expect(text).not.toContain(entry.id)
  })

  it('answers more trips than the free plan allows queries', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    const added = await Promise.all(
      Array.from({ length: 60 }, () => addTrip(cookie)),
    )
    const queries = vi.spyOn(env.DB, 'prepare')

    const body = await readBackup(cookie)

    expect(tripIds(body)).toEqual(
      expect.arrayContaining(added.map(({ trip }) => trip.id)),
    )
    expect(queries.mock.calls.length).toBeGreaterThan(0)
    expect(queries.mock.calls.length).toBeLessThan(FREE_PLAN_QUERIES)
  })

  it('tells every cache to keep no copy', async () => {
    const { cookie } = await signedIn({ role: 'admin' })

    const res = await getBackup(cookie)

    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('logs the outcome and two counts, and no text from the plan', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    const { trip } = await addTrip(cookie)
    await addEntry(cookie, trip.id)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { trips } = await readBackup(cookie)

    const lines = log.mock.calls.map(([line]) => JSON.parse(String(line)))
    expect(lines).toEqual([
      {
        outcome: 'backup_read',
        trips: trips.length,
        entries: trips.flatMap(({ entries }) => entries).length,
      },
    ])
  })

  it('refuses a member with forbidden', async () => {
    const { cookie } = await signedIn()

    const res = await getBackup(cookie)

    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('forbidden')
  })

  it('refuses a signed-out caller with unauthenticated', async () => {
    const res = await getBackup()

    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('unauthenticated')
  })
})
