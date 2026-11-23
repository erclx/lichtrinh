import { useEffect, useState } from 'react'

const tickMs = 30_000

/**
 * The current instant, renewed every 30 seconds, so a now card's time left
 * and the move to the next entry follow the clock without a reload.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), tickMs)
    return () => clearInterval(timer)
  }, [])
  return now
}
