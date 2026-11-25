import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The host both bridges would dial, or undefined when each has its own. Two
 * bridges on one host replace each other on the relay without end. Only the
 * address is read, so no secret leaves a file.
 */
export function sharedHost(home: string): string | undefined {
  const folder = join(home, '.config/lichtrinh')
  const family = hostIn(join(folder, 'bridge.env'))
  const staging = hostIn(join(folder, 'bridge-staging.env'))
  return family !== undefined && family === staging ? family : undefined
}

// A missing file or a bad address is the bridge's own to refuse as it starts.
function hostIn(path: string): string | undefined {
  if (!existsSync(path)) return undefined
  const assignments = [
    ...readFileSync(path, 'utf8').matchAll(
      /^\s*(?:export\s+)?LICHTRINH_URL=(['"]?)([^'"\s#]*)\1/gm,
    ),
  ]
  // The shell keeps the last of two assignments.
  const address = assignments.at(-1)?.[2]
  return address !== undefined && URL.canParse(address)
    ? new URL(address).host
    : undefined
}
