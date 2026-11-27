import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { PANEL_TITLE } from '../../panel/services'
import { type ProgramContext, runCli, type Task } from '../program'

let home: string
let root: string

const APP_ICONS = resolve(import.meta.dirname, '../../web/public')
const ICON_SIZES = [16, 32, 48]

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'lichtrinh-home-'))
  root = mkdtempSync(join(tmpdir(), 'lichtrinh-checkout-'))
  mkdirSync(join(root, '.git'))
  mkdirSync(join(root, 'web/public'), { recursive: true })
  for (const size of ICON_SIZES) {
    const name = `icon-${size}x${size}.png`
    cpSync(join(APP_ICONS, name), join(root, 'web/public', name))
  }
})
afterEach(() => {
  rmSync(home, { recursive: true })
  rmSync(root, { recursive: true })
})

const TOOLS: Record<string, string> = {
  bun: '/home/owner/.bun/bin/bun',
  uv: '/home/owner/.local/bin/uv',
  node: '/opt/node/bin/node',
}

interface Fakes {
  exitCode?: (command: string) => number
  tools?: Record<string, string>
  distro?: string | undefined
}

function fakeRunner(fakes: Fakes = {}) {
  const tasks: Task[] = []
  const out: string[] = []
  const context: ProgramContext = {
    io: {
      stdout: (text) => out.push(text),
      stderr: (text) => out.push(text),
      cwd: root,
    },
    findCheckout: () => ({ root, fallback: false }),
    runTask: async (task) => {
      tasks.push(task)
      return fakes.exitCode?.(task.command.join(' ')) ?? 0
    },
    machine: {
      home,
      runtimeDir: '/run/user/1000',
      distro: 'distro' in fakes ? fakes.distro : 'Ubuntu-24.04',
      find: (tool) => (fakes.tools ?? TOOLS)[tool],
    },
  }
  return {
    context,
    commands: () => tasks.map((task) => task.command.join(' ')),
    output: () => out.join(''),
  }
}

const unitFolder = () => join(home, '.config/systemd/user')

describe('lichtrinh panel install', () => {
  it('writes the five units, reloads systemd, and writes the shortcut', async () => {
    const run = fakeRunner()

    const exitCode = await runCli(['panel', 'install'], run.context)

    expect(exitCode).toBe(0)
    expect(readdirSync(unitFolder())).toEqual([
      'lichtrinh-bridge-staging.service',
      'lichtrinh-bridge.service',
      'lichtrinh-panel.service',
      'lichtrinh-voice.service',
      'lichtrinh.target',
    ])
    const [reload, shortcut] = run.commands()
    expect(run.commands()).toHaveLength(2)
    expect(reload).toBe('systemctl --user daemon-reload')
    expect(shortcut).toMatch(/^powershell\.exe .* -EncodedCommand \S+$/)
  })

  it('points every unit at the checkout and at each tool folder', async () => {
    await runCli(['panel', 'install'], fakeRunner().context)

    const voice = readFileSync(
      join(unitFolder(), 'lichtrinh-voice.service'),
      'utf8',
    )
    expect(voice).toContain(`WorkingDirectory=${root}\n`)
    expect(voice).toContain(
      'PATH=/home/owner/.bun/bin:/home/owner/.local/bin:/opt/node/bin:',
    )
  })

  it('enables and starts nothing', async () => {
    const run = fakeRunner()

    await runCli(['panel', 'install'], run.context)

    expect(run.commands().join('\n')).not.toMatch(/ (enable|start|restart) /)
  })

  it('refuses a linked worktree', async () => {
    rmSync(join(root, '.git'), { recursive: true })
    writeFileSync(
      join(root, '.git'),
      'gitdir: /work/lichtrinh/.git/worktrees/x',
    )
    const run = fakeRunner()

    const exitCode = await runCli(['panel', 'install'], run.context)

    expect(exitCode).toBe(1)
    expect(run.output()).toContain('linked worktree')
    expect(run.commands()).toEqual([])
    expect(existsSync(unitFolder())).toBe(false)
  })

  it('refuses one host in both settings files, printing no secret', async () => {
    mkdirSync(join(home, '.config/lichtrinh'), { recursive: true })
    for (const name of ['bridge.env', 'bridge-staging.env']) {
      writeFileSync(
        join(home, '.config/lichtrinh', name),
        'export LICHTRINH_URL=https://app.invalid\nexport BRIDGE_SECRET=invented-secret\n',
      )
    }
    const run = fakeRunner()

    const exitCode = await runCli(['panel', 'install'], run.context)

    expect(exitCode).toBe(1)
    expect(run.output()).toContain('app.invalid')
    expect(run.output()).not.toContain('invented-secret')
    expect(run.commands()).toEqual([])
    expect(existsSync(unitFolder())).toBe(false)
  })

  it('refuses a missing tool by name', async () => {
    const run = fakeRunner({ tools: { bun: '/opt/bun' } })

    const exitCode = await runCli(['panel', 'install'], run.context)

    expect(exitCode).toBe(1)
    expect(run.output()).toContain('uv and node not found')
    expect(run.commands()).toEqual([])
  })

  it("gives the shortcut the app's icon at each size it ships", async () => {
    const run = fakeRunner()

    await runCli(['panel', 'install'], run.context)

    const script = Buffer.from(
      run.commands()[1]?.split(' ').at(-1) ?? '',
      'base64',
    ).toString('utf16le')
    const icon = Buffer.from(
      /FromBase64String\('([^']+)'\)/.exec(script)?.[1] ?? '',
      'base64',
    )
    expect(icon.readUInt16LE(4)).toBe(3)
    expect([icon[6], icon[22], icon[38]]).toEqual([16, 32, 48])
  })

  it('refuses a checkout missing an icon, writing nothing', async () => {
    rmSync(join(root, 'web/public/icon-32x32.png'))
    const run = fakeRunner()

    const exitCode = await runCli(['panel', 'install'], run.context)

    expect(exitCode).toBe(1)
    expect(run.output()).toContain('icon-32x32.png')
    expect(run.commands()).toEqual([])
    expect(existsSync(unitFolder())).toBe(false)
  })

  it('refuses outside WSL', async () => {
    const run = fakeRunner({ distro: undefined })

    expect(await runCli(['panel', 'install'], run.context)).toBe(1)
    expect(run.commands()).toEqual([])
  })

  it('refuses a distribution name the launcher would split, writing nothing', async () => {
    const run = fakeRunner({ distro: 'My "Distro"' })

    const exitCode = await runCli(['panel', 'install'], run.context)

    expect(exitCode).toBe(1)
    expect(run.output()).toContain('My "Distro"')
    expect(run.commands()).toEqual([])
    expect(existsSync(unitFolder())).toBe(false)
  })

  it('writes no shortcut over units systemd refused to read', async () => {
    const run = fakeRunner({ exitCode: () => 4 })

    const exitCode = await runCli(['panel', 'install'], run.context)

    expect(exitCode).toBe(4)
    expect(run.commands()).toEqual(['systemctl --user daemon-reload'])
  })

  it('says nothing is ready when the shortcut fails', async () => {
    const run = fakeRunner({
      exitCode: (command) => (command.startsWith('powershell') ? 3 : 0),
    })

    const exitCode = await runCli(['panel', 'install'], run.context)

    expect(exitCode).toBe(3)
    expect(run.output()).not.toContain('Double-click')
  })
})

describe('lichtrinh panel open', () => {
  const HELD =
    'flock --nonblock --conflict-exit-code 0 /run/user/1000/lichtrinh-panel.lock'

  it('starts the panel and the target, shows the window, then holds', async () => {
    const run = fakeRunner()

    const exitCode = await runCli(['panel', 'open'], run.context)

    expect(exitCode).toBe(0)
    expect(run.commands()).toEqual([
      'systemctl --user reset-failed lichtrinh-panel.service',
      'systemctl --user start lichtrinh-panel.service',
      `${HELD} systemctl --user start lichtrinh.target`,
      `flock /run/user/1000/lichtrinh-panel-window.lock powershell.exe -NoProfile -ExecutionPolicy Bypass -File \\\\wsl.localhost\\Ubuntu-24.04${root.replaceAll('/', '\\')}\\cli\\panel\\open-window.ps1 -Url http://127.0.0.1:4180 -Title Lichtrinh owner panel`,
      `${HELD} bash cli/panel/hold.sh lichtrinh-panel.service`,
    ])
  })

  it('shows no window over a panel that did not start', async () => {
    const run = fakeRunner({ exitCode: () => 1 })

    const exitCode = await runCli(['panel', 'open'], run.context)

    expect(exitCode).toBe(1)
    expect(run.commands()).toEqual([
      'systemctl --user reset-failed lichtrinh-panel.service',
      'systemctl --user start lichtrinh-panel.service',
    ])
  })

  it('opens and exits as done where systemd has no limit to clear', async () => {
    const run = fakeRunner({
      exitCode: (command) => (command.includes('reset-failed') ? 1 : 0),
    })

    const exitCode = await runCli(['panel', 'open'], run.context)

    expect(exitCode).toBe(0)
    expect(run.commands()).toHaveLength(5)
  })

  it('still shows the panel and holds when the target fails, and exits with its code', async () => {
    const run = fakeRunner({
      exitCode: (command) => (command.endsWith('lichtrinh.target') ? 5 : 0),
    })

    const exitCode = await runCli(['panel', 'open'], run.context)

    expect(exitCode).toBe(5)
    expect(run.commands()).toHaveLength(5)
  })

  it.skipIf(spawnSync('flock', ['--version']).status !== 0)(
    'ends as done, with nothing run, while another open holds the lock',
    async () => {
      const run = fakeRunner()
      await runCli(['panel', 'open'], run.context)
      const [, , held] = run.commands()
      const flags = held.split(' ').slice(1, 4)
      const lock = join(home, 'held.lock')

      // The outer one holds the lock while the inner one asks for it.
      const second = spawnSync(
        'flock',
        [lock, 'flock', ...flags, lock, 'echo', 'started twice'],
        { encoding: 'utf8' },
      )

      expect(second).toMatchObject({ status: 0, stdout: '' })
    },
  )

  it('looks for the window by the title the page gives it', () => {
    const page = readFileSync(
      join(import.meta.dirname, '../../panel/ui/index.html'),
      'utf8',
    )

    expect(page).toContain(`<title>${PANEL_TITLE}</title>`)
  })
})

describe('lichtrinh panel down', () => {
  it('stops all five units, which ends the hold', async () => {
    const run = fakeRunner()

    await runCli(['panel', 'down'], run.context)

    expect(run.commands()).toEqual([
      'systemctl --user stop lichtrinh.target lichtrinh-voice.service lichtrinh-bridge.service lichtrinh-bridge-staging.service lichtrinh-panel.service',
    ])
  })

  it('exits with the code of its task', async () => {
    const run = fakeRunner({ exitCode: () => 5 })

    expect(await runCli(['panel', 'down'], run.context)).toBe(5)
  })
})
