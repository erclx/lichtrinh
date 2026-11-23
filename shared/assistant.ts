import { z } from 'zod'

/**
 * The local model aliases the workspace PC serves, each made from a
 * Modelfile under `bridge/models/`. They share a prefix so a later panel can
 * filter the workspace PC's models down to these.
 */
export const assistantModel = z.enum([
  'lichtrinh-assistant',
  'lichtrinh-assistant-gemma',
])
export type AssistantModel = z.infer<typeof assistantModel>

export const DEFAULT_ASSISTANT_MODEL: AssistantModel = 'lichtrinh-assistant'

/**
 * Whether the assistant can answer now. `online` means the workspace PC's
 * bridge holds a live socket, and `lastAnsweredAt` is the last reply it
 * finished, or null before the first.
 */
export const assistantStatus = z.strictObject({
  online: z.boolean(),
  lastAnsweredAt: z.iso.datetime().nullable(),
  model: assistantModel,
})
export type AssistantStatus = z.infer<typeof assistantStatus>
