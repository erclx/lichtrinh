export interface ShortcutSettings {
  distro: string
  root: string
  /** Bun by its own path, since the session a shortcut opens may not find it. */
  bun: string
}

/**
 * The command that writes `Lichtrinh` on the Windows desktop. It opens
 * through `wslg.exe`, which shows no console window while the hold runs.
 */
export function shortcutCommand(settings: ShortcutSettings): string[] {
  return [
    'powershell.exe',
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    Buffer.from(shortcutScript(settings), 'utf16le').toString('base64'),
  ]
}

/** Windows names its own folders, so a profile path with a space stays whole. */
export function shortcutScript(settings: ShortcutSettings): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    "$desktop = [Environment]::GetFolderPath('Desktop')",
    "$path = Join-Path $desktop 'Lichtrinh.lnk'",
    '$link = (New-Object -ComObject WScript.Shell).CreateShortcut($path)',
    "$link.TargetPath = Join-Path $env:ProgramFiles 'WSL\\wslg.exe'",
    `$link.Arguments = ${powershell(shortcutArguments(settings))}`,
    '$link.WorkingDirectory = $env:USERPROFILE',
    "$link.Description = 'Start the trip assistant on this PC and open its panel'",
    '$link.Save()',
    'Write-Output "Wrote $path"',
  ].join('\n')
}

/**
 * Whether a distribution name can go on the command line bare. `wslg.exe`
 * keeps any quotes around it as part of the name, so it cannot take a quoted
 * one, and WSL gives a distribution no characters past these.
 */
export function isPlainDistro(name: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(name)
}

function shortcutArguments({ distro, root, bun }: ShortcutSettings): string {
  return [
    '-d',
    distro,
    '--cd',
    windows(root),
    '--',
    shell(bun),
    'cli/index.ts panel open',
  ].join(' ')
}

/** One argument on a Windows command line. */
function windows(value: string) {
  return `"${value.replaceAll('"', '\\"')}"`
}

/** One word for the shell `wslg.exe` hands the rest to. */
function shell(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

/** A literal PowerShell string, which expands nothing inside it. */
function powershell(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}
