import { z } from 'zod'

import { rowVersion, tripFields } from './changes.ts'
import { currency } from './currency.ts'
import { entry } from './entries.ts'
import { localDate, timeZone } from './trip-time.ts'

/** A trip as the API shows it. */
export const trip = tripFields.extend({
  id: z.string(),
  version: rowVersion,
})
export type Trip = z.infer<typeof trip>

const tripName = z.string().trim().min(1).max(80)
const currencyCode = z.string().trim().toUpperCase().pipe(currency)

/**
 * A new trip. The client generates `id` with `crypto.randomUUID()`, so a
 * retry after a lost response answers the stored trip rather than adding a
 * second one, and a reused id with another body is refused.
 */
export const createTripRequest = z
  .strictObject({
    id: z.uuid(),
    name: tripName,
    startsOn: localDate,
    endsOn: localDate,
    timeZone,
    currency: currencyCode,
    homeCurrency: currencyCode,
  })
  .refine((request) => request.endsOn >= request.startsOn, {
    message: 'A trip ends on or after the day it starts',
    path: ['endsOn'],
  })
export type CreateTripRequest = z.input<typeof createTripRequest>

/**
 * A change to some of a trip's fields, carrying the version it was read at.
 * A new zone moves every entry that shared the old one, keeping its clock
 * times. New dates are refused while a live entry starts outside them.
 */
export const updateTripRequest = z.strictObject({
  version: rowVersion,
  name: tripName.optional(),
  startsOn: localDate.optional(),
  endsOn: localDate.optional(),
  timeZone: timeZone.optional(),
  currency: currencyCode.optional(),
  homeCurrency: currencyCode.optional(),
})
export type UpdateTripRequest = z.input<typeof updateTripRequest>

/** Every live trip, ordered by start date, then end date, then id. */
export const tripList = z.strictObject({ trips: z.array(trip) })
export type TripList = z.infer<typeof tripList>

/** What a create or an update answers: the trip and the change to undo. */
export const tripWrite = z.strictObject({ trip, changeId: z.string() })
export type TripWrite = z.infer<typeof tripWrite>

/** One live trip with its live entries, ordered as the range read orders. */
export const tripWithEntries = z.strictObject({
  trip,
  entries: z.array(entry),
})
export type TripWithEntries = z.infer<typeof tripWithEntries>
