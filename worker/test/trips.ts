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
