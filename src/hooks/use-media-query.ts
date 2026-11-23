import { useCallback, useSyncExternalStore } from 'react'

// A browser without matchMedia, such as the test DOM, reads every query as
// unmatched, so the phone layout is the one that renders there.
function matches(query: string): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false
}

/** Whether a media query matches now, re-rendering when it starts or stops. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => matches(query),
    () => false,
  )
}
