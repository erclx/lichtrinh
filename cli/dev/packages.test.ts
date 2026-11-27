import { describe, expect, it } from 'vitest'

import { stalePackages } from './packages'

const MANIFEST = JSON.stringify({
  dependencies: { '@base-ui/react': '^1.9.0' },
  devDependencies: { uqr: '^0.1.3', vite: '^8.3.6' },
})

const LOCK = [
  '{',
  '  "packages": {',
  '    "@base-ui/react": ["@base-ui/react@1.9.0", "", {}, "sha512-a"],',
  '    "uqr": ["uqr@0.1.3", "", {}, "sha512-b"],',
  '    "vite": ["vite@8.3.8", "", {}, "sha512-c"],',
  '    "vite/rolldown": ["rolldown@1.2.18", "", {}, "sha512-d"],',
  '  }',
  '}',
].join('\n')

const installed = (name: string, version: string) => [
  `node_modules/${name}/package.json`,
  JSON.stringify({ name, version }),
]

/** A checkout holding these files, read by their path inside it. */
function checkout(files: Record<string, string>) {
  return (path: string) => files[path]
}

const CLEAN = {
  'package.json': MANIFEST,
  'bun.lock': LOCK,
  ...Object.fromEntries([
    installed('@base-ui/react', '1.9.0'),
    installed('uqr', '0.1.3'),
    installed('vite', '8.3.8'),
  ]),
}

describe('stalePackages', () => {
  it('finds nothing where every package sits at its locked version', () => {
    expect(stalePackages(checkout(CLEAN))).toEqual([])
  })

  it('names a package the lockfile holds and node_modules lacks', () => {
    const { 'node_modules/uqr/package.json': _, ...files } = CLEAN

    expect(stalePackages(checkout(files))).toEqual([
      { name: 'uqr', locked: '0.1.3' },
    ])
  })

  it('names a package installed at a version other than the locked one', () => {
    const files = {
      ...CLEAN,
      ...Object.fromEntries([installed('vite', '8.1.0')]),
    }

    expect(stalePackages(checkout(files))).toEqual([
      { name: 'vite', installed: '8.1.0', locked: '8.3.8' },
    ])
  })

  it('reads a scoped name whole', () => {
    const files = {
      ...CLEAN,
      ...Object.fromEntries([installed('@base-ui/react', '1.8.0')]),
    }

    expect(stalePackages(checkout(files))).toEqual([
      { name: '@base-ui/react', installed: '1.8.0', locked: '1.9.0' },
    ])
  })

  it('names every package when the lockfile is missing, rather than passing', () => {
    const { 'bun.lock': _, ...files } = CLEAN

    expect(stalePackages(checkout(files))).toEqual([
      { name: '@base-ui/react', installed: '1.9.0' },
      { name: 'uqr', installed: '0.1.3' },
      { name: 'vite', installed: '8.3.8' },
    ])
  })
})
