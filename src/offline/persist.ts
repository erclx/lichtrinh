import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { QueryClient } from '@tanstack/react-query'
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client'

import { calendarKeys } from '@/calendar-data/queries'

/** Set at build time from the release manifest, see `vite.config.ts`. */
declare const __APP_VERSION__: string

/** Where the last loaded plan lives on the device. */
export const calendarCacheKey = 'lichtrinh.calendarCache'

/** How long a saved plan stays readable, a week abroad. */
export const calendarCacheMaxAge = 7 * 24 * 60 * 60 * 1000

// Storage can throw in a private window, where the plan simply is not saved.
const safeStorage = {
  getItem(key: string) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Full or blocked, so this visit keeps the plan in memory alone.
    }
  },
  removeItem(key: string) {
    try {
      localStorage.removeItem(key)
    } catch {
      // Nothing was stored to remove.
    }
  },
}

/**
 * Keeps the calendar reads on the device for a week, so the last loaded plan
 * opens without a connection. A cache saved by another app version is
 * dropped rather than read in a shape the new code may not expect.
 */
export function calendarPersistOptions(): Omit<
  PersistQueryClientOptions,
  'queryClient'
> {
  return {
    persister: createAsyncStoragePersister({
      storage: safeStorage,
      key: calendarCacheKey,
      // Every change is saved at once, since a save waiting out a throttle is
      // lost when the traveler closes the app inside the wait.
      throttleTime: 0,
    }),
    maxAge: calendarCacheMaxAge,
    buster: __APP_VERSION__,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) =>
        query.queryKey[0] === calendarKeys.all[0] &&
        query.state.status === 'success',
    },
  }
}

/**
 * Forgets the plan on sign-out, in memory and on the device, so the next
 * person on a shared phone never reads it.
 */
export function clearCalendarCache(client: QueryClient) {
  // Removing the queries first replaces any save still queued with an empty
  // one, so it cannot write the old plan back after the key is gone.
  client.removeQueries({ queryKey: calendarKeys.all })
  safeStorage.removeItem(calendarCacheKey)
}
