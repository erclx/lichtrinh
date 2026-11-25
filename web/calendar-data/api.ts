import { changePage, removed, undone } from '@shared/changes.ts'
import {
  type CreateEntryRequest,
  entryList,
  type EntryRange,
  entryRead,
  entryWrite,
  type UpdateEntryRequest,
} from '@shared/entries.ts'
import {
  type CreateTripRequest,
  tripList,
  tripWithEntries,
  tripWrite,
} from '@shared/trips.ts'

import { apiFetch } from '@/lib/api'

const segment = encodeURIComponent

export async function listTrips() {
  const { trips } = await apiFetch('/trips', { schema: tripList })
  return trips
}

/** One trip with every live entry on it. */
export function getTrip(id: string) {
  return apiFetch(`/trips/${segment(id)}`, { schema: tripWithEntries })
}

export function createTrip(request: CreateTripRequest) {
  return apiFetch('/trips', {
    method: 'POST',
    body: request,
    schema: tripWrite,
  })
}

export async function listEntries(range: EntryRange) {
  const query = new URLSearchParams({ from: range.from, to: range.to })
  if (range.tripId !== undefined) query.set('tripId', range.tripId)
  const { entries } = await apiFetch(`/entries?${query}`, {
    schema: entryList,
  })
  return entries
}

export async function getEntry(id: string) {
  const { entry } = await apiFetch(`/entries/${segment(id)}`, {
    schema: entryRead,
  })
  return entry
}

export function createEntry(request: CreateEntryRequest) {
  return apiFetch('/entries', {
    method: 'POST',
    body: request,
    schema: entryWrite,
  })
}

export function updateEntry(id: string, request: UpdateEntryRequest) {
  return apiFetch(`/entries/${segment(id)}`, {
    method: 'PATCH',
    body: request,
    schema: entryWrite,
  })
}

export function deleteEntry(id: string, version: number) {
  return apiFetch(`/entries/${segment(id)}`, {
    method: 'DELETE',
    body: { version },
    schema: removed,
  })
}

/** Reverses a change. A retry under the same `undoId` answers the stored undo. */
export function undoChange(changeId: string, undoId: string) {
  return apiFetch(`/changes/${segment(changeId)}/undo`, {
    method: 'POST',
    body: { undoId },
    schema: undone,
  })
}

/** A page of a trip's history, newest first, older than `before` when given. */
export function listChanges(tripId: string, before?: string) {
  const query =
    before === undefined ? '' : `?${new URLSearchParams({ before })}`
  return apiFetch(`/trips/${segment(tripId)}/changes${query}`, {
    schema: changePage,
  })
}
