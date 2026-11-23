import type { CreateEntryRequest } from '@shared/entries.ts'
import { entryWrite } from '@shared/entries.ts'
import type { CreateTripRequest } from '@shared/trips.ts'
import { tripWrite } from '@shared/trips.ts'
import { env } from 'cloudflare:workers'

import { app } from '../app.ts'
import { json } from './requests.ts'

/**
 * A create body for an invented trip in 2031, with a fresh id. Pass only
 * the fields a case is about.
 */
export function tripBody(
  overrides: Partial<CreateTripRequest> = {},
): CreateTripRequest {
  return {
    id: crypto.randomUUID(),
    name: 'Invented Coast Trip',
    startsOn: '2031-04-10',
    endsOn: '2031-04-16',
    timeZone: 'Asia/Ho_Chi_Minh',
    currency: 'VND',
    homeCurrency: 'USD',
    ...overrides,
  }
}

export function postTrip(cookie: string, body: unknown) {
  return app.request('/api/trips', json('POST', body, cookie), env)
}

/** Creates an invented trip through the API and returns what it answered. */
export async function addTrip(
  cookie: string,
  overrides: Partial<CreateTripRequest> = {},
) {
  const res = await postTrip(cookie, tripBody(overrides))
  if (res.status !== 201) throw new Error(`Trip create answered ${res.status}`)
  return tripWrite.parse(await res.json())
}

/**
 * A create body for an invented entry on the first day of the builder's
 * trip dates, with a fresh id.
 */
export function entryBody(
  tripId: string,
  overrides: Partial<CreateEntryRequest> = {},
): CreateEntryRequest {
  return {
    id: crypto.randomUUID(),
    tripId,
    title: 'Invented Harbor Walk',
    startsOn: '2031-04-10',
    startTime: '09:00',
    endsOn: '2031-04-10',
    endTime: '10:30',
    ...overrides,
  }
}

export function postEntry(cookie: string, body: unknown) {
  return app.request('/api/entries', json('POST', body, cookie), env)
}

/** Creates an invented entry through the API and returns what it answered. */
export async function addEntry(
  cookie: string,
  tripId: string,
  overrides: Partial<CreateEntryRequest> = {},
) {
  const res = await postEntry(cookie, entryBody(tripId, overrides))
  if (res.status !== 201) {
    throw new Error(`Entry create answered ${res.status}`)
  }
  return entryWrite.parse(await res.json())
}
