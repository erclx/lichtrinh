import { PANEL_UNIT, serviceOf, SERVICES, TARGET } from '../../panel/services'

export interface UnitSettings {
  /** The checkout every unit runs in. */
  root: string
  /** The folders the tools sit in, ahead of the system's own. */
  toolFolders: readonly string[]
}

const VOICE = serviceOf('voice').unit
const BRIDGE = serviceOf('bridge').unit
const STAGING = serviceOf('staging').unit

/** Every unit the panel installs, the target among them. */
export const UNITS: readonly string[] = [
  TARGET,
  VOICE,
  BRIDGE,
  STAGING,
  PANEL_UNIT,
]

// Where the user manager finds nothing on its own, and the card's reader.
const SYSTEM_FOLDERS = [
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/lib/wsl/lib',
]

/**
 * The unit files by name. None carries an install section, so nothing starts
 * at sign-in, and none carries a secret, since a bridge sources its own file.
 */
export function renderUnits(settings: UnitSettings): Record<string, string> {
  const members = SERVICES.filter((service) => service.inTarget)
  return {
    [TARGET]: `[Unit]
Description=Lichtrinh voice and bridge
Wants=${members.map((service) => service.unit).join(' ')}
`,
    [VOICE]: service(settings, {
      description: 'Lichtrinh voice',
      inTarget: true,
      start: '/usr/bin/env bun cli/index.ts voice serve',
    }),
    [BRIDGE]: service(settings, {
      description: 'Lichtrinh bridge',
      inTarget: true,
      start: bridgeFrom('bridge.env'),
    }),
    [STAGING]: service(settings, {
      description: 'Lichtrinh staging bridge',
      inTarget: false,
      start: bridgeFrom('bridge-staging.env'),
    }),
    [PANEL_UNIT]: service(settings, {
      description: 'Lichtrinh owner panel',
      inTarget: false,
      before: '/usr/bin/env bun run panel:build',
      start: '/usr/bin/env bun panel/server/index.ts',
    }),
  }
}

/** The settings files are shell, whose `export` lines systemd ignores. */
function bridgeFrom(file: string) {
  return `/bin/bash -c 'source "%h/.config/lichtrinh/${file}" && exec bun cli/index.ts bridge run'`
}

interface ServiceUnit {
  description: string
  inTarget: boolean
  before?: string
  start: string
}

// Stopping voice ends it on the signal, which its runner reports as 143.
function service(
  { root, toolFolders }: UnitSettings,
  { description, inTarget, before, start }: ServiceUnit,
) {
  const path = [...new Set([...toolFolders, ...SYSTEM_FOLDERS])].join(':')
  return [
    '[Unit]',
    `Description=${description}`,
    ...(inTarget ? [`PartOf=${TARGET}`] : []),
    'StartLimitIntervalSec=300',
    'StartLimitBurst=3',
    '',
    '[Service]',
    'Type=exec',
    `WorkingDirectory=${literal(root)}`,
    `Environment="PATH=${literal(path).replaceAll('"', '\\"')}"`,
    ...(before === undefined ? [] : [`ExecStartPre=${before}`]),
    `ExecStart=${start}`,
    'Restart=on-failure',
    'RestartSec=5',
    'SuccessExitStatus=143',
    '',
  ].join('\n')
}

/** A path as systemd reads it, which expands a percent sign. */
function literal(path: string) {
  return path.replaceAll('%', '%%')
}
