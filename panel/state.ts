import { assistantModel } from '@shared/assistant.ts'
import { z } from 'zod'

import { SERVICE_IDS } from './services.ts'

export const serviceId = z.enum(SERVICE_IDS)

export const serviceStatus = z.enum([
  'up',
  'starting',
  'stopping',
  'failed',
  'stopped',
])
export type ServiceStatus = z.infer<typeof serviceStatus>

/**
 * Why a service reads as it does, where the status alone does not say.
 * `exited` is a process that ended, `not_answering` one that runs and cannot
 * be reached, and `elsewhere` a service up outside its unit.
 */
export const serviceCause = z.enum([
  'exited',
  'not_answering',
  'load_failed',
  'elsewhere',
])
export type ServiceCause = z.infer<typeof serviceCause>

/** One log line, with the event it opens on where it names one. */
export const logLine = z.strictObject({
  at: z.iso.datetime(),
  event: z.string().nullable(),
  text: z.string(),
})
export type LogLine = z.infer<typeof logLine>

export const serviceState = z.strictObject({
  id: serviceId,
  status: serviceStatus,
  cause: serviceCause.nullable(),
  /** When the status began, where a tool reports it. */
  since: z.iso.datetime().nullable(),
  /** Restarts systemd made before it gave up, 0 outside a failure. */
  restarts: z.int().nonnegative(),
  /** When the model leaves the card, null for a service that is not one. */
  freesAt: z.iso.datetime().nullable(),
  /** Newest first, at most five. */
  logs: z.array(logLine),
})
export type ServiceState = z.infer<typeof serviceState>

export const gpuState = z.strictObject({
  totalMiB: z.int().positive(),
  usedMiB: z.int().nonnegative(),
  models: z.array(
    z.strictObject({ alias: assistantModel, vramMiB: z.number() }),
  ),
})
export type GpuState = z.infer<typeof gpuState>

/** What the status server answers and the page parses. */
export const panelState = z.strictObject({
  readAt: z.iso.datetime(),
  /** In the tiles' order, one per service. */
  services: z.array(serviceState),
  /** Null when the card cannot be read. */
  gpu: gpuState.nullable(),
})
export type PanelState = z.infer<typeof panelState>

export const serviceAction = z.enum([
  'start',
  'stop',
  'restart',
  'load',
  'unload',
])
export type ServiceAction = z.infer<typeof serviceAction>

export const allAction = z.enum(['start', 'stop'])
export type AllAction = z.infer<typeof allAction>

export const actionDone = z.strictObject({ ok: z.literal(true) })

export const panelErrorCode = z.enum([
  'not_found',
  'forbidden',
  'action_failed',
  'internal_error',
])
export type PanelErrorCode = z.infer<typeof panelErrorCode>

/** Every failure, in the shape of `shared/errors.ts` with the panel's codes. */
export const panelError = z.strictObject({
  error: z.strictObject({ code: panelErrorCode, message: z.string() }),
})
export type PanelError = z.infer<typeof panelError>
