/** Beside the dev servers' ports, with none of their worktree offset. */
export const PANEL_PORT = 4180

export const TARGET = 'lichtrinh.target'
export const PANEL_UNIT = 'lichtrinh-panel.service'

export const SERVICE_IDS = ['voice', 'model', 'bridge', 'staging'] as const
export type ServiceId = (typeof SERVICE_IDS)[number]

export interface Service {
  id: ServiceId
  label: string
  unit: string
  /** A system unit is read for its log alone, since stopping one takes sudo. */
  manager: 'user' | 'system'
  /** Whether the target holds it, so Start all starts it. */
  inTarget: boolean
  /** Whether the verdict counts it. */
  counted: boolean
}

/** Every service the panel shows, in the order its tiles take. */
export const SERVICES: readonly Service[] = [
  {
    id: 'voice',
    label: 'Voice',
    unit: 'lichtrinh-voice.service',
    manager: 'user',
    inTarget: true,
    counted: true,
  },
  {
    id: 'model',
    label: 'Local model',
    unit: 'ollama.service',
    manager: 'system',
    inTarget: false,
    counted: true,
  },
  {
    id: 'bridge',
    label: 'Bridge',
    unit: 'lichtrinh-bridge.service',
    manager: 'user',
    inTarget: true,
    counted: true,
  },
  {
    id: 'staging',
    label: 'Staging',
    unit: 'lichtrinh-bridge-staging.service',
    manager: 'user',
    inTarget: false,
    counted: false,
  },
]

export function serviceOf(id: ServiceId): Service {
  const found = SERVICES.find((service) => service.id === id)
  if (found === undefined) throw new Error(`No service is named ${id}`)
  return found
}
