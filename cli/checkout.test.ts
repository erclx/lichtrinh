import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveCheckout } from './checkout'

const OWN_ROOT = '/opt/lichtrinh'

function gitRepo(dir: string, packageName: string): void {
  spawnSync('git', ['init', '--quiet', dir])
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: packageName }),
  )
}

describe('resolveCheckout', () => {
  let dir: string

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'lichtrinh-checkout-')))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('takes the git top level of a lichtrinh checkout from a subfolder', () => {
    gitRepo(dir, 'lichtrinh')
    mkdirSync(join(dir, 'voice'))

    expect(resolveCheckout(join(dir, 'voice'), OWN_ROOT)).toEqual({
      root: dir,
      fallback: false,
    })
  })

  it('falls back to its own checkout inside another git project', () => {
    gitRepo(dir, 'someone-else')

    expect(resolveCheckout(dir, OWN_ROOT)).toEqual({
      root: OWN_ROOT,
      fallback: true,
    })
  })

  it('falls back to its own checkout outside any git project', () => {
    expect(resolveCheckout(dir, OWN_ROOT)).toEqual({
      root: OWN_ROOT,
      fallback: true,
    })
  })
})
