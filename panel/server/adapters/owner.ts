import type { OwnerSummary } from '@shared/owner.ts'
import { ownerSummary } from '@shared/owner.ts'

import type { AppLink } from '../config.ts'

/** What the family's app last said, or that it could not be read. */
export type AppRead =
  | { reach: 'read'; summary: OwnerSummary; at: Date }
  | { reach: 'unreachable' }

const READ_TIMEOUT_MS = 5_000
// Each read costs the app a Worker request, a relay call, and a scan.
const READ_EVERY_MS = 30_000

/**
 * Reads the app's owner summary when asked, at most every thirty seconds, so
 * a hidden page reads nothing. A failed read keeps no rows from the last one.
 */
export function createOwnerReader(
  fetcher: typeof fetch,
  link: AppLink,
  now: () => Date,
) {
  let last: { at: number; read: AppRead } | undefined
  let pending: Promise<AppRead> | undefined

  async function ask(at: Date): Promise<AppRead> {
    const midnight = new Date(at)
    midnight.setHours(0, 0, 0, 0)
    const url = new URL('/api/owner/summary', link.url)
    url.searchParams.set('since', midnight.toISOString())
    try {
      const response = await fetcher(url.href, {
        headers: { authorization: `Bearer ${link.secret}` },
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      })
      if (!response.ok) return { reach: 'unreachable' }
      const summary = ownerSummary.parse(await response.json())
      return { reach: 'read', summary, at }
    } catch {
      return { reach: 'unreachable' }
    }
  }

  return async (): Promise<AppRead> => {
    const at = now()
    if (last !== undefined && at.getTime() - last.at < READ_EVERY_MS) {
      return last.read
    }
    pending ??= ask(at).then((read) => {
      last = { at: at.getTime(), read }
      pending = undefined
      return read
    })
    return pending
  }
}
