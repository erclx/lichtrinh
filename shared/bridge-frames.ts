import { z } from 'zod'

import { assistantModel } from './assistant.ts'

// The relay and the workspace PC's bridge deploy apart, so the bridge opens
// with this version and the relay closes a socket speaking another. A change
// a running bridge would misread raises it.
export const BRIDGE_PROTOCOL = 1

/** The close code the relay sends a bridge speaking another protocol. */
export const PROTOCOL_MISMATCH = 4000

/** The close code an older bridge gets when a newer one connects. */
export const REPLACED = 4001

const turnId = z.string().min(1)

export const turnMessage = z.strictObject({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
})
export type TurnMessage = z.infer<typeof turnMessage>

/** Frames the relay sends down to the bridge. */
export const downFrame = z.discriminatedUnion('type', [
  // Answers a hello in the relay's protocol, so the bridge knows it is online.
  z.strictObject({ type: z.literal('ready') }),
  z.strictObject({
    type: z.literal('turn'),
    turnId,
    model: assistantModel,
    messages: z.array(turnMessage),
  }),
  z.strictObject({
    type: z.literal('tool_result'),
    turnId,
    callId: z.string(),
    result: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({ type: z.literal('cancel'), turnId }),
  z.strictObject({ type: z.literal('warm'), model: assistantModel }),
])
export type DownFrame = z.infer<typeof downFrame>

/** Why the bridge gave up on a turn. */
export const failReason = z.enum([
  'model_error',
  'step_cap',
  'timeout',
  'cancelled',
  'empty_reply',
])
export type FailReason = z.infer<typeof failReason>

/** Frames the bridge sends up to the relay. */
export const upFrame = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('hello'), protocol: z.number().int() }),
  z.strictObject({ type: z.literal('delta'), turnId, text: z.string() }),
  z.strictObject({
    type: z.literal('tool_call'),
    turnId,
    callId: z.string().min(1),
    name: z.string(),
    arguments: z.unknown(),
  }),
  z.strictObject({ type: z.literal('final'), turnId, text: z.string() }),
  z.strictObject({ type: z.literal('failed'), turnId, reason: failReason }),
])
export type UpFrame = z.infer<typeof upFrame>

/** A frame read off the socket, or undefined for one that fails the shape. */
export function readFrame<S extends z.ZodType>(
  schema: S,
  data: string | ArrayBuffer,
): z.output<S> | undefined {
  if (typeof data !== 'string') return undefined
  let raw: unknown
  try {
    raw = JSON.parse(data)
  } catch {
    return undefined
  }
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : undefined
}
