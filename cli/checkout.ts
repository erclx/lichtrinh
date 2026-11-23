import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Checkout } from './program'

/**
 * The checkout to act on: the git top level of the working folder when it is
 * a lichtrinh checkout, a linked worktree included, else the command's own.
 */
export function resolveCheckout(cwd: string, ownRoot: string): Checkout {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  })
  const root = top.status === 0 ? top.stdout.trim() : undefined
  if (root !== undefined && isLichtrinh(root)) return { root, fallback: false }
  return { root: ownRoot, fallback: true }
}

function isLichtrinh(root: string): boolean {
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    )
    return (
      typeof manifest === 'object' &&
      manifest !== null &&
      'name' in manifest &&
      manifest.name === 'lichtrinh'
    )
  } catch {
    return false
  }
}
