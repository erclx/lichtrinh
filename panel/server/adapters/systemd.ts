import type { Run } from '../run.ts'
import { ActionFailed, ReadFailed } from '../run.ts'

export interface UnitState {
  /** systemd's own word, such as `active`, `activating`, or `failed`. */
  active: string
  restarts: number
  /** The run in progress or the last one, null before the first. */
  invocationId: string | null
  activeSince: Date | null
  changedAt: Date | null
}

const ABSENT: UnitState = {
  active: 'inactive',
  restarts: 0,
  invocationId: null,
  activeSince: null,
  changedAt: null,
}

// Longer than systemd's own 90 seconds to stop a unit, so its answer arrives.
const ACTION_TIMEOUT_MS = 100_000

const PROPERTIES = [
  'Id',
  'ActiveState',
  'NRestarts',
  'InvocationID',
  'ActiveEnterTimestamp',
  'StateChangeTimestamp',
]

/** Every unit's state from one read. A unit systemd does not know is inactive. */
export async function showUnits(
  run: Run,
  units: readonly string[],
): Promise<(unit: string) => UnitState> {
  const { code, stdout } = await run([
    'systemctl',
    '--user',
    'show',
    '--timestamp=unix',
    `--property=${PROPERTIES.join(',')}`,
    ...units,
  ])
  // An unknown unit exits 0, so this read nothing rather than nothing running.
  if (code !== 0) throw new ReadFailed(`systemctl show exited ${code}`)
  const states = new Map(stdout.split('\n\n').flatMap(readBlock))
  return (unit) => states.get(unit) ?? ABSENT
}

/**
 * Starts units past the limit systemd gives up at. The target rides along
 * uncleared, since a target never reaches that limit.
 */
export async function startUnits(
  run: Run,
  units: readonly string[],
  target?: string,
) {
  await clearLimit(run, units)
  await act(run, 'start', target === undefined ? units : [target, ...units])
}

export async function restartUnits(run: Run, units: readonly string[]) {
  await clearLimit(run, units)
  await act(run, 'restart', units)
}

export async function stopUnits(run: Run, units: readonly string[]) {
  await act(run, 'stop', units)
}

// Each unit alone, since one systemd has not loaded refuses the whole command
// and has no limit to clear.
async function clearLimit(run: Run, units: readonly string[]) {
  await Promise.all(
    units.map((unit) => run(['systemctl', '--user', 'reset-failed', unit])),
  )
}

async function act(run: Run, verb: string, units: readonly string[]) {
  const { code } = await run(['systemctl', '--user', verb, ...units], {
    timeoutMs: ACTION_TIMEOUT_MS,
  })
  if (code !== 0) throw new ActionFailed(`systemctl ${verb} exited ${code}`)
}

function readBlock(block: string): [string, UnitState][] {
  const values = new Map(
    block.split('\n').map((line): [string, string] => {
      const equals = line.indexOf('=')
      return [line.slice(0, equals), line.slice(equals + 1)]
    }),
  )
  const id = values.get('Id')
  if (id === undefined) return []
  return [
    [
      id,
      {
        active: values.get('ActiveState') ?? ABSENT.active,
        restarts: Number(values.get('NRestarts')) || 0,
        invocationId: values.get('InvocationID') || null,
        activeSince: readTime(values.get('ActiveEnterTimestamp')),
        changedAt: readTime(values.get('StateChangeTimestamp')),
      },
    ],
  ]
}

// Unix seconds behind an @, or empty before the first.
function readTime(value: string | undefined): Date | null {
  const match = /^@(\d+)$/.exec(value ?? '')
  return match === null ? null : new Date(Number(match[1]) * 1000)
}
