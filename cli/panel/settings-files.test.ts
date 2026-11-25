import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { sharedHost } from './settings-files'

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'lichtrinh-settings-'))
  mkdirSync(join(home, '.config/lichtrinh'), { recursive: true })
})
afterEach(() => rmSync(home, { recursive: true }))

function settings(files: { family?: string; staging?: string }) {
  for (const [name, text] of [
    ['bridge.env', files.family],
    ['bridge-staging.env', files.staging],
  ] as const) {
    if (text === undefined) continue
    writeFileSync(
      join(home, '.config/lichtrinh', name),
      `${text}\nexport BRIDGE_SECRET=invented-secret\n`,
    )
  }
}

describe('sharedHost', () => {
  it('passes two hosts', () => {
    settings({
      family: 'export LICHTRINH_URL=https://app.invalid',
      staging: 'export LICHTRINH_URL=https://staging.invalid',
    })

    expect(sharedHost(home)).toBeUndefined()
  })

  it.each([
    [
      'spelled alike',
      'export LICHTRINH_URL=https://app.invalid',
      'export LICHTRINH_URL=https://app.invalid',
    ],
    [
      'behind another path, case, and quotes',
      'export LICHTRINH_URL="https://app.invalid/"',
      "LICHTRINH_URL='https://APP.invalid/chat'  # the copy",
    ],
    [
      'after a line the shell overrides',
      'export LICHTRINH_URL=https://app.invalid',
      'LICHTRINH_URL=https://old.invalid\nexport LICHTRINH_URL=https://app.invalid',
    ],
  ])('names one host written twice, %s', (_, family, staging) => {
    settings({ family, staging })

    expect(sharedHost(home)).toBe('app.invalid')
  })

  it('tells two ports on one machine apart', () => {
    settings({
      family: 'export LICHTRINH_URL=http://localhost:5173',
      staging: 'export LICHTRINH_URL=http://localhost:5174',
    })

    expect(sharedHost(home)).toBeUndefined()
  })

  it('reads past a commented line', () => {
    settings({
      family: 'export LICHTRINH_URL=https://app.invalid',
      staging:
        '# export LICHTRINH_URL=https://app.invalid\nexport LICHTRINH_URL=https://staging.invalid',
    })

    expect(sharedHost(home)).toBeUndefined()
  })

  it.each([
    [
      'a missing staging file',
      { family: 'export LICHTRINH_URL=https://app.invalid' },
    ],
    ['no file at all', {}],
    [
      'two addresses left empty',
      { family: 'LICHTRINH_URL=', staging: 'LICHTRINH_URL=' },
    ],
  ])('passes %s', (_, files) => {
    settings(files)

    expect(sharedHost(home)).toBeUndefined()
  })
})
