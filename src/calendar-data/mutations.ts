import type { CreateEntryRequest, UpdateEntryRequest } from '@shared/entries.ts'
import type { CreateTripRequest } from '@shared/trips.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  createEntry,
  createTrip,
  deleteEntry,
  undoChange,
  updateEntry,
} from './api'
import { calendarKeys } from './queries'

// A write can move an entry between days, and a trip's totals follow its
// entries, so every calendar read asks again after one.
function useRefreshAfter() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: calendarKeys.all })
}

/** Takes the request with its `id` already set, so a retry reuses it. */
export function useCreateTrip() {
  const onSuccess = useRefreshAfter()
  return useMutation({
    mutationFn: (request: CreateTripRequest) => createTrip(request),
    onSuccess,
  })
}

/** Takes the request with its `id` already set, so a retry reuses it. */
export function useCreateEntry() {
  const onSuccess = useRefreshAfter()
  return useMutation({
    mutationFn: (request: CreateEntryRequest) => createEntry(request),
    onSuccess,
  })
}

/** Sends the `version` read, so a change another person made first refuses. */
export function useUpdateEntry() {
  const onSuccess = useRefreshAfter()
  return useMutation({
    mutationFn: ({ id, ...request }: UpdateEntryRequest & { id: string }) =>
      updateEntry(id, request),
    onSuccess,
  })
}

export function useDeleteEntry() {
  const onSuccess = useRefreshAfter()
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      deleteEntry(id, version),
    onSuccess,
  })
}

export function useUndo() {
  const onSuccess = useRefreshAfter()
  return useMutation({
    mutationFn: ({ changeId, undoId }: { changeId: string; undoId: string }) =>
      undoChange(changeId, undoId),
    onSuccess,
  })
}
