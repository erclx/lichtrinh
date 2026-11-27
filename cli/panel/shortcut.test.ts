import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { icoFromPngs } from './icon'
import { isPlainDistro, shortcutCommand, shortcutScript } from './shortcut'

const SETTINGS = {
  distro: 'Ubuntu-24.04',
  root: '/home/owner/lichtrinh',
  bun: '/home/owner/.bun/bin/bun',
  icon: Buffer.from('an icon'),
}

const appIcon = () =>
  icoFromPngs(
    [16, 32, 48].map((size) =>
      readFileSync(
        resolve(
          import.meta.dirname,
          `../../web/public/icon-${size}x${size}.png`,
        ),
      ),
    ),
  )

const lineOf = (script: string, property: string) =>
  script.split('\n').find((line) => line.startsWith(`$link.${property}`))

describe('shortcutScript', () => {
  it('opens the panel through the windowless launcher', () => {
    const script = shortcutScript(SETTINGS)

    expect(lineOf(script, 'TargetPath')).toBe(
      "$link.TargetPath = Join-Path $env:ProgramFiles 'WSL\\wslg.exe'",
    )
    expect(lineOf(script, 'Arguments')).toBe(
      `$link.Arguments = '-d Ubuntu-24.04 --cd "/home/owner/lichtrinh" -- ''/home/owner/.bun/bin/bun'' cli/index.ts panel open'`,
    )
  })

  it('leaves every Windows folder to Windows, so a profile with a space stays whole', () => {
    const script = shortcutScript(SETTINGS)

    expect(script).toContain("[Environment]::GetFolderPath('Desktop')")
    expect(lineOf(script, 'WorkingDirectory')).toBe(
      '$link.WorkingDirectory = $env:USERPROFILE',
    )
    expect(script).not.toMatch(/C:\\|\/mnt\/c/i)
  })

  it('writes the icon to a Windows folder, so it shows while WSL is stopped', () => {
    const script = shortcutScript(SETTINGS)

    expect(script).toContain("Join-Path $env:LOCALAPPDATA 'Lichtrinh'")
    expect(script).toContain(
      `[Convert]::FromBase64String('${SETTINGS.icon.toString('base64')}')`,
    )
    expect(lineOf(script, 'IconLocation')).toBe(
      '$link.IconLocation = "$icon,0"',
    )
    expect(script).not.toContain('wsl.localhost')
  })

  it('keeps a checkout folder with a space and a quote as one argument', () => {
    const script = shortcutScript({
      ...SETTINGS,
      root: '/home/the owner/lichtrinh',
      bun: "/opt/the owner's/bun",
    })

    expect(lineOf(script, 'Arguments')).toBe(
      `$link.Arguments = '-d Ubuntu-24.04 --cd "/home/the owner/lichtrinh" -- ''/opt/the owner''\\''''s/bun'' cli/index.ts panel open'`,
    )
  })
})

describe('isPlainDistro', () => {
  it('takes the names WSL gives a distribution', () => {
    expect(isPlainDistro('Ubuntu-24.04')).toBe(true)
    expect(isPlainDistro('my_distro.2')).toBe(true)
  })

  it('refuses a name a Windows command line would split or quote', () => {
    expect(isPlainDistro('My Distro')).toBe(false)
    expect(isPlainDistro('Ubuntu"')).toBe(false)
    expect(isPlainDistro('')).toBe(false)
  })
})

describe('shortcutCommand', () => {
  it('hands PowerShell the script whole, past every shell between', () => {
    const command = shortcutCommand(SETTINGS)

    expect(command.slice(0, -1)).toEqual([
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
    ])
    expect(
      Buffer.from(command.at(-1) ?? '', 'base64').toString('utf16le'),
    ).toBe(shortcutScript(SETTINGS))
  })

  it('stays inside the 32,767 characters a Windows command line holds', () => {
    const command = shortcutCommand({ ...SETTINGS, icon: appIcon() })

    expect(command.join(' ').length).toBeLessThan(32_767)
  })
})
