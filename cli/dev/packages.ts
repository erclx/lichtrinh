/** A declared package `node_modules/` does not hold at its locked version. */
export interface StalePackage {
  name: string
  /** Undefined when `node_modules/` lacks it. */
  installed?: string
  /** Undefined when `bun.lock` records none, as when the lockfile is gone. */
  locked?: string
}

/**
 * Every package the manifest declares that a `bun install` would change,
 * sorted by name. `read` returns a file inside the checkout by its relative
 * path, or undefined when the file is absent.
 */
export function stalePackages(
  read: (path: string) => string | undefined,
): StalePackage[] {
  const lock = read('bun.lock') ?? ''
  return declaredNames(read('package.json'))
    .toSorted()
    .flatMap((name) => {
      const installed = installedVersion(
        read(`node_modules/${name}/package.json`),
      )
      const locked = lockedVersion(lock, name)
      if (installed !== undefined && installed === locked) return []
      return [
        {
          name,
          ...(installed === undefined ? {} : { installed }),
          ...(locked === undefined ? {} : { locked }),
        },
      ]
    })
}

function declaredNames(manifest: string | undefined): string[] {
  const parsed = parseObject(manifest)
  return ['dependencies', 'devDependencies'].flatMap((field) => {
    const group = parsed?.[field]
    return typeof group === 'object' && group !== null ? Object.keys(group) : []
  })
}

function installedVersion(manifest: string | undefined): string | undefined {
  const version = parseObject(manifest)?.version
  return typeof version === 'string' ? version : undefined
}

/**
 * `bun.lock` is JSON with trailing commas, so a top-level entry is read by
 * its line, being `"<name>": ["<name>@<version>", ...`. A nested copy such
 * as `"vite/rolldown"` carries a slash before its name and never matches.
 */
function lockedVersion(lock: string, name: string): string | undefined {
  const quoted = name.replaceAll(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  const entry = new RegExp(`^\\s*"${quoted}": \\["${quoted}@([^"]+)"`, 'm')
  return entry.exec(lock)?.[1]
}

function parseObject(
  text: string | undefined,
): Record<string, unknown> | undefined {
  if (text === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(text)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
