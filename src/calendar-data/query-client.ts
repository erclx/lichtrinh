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
        // As long as the device keeps it, or an unwatched read leaves the save.
        gcTime: calendarCacheMaxAge,
        refetchOnWindowFocus: true,
        refetchInterval: refreshMs,
        refetchIntervalInBackground: false,
        retry: retryLostAnswer,
      },
      // Offline a write fails at once to the save error rather than pausing.
      mutations: { retry: false, networkMode: 'always' },
    },
  })
}
