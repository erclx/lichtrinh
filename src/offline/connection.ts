import { type Query, useQueryClient } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'

import { calendarKeys } from '@/calendar-data/queries'
import { ApiFailure } from '@/lib/api'
import { useSession } from '@/session/session-context'

function onBrowserChange(notify: () => void) {
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)
  return () => {
    window.removeEventListener('online', notify)
    window.removeEventListener('offline', notify)
  }
}

function lostOnNetwork(query: Query) {
  const { error } = query.state
  return error instanceof ApiFailure && error.code === 'network'
}

/** Reads one value off the calendar queries, renewed on every cache change. */
function useCalendarQueries<T>(read: (queries: Query[]) => T): T {
  const cache = useQueryClient().getQueryCache()
  const subscribe = useCallback(
    (notify: () => void) => cache.subscribe(notify),
    [cache],
  )
  const snapshot = () => read(cache.findAll({ queryKey: calendarKeys.all }))
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/**
 * Whether the app can reach the API. The browser's flag alone misses a
 * connection that is up with no internet behind it, so a calendar read lost
 * on the network, or a session that opened offline, reads as offline too.
 */
export function useOnline(): boolean {
  const { status } = useSession()
  const browser = useSyncExternalStore(
    onBrowserChange,
    () => navigator.onLine,
    () => true,
  )
  const lost = useCalendarQueries((queries) => queries.some(lostOnNetwork))
  return browser && !lost && status !== 'offline'
}

/** When the newest calendar read shown was fetched, or null with none saved. */
export function useSavedAt(): number | null {
  return useCalendarQueries((queries) => {
    const times = queries
      .filter(({ state }) => state.data !== undefined)
      .map(({ state }) => state.dataUpdatedAt)
    return times.length === 0 ? null : Math.max(...times)
  })
}
