import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { renderUnits, UNITS } from './units'

const VOICE = 'lichtrinh-voice.service'
const BRIDGE = 'lichtrinh-bridge.service'
const STAGING = 'lichtrinh-bridge-staging.service'
const PANEL = 'lichtrinh-panel.service'

const units = renderUnits({
  root: '/work/lichtrinh',
  toolFolders: ['/home/owner/.bun/bin', '/home/owner/.local/bin'],
})

const services = [VOICE, BRIDGE, STAGING, PANEL]

describe('renderUnits', () => {
  it('renders the target and its four services', () => {
    expect(Object.keys(units)).toEqual([...UNITS])
    expect(UNITS).toHaveLength(5)
  })

  it('holds voice and the bridge in the target, and nothing else', () => {
    expect(units['lichtrinh.target']).toContain(`Wants=${VOICE} ${BRIDGE}\n`)
    expect(services.filter((name) => units[name].includes('PartOf='))).toEqual([
      VOICE,
      BRIDGE,
    ])
  })

  it.each(Object.entries(units))(
    'starts %s by hand alone and pulls in no other unit',
    (name, text) => {
      expect(text).not.toContain('[Install]')
      expect(text).not.toMatch(/^(WantedBy|RequiredBy|Requires|BindsTo)=/m)
      expect(text.match(/^Wants=/gm) ?? []).toHaveLength(
        name === 'lichtrinh.target' ? 1 : 0,
      )
    },
  )

  it.each(Object.entries(units))('keeps every secret out of %s', (_, text) => {
    expect(text).not.toMatch(/SECRET|LICHTRINH_URL|EnvironmentFile/)
  })

  it.each([
    [BRIDGE, 'bridge.env'],
    [STAGING, 'bridge-staging.env'],
  ])('runs %s on its own settings file', (name, file) => {
    expect(units[name]).toContain(
      `ExecStart=/bin/bash -c 'source "%h/.config/lichtrinh/${file}" && exec bun cli/index.ts bridge run'\n`,
    )
  })

  it.each(services)('gives %s the checkout and the tools', (name) => {
    expect(units[name]).toContain('WorkingDirectory=/work/lichtrinh\n')
    expect(units[name]).toContain(
      'Environment="PATH=/home/owner/.bun/bin:/home/owner/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/lib/wsl/lib"\n',
    )
  })

  it.each(services)(
    'restarts %s on a crash, three starts in five minutes',
    (name) => {
      expect(units[name]).toContain('Restart=on-failure\n')
      expect(units[name]).toContain(
        'StartLimitIntervalSec=300\nStartLimitBurst=3\n',
      )
    },
  )

  it('builds the page before the panel serves it', () => {
    expect(units[PANEL]).toContain(
      'ExecStartPre=/usr/bin/env bun run panel:build\nExecStart=',
    )
  })

  it('runs the panel on its own settings file where one exists', () => {
    expect(units[PANEL]).toContain(
      `ExecStart=/bin/bash -c '[ ! -f "%h/.config/lichtrinh/panel.env" ] || source "%h/.config/lichtrinh/panel.env" && exec bun panel/server/index.ts'\n`,
    )
  })

  it('writes a folder with a percent sign as systemd reads it', () => {
    const odd = renderUnits({ root: '/work/50%', toolFolders: ['/opt/%h'] })

    expect(odd[VOICE]).toContain('WorkingDirectory=/work/50%%\n')
    expect(odd[VOICE]).toContain('PATH=/opt/%%h:')
  })

  it('names a folder once where two tools share it', () => {
    const shared = renderUnits({
      root: '/work/lichtrinh',
      toolFolders: ['/usr/bin', '/usr/bin'],
    })

    expect(shared[VOICE]).toContain(
      'PATH=/usr/bin:/usr/local/bin:/bin:/usr/lib/wsl/lib"',
    )
  })
})

/** Runs the panel's start line in bash, with a stand-in for the server. */
function startPanel(home: string) {
  const line = /^ExecStart=\/bin\/bash -c '(.*)'$/m.exec(units[PANEL])?.[1]
  if (line === undefined) throw new Error('The panel has no bash start line')
  const script = line
    .replaceAll('%h', home)
    .replace('exec bun panel/server/index.ts', 'echo "url=$LICHTRINH_URL"')
  return spawnSync('/bin/bash', ['-c', script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  })
}

describe('the panel start line', () => {
  it('starts with no settings file, and without the app', () => {
    const home = mkdtempSync(join(tmpdir(), 'lichtrinh-home-'))

    const { status, stdout } = startPanel(home)
    rmSync(home, { recursive: true })

    expect(status).toBe(0)
    expect(stdout).toBe('url=\n')
  })

  it('hands the server what its settings file exports', () => {
    const home = mkdtempSync(join(tmpdir(), 'lichtrinh-home-'))
    mkdirSync(join(home, '.config/lichtrinh'), { recursive: true })
    writeFileSync(
      join(home, '.config/lichtrinh/panel.env'),
      'export LICHTRINH_URL=https://lichtrinh.example.com\n',
    )

    const { status, stdout } = startPanel(home)
    rmSync(home, { recursive: true })

    expect(status).toBe(0)
    expect(stdout).toBe('url=https://lichtrinh.example.com\n')
  })
})

const analyzer = spawnSync('systemd-analyze', ['--version']).status === 0

describe.skipIf(!analyzer)('what systemd makes of the units', () => {
  it('reads every unit with no complaint', () => {
    const folder = mkdtempSync(join(tmpdir(), 'lichtrinh-units-'))
    const real = renderUnits({ root: folder, toolFolders: [] })
    for (const [name, text] of Object.entries(real)) {
      writeFileSync(join(folder, name), text)
    }

    const { status, stderr } = spawnSync(
      'systemd-analyze',
      [
        '--user',
        '--man=no',
        'verify',
        ...UNITS.map((name) => join(folder, name)),
      ],
      { encoding: 'utf8' },
    )
    rmSync(folder, { recursive: true })

    expect(stderr.split('\n').filter((line) => line.includes(folder))).toEqual(
      [],
    )
    expect(status).toBe(0)
  })
})
