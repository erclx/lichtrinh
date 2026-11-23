import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'

import { calendarKeys } from '@/calendar-data/queries'
import { onReach } from '@/lib/api'

function onBrowserChange(notify: () => void) {
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)
  return () => {
    window.removeEventListener('online', notify)
    window.removeEventListener('offline', notify)
  }
}

// Whether the last call got no answer, kept for the whole page since every
// call reports it, and a refusal is still an answer.
let lost = false
const lostListeners = new Set<() => void>()

onReach((reached) => {
  if (lost === !reached) return
  lost = !reached
  for (const notify of lostListeners) notify()
})

function onLostChange(notify: () => void) {
  lostListeners.add(notify)
  return () => {
    lostListeners.delete(notify)
  }
}

/**
 * Whether the app can reach the API. The browser's flag alone misses a
 * connection that is up with no internet behind it, so a call that got no
 * answer reads as offline too, until the next call gets one.
 */
export function useOnline(): boolean {
  const browser = useSyncExternalStore(
    onBrowserChange,
    () => navigator.onLine,
    () => true,
  )
  const unanswered = useSyncExternalStore(
    onLostChange,
    () => lost,
    () => false,
  )
  return browser && !unanswered
}

/** When the newest calendar read on screen was fetched, or null with none saved. */
export function useSavedAt(): number | null {
  const cache = useQueryClient().getQueryCache()
  const subscribe = useCallback(
    (notify: () => void) => cache.subscribe(notify),
    [cache],
  )
  const snapshot = () => {
    const times = cache
      .findAll({ queryKey: calendarKeys.all })
      .filter(({ state }) => state.data !== undefined)
      .map(({ state }) => state.dataUpdatedAt)
    return times.length === 0 ? null : Math.max(...times)
  }
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
