import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { Command } from 'commander'

import {
  PANEL_PORT,
  PANEL_TITLE,
  PANEL_UNIT,
  TARGET,
} from '../../panel/services'
import { isLinkedWorktree, type PanelMachine } from '../panel/machine'
import { sharedHost } from '../panel/settings-files'
import { shortcutCommand } from '../panel/shortcut'
import { renderUnits, UNITS } from '../panel/units'
import type { CliIo, RunInCheckout } from '../program'

const TOOLS = ['bun', 'uv', 'node'] as const

const systemctl = (...args: string[]) => ['systemctl', '--user', ...args]

/** The owner's panel and the units behind it, on the workspace PC. */
export function registerPanel(
  program: Command,
  run: RunInCheckout,
  io: CliIo,
  root: () => string,
  machine: PanelMachine,
): void {
  const panel = program
    .command('panel')
    .description('Start and watch voice and the bridge on the workspace PC')

  panel
    .command('install')
    .description('Write the systemd units and the Windows desktop shortcut')
    .action(async (_options: unknown, command: Command) => {
      const checkout = root()
      if (isLinkedWorktree(checkout)) {
        command.error(
          `error: ${checkout} is a linked worktree, and the units would outlive it. Install from the main checkout.`,
        )
      }
      const host = sharedHost(machine.home)
      if (host !== undefined) {
        command.error(
          `error: bridge.env and bridge-staging.env both name ${host}, and two bridges on one host replace each other without end. Give each its own LICHTRINH_URL.`,
        )
      }
      const { distro } = machine
      if (distro === undefined) {
        command.error(
          'error: the shortcut opens WSL, so install from inside it',
        )
      }
      const found = TOOLS.map((tool) => ({ tool, path: machine.find(tool) }))
      const paths = found.flatMap(({ path }) => path ?? [])
      const [bun] = paths
      if (bun === undefined || paths.length < found.length) {
        const missing = found.filter(({ path }) => path === undefined)
        command.error(
          `error: ${missing.map(({ tool }) => tool).join(' and ')} not found, and the units need each by its folder`,
        )
      }

      writeUnits(
        machine,
        renderUnits({ root: checkout, toolFolders: paths.map(dirname) }),
      )
      if ((await run(systemctl('daemon-reload'))) !== 0) return
      const shortcut = shortcutCommand({ distro, root: checkout, bun })
      if ((await run(shortcut)) !== 0) return
      io.stdout('Double-click Lichtrinh on the desktop to start the panel.\n')
    })

  panel
    .command('open')
    .description('Start everything, show the panel, and keep this PC awake')
    .action(async () => {
      const lock = join(machine.runtimeDir, 'lichtrinh-panel.lock')
      // Runs while nothing holds the lock, and otherwise ends at once as done.
      const unlessHeld = (command: string[]) => [
        'flock',
        '--nonblock',
        '--conflict-exit-code',
        '0',
        lock,
        ...command,
      ]
      if ((await run(systemctl('start', PANEL_UNIT))) !== 0) return
      // A later open starts nothing the owner stopped.
      await run(unlessHeld(systemctl('start', TARGET)))
      await run(windowCommand(machine, root()))
      await run(unlessHeld(['bash', 'cli/panel/hold.sh', PANEL_UNIT]))
    })

  panel
    .command('down')
    .description('Stop the panel, voice, and both bridges')
    .action(async () => {
      await run(systemctl('stop', ...UNITS))
    })
}

function writeUnits(
  { home }: PanelMachine,
  units: Record<string, string>,
): void {
  const folder = join(home, '.config/systemd/user')
  mkdirSync(folder, { recursive: true })
  for (const [name, text] of Object.entries(units)) {
    writeFileSync(join(folder, name), text)
  }
}

/** Windows reads the script out of the distribution by its network path. */
function windowCommand({ distro }: PanelMachine, root: string): string[] {
  const script = join(root, 'cli/panel/open-window.ps1')
  return [
    'powershell.exe',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    `\\\\wsl.localhost\\${distro ?? ''}${script.replaceAll('/', '\\')}`,
    '-Url',
    `http://localhost:${PANEL_PORT}`,
    '-Title',
    PANEL_TITLE,
  ]
}
