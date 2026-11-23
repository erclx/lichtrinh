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

// Every calendar read asks again after a write, since totals follow entries.
// Unawaited, since a mutation holds its callers' callbacks until its own
// returns, and a caller moving to another page should not wait on reads.
function useRefreshAfter() {
  const client = useQueryClient()
  return (skip?: readonly unknown[]) => {
    void client.invalidateQueries({
      queryKey: calendarKeys.all,
      predicate: ({ queryKey }) =>
        skip === undefined || JSON.stringify(queryKey) !== JSON.stringify(skip),
    })
  }
}

/** Takes the request with its `id` already set, so a retry reuses it. */
export function useCreateTrip() {
  const refresh = useRefreshAfter()
  return useMutation({
    mutationFn: (request: CreateTripRequest) => createTrip(request),
    onSuccess: () => refresh(),
  })
}

/** Takes the request with its `id` already set, so a retry reuses it. */
export function useCreateEntry() {
  const refresh = useRefreshAfter()
  return useMutation({
    mutationFn: (request: CreateEntryRequest) => createEntry(request),
    onSuccess: () => refresh(),
  })
}

/** Sends the `version` read, so a change another person made first refuses. */
export function useUpdateEntry() {
  const refresh = useRefreshAfter()
  return useMutation({
    mutationFn: ({ id, ...request }: UpdateEntryRequest & { id: string }) =>
      updateEntry(id, request),
    onSuccess: () => refresh(),
  })
}

/** Reads nothing back for the deleted entry, which would answer not_found. */
export function useDeleteEntry() {
  const refresh = useRefreshAfter()
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      deleteEntry(id, version),
    onSuccess: (_removed, { id }) => refresh(calendarKeys.entry(id)),
  })
}

export function useUndo() {
  const refresh = useRefreshAfter()
  return useMutation({
    mutationFn: ({ changeId, undoId }: { changeId: string; undoId: string }) =>
      undoChange(changeId, undoId),
    onSuccess: () => refresh(),
  })
}
