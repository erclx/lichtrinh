import { QueryClient } from '@tanstack/react-query'

import { ApiFailure } from '@/lib/api'
import { calendarCacheMaxAge } from '@/offline/persist'

/** How often an open screen asks again, so one person sees another's change. */
export const refreshMs = 30_000

// Only a lost answer is worth asking again. A refusal answers the same twice.
function retryLostAnswer(failures: number, error: Error) {
  return error instanceof ApiFailure && error.code === 'network' && failures < 2
}

/**
 * The one cache every calendar screen reads through. A visible screen asks
 * again on focus and every 30 seconds, and a hidden tab stops asking.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        // Kept in memory as long as on the device, or a read nobody is
        // watching drops from the save before its week is up.
        gcTime: calendarCacheMaxAge,
        refetchOnWindowFocus: true,
        refetchInterval: refreshMs,
        refetchIntervalInBackground: false,
        retry: retryLostAnswer,
      },
      // A write offline fails at once with the save error, keeping what was
      // typed, rather than pausing on a form that never says it waits.
      mutations: { retry: false, networkMode: 'always' },
    },
  })
}
