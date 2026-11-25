import { describe, expect, it } from 'vitest'

import { shortcutCommand, shortcutScript } from './shortcut'

const SETTINGS = {
  distro: 'Ubuntu-24.04',
  root: '/home/owner/lichtrinh',
  bun: '/home/owner/.bun/bin/bun',
}

const lineOf = (script: string, property: string) =>
  script.split('\n').find((line) => line.startsWith(`$link.${property}`))

describe('shortcutScript', () => {
  it('opens the panel through the windowless launcher', () => {
    const script = shortcutScript(SETTINGS)

    expect(lineOf(script, 'TargetPath')).toBe(
      "$link.TargetPath = Join-Path $env:ProgramFiles 'WSL\\wslg.exe'",
    )
    expect(lineOf(script, 'Arguments')).toBe(
      `$link.Arguments = '-d "Ubuntu-24.04" --cd "/home/owner/lichtrinh" -- ''/home/owner/.bun/bin/bun'' cli/index.ts panel open'`,
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

  it('keeps a checkout folder with a space and a quote as one argument', () => {
    const script = shortcutScript({
      ...SETTINGS,
      root: '/home/the owner/lichtrinh',
      bun: "/opt/the owner's/bun",
    })

    expect(lineOf(script, 'Arguments')).toBe(
      `$link.Arguments = '-d "Ubuntu-24.04" --cd "/home/the owner/lichtrinh" -- ''/opt/the owner''\\''''s/bun'' cli/index.ts panel open'`,
    )
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
})
