import type { EntryRange } from '@shared/entries.ts'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import { getEntry, getTrip, listChanges, listEntries, listTrips } from './api'

/**
 * Every calendar read's key, named once here since the offline plan persists
 * the cache under them, and a renamed key strands what it saved.
 */
export const calendarKeys = {
  all: ['calendar'] as const,
  trips: () => ['calendar', 'trips'] as const,
  trip: (id: string) => ['calendar', 'trip', id] as const,
  entries: (range: EntryRange) => ['calendar', 'entries', range] as const,
  entry: (id: string) => ['calendar', 'entry', id] as const,
  changes: (tripId: string) => ['calendar', 'changes', tripId] as const,
  rates: () => ['calendar', 'rates'] as const,
}

export function useTrips() {
  return useQuery({ queryKey: calendarKeys.trips(), queryFn: listTrips })
}

/** One trip and its entries, idle while `id` is undefined. */
export function useTrip(id: string | undefined) {
  return useQuery({
    queryKey: calendarKeys.trip(id ?? ''),
    queryFn: () => getTrip(id ?? ''),
    enabled: id !== undefined,
  })
}

/** The entries starting in a range, idle while `range` is undefined. */
export function useEntries(range: EntryRange | undefined) {
  const asked = range ?? { from: '', to: '' }
  return useQuery({
    queryKey: calendarKeys.entries(asked),
    queryFn: () => listEntries(asked),
    enabled: range !== undefined,
  })
}

export function useEntry(id: string) {
  return useQuery({
    queryKey: calendarKeys.entry(id),
    queryFn: () => getEntry(id),
  })
}

/** A trip's history by pages, newest first, idle while `tripId` is undefined. */
export function useChanges(tripId: string | undefined) {
  return useInfiniteQuery({
    queryKey: calendarKeys.changes(tripId ?? ''),
    queryFn: ({ pageParam }) => listChanges(tripId ?? '', pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextBefore ?? undefined,
    enabled: tripId !== undefined,
  })
}
