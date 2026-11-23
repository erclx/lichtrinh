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
      // Saved at once, since a throttled save is lost if the app closes first.
      throttleTime: 0,
    }),
    maxAge: calendarCacheMaxAge,
    buster: __APP_VERSION__,
    dehydrateOptions: {
      // A refresh failing offline keeps its data as an error, never an empty plan.
      shouldDehydrateQuery: (query) =>
        query.queryKey[0] === calendarKeys.all[0] &&
        query.state.data !== undefined,
    },
  }
}

/**
 * Forgets the plan on sign-out, in memory and on the device, so the next
 * person on a shared phone never reads it.
 */
export function clearCalendarCache(client: QueryClient) {
  // Queries first, so a queued save writes an empty plan, never the old one.
  client.removeQueries({ queryKey: calendarKeys.all })
  safeStorage.removeItem(calendarCacheKey)
}
