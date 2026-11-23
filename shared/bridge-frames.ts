import { z } from 'zod'

import { assistantModel } from './assistant.ts'
import { clipType, MAX_CLIP_BYTES, voiceModel } from './voice.ts'

// The relay and the workspace PC's bridge deploy apart, so the bridge opens
// with this version and the relay closes a socket speaking another. A change
// a running bridge would misread raises it.
export const BRIDGE_PROTOCOL = 1

/** The close code the relay sends a bridge speaking another protocol. */
export const PROTOCOL_MISMATCH = 4000

/** The close code an older bridge gets when a newer one connects. */
export const REPLACED = 4001

const turnId = z.string().min(1)
const transcriptionId = z.uuid()

// A frame is JSON text, so a clip rides it as base64.
const MAX_CLIP_BASE64 = Math.ceil(MAX_CLIP_BYTES / 3) * 4

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
    // The reply before this message was the guard holding several removals
    // for a yes, so this turn may remove them.
    removalAsked: z.boolean(),
  }),
  z.strictObject({
    type: z.literal('tool_result'),
    turnId,
    callId: z.string(),
    result: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({ type: z.literal('cancel'), turnId }),
  z.strictObject({ type: z.literal('warm'), model: assistantModel }),
  // Sent only to a bridge whose hello said `voice`, so an older bridge never
  // reads a frame it cannot parse.
  z.strictObject({
    type: z.literal('transcribe'),
    transcriptionId,
    model: voiceModel,
    contentType: clipType,
    audio: z.base64().max(MAX_CLIP_BASE64),
  }),
  z.strictObject({ type: z.literal('voice_warm'), model: voiceModel }),
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

/**
 * Why a clip came back without text. `unavailable` means the voice server
 * did not answer, so the app shows voice off rather than an error.
 */
export const clipFailReason = z.enum(['unavailable', 'failed'])
export type ClipFailReason = z.infer<typeof clipFailReason>

/** Frames the bridge sends up to the relay. */
export const upFrame = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('hello'),
    protocol: z.number().int(),
    // The bridge forwards clips to the voice server on the workspace PC.
    voice: z.literal(true).optional(),
  }),
  z.strictObject({ type: z.literal('delta'), turnId, text: z.string() }),
  z.strictObject({
    type: z.literal('tool_call'),
    turnId,
    callId: z.string().min(1),
    name: z.string(),
    arguments: z.unknown(),
  }),
  z.strictObject({
    type: z.literal('final'),
    turnId,
    text: z.string(),
    // The guard refused removals this turn, so the reply asks for a yes.
    heldRemoval: z.boolean(),
  }),
  z.strictObject({ type: z.literal('failed'), turnId, reason: failReason }),
  z.strictObject({
    type: z.literal('transcript'),
    transcriptionId,
    text: z.string(),
    audioMs: z.int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal('transcribe_failed'),
    transcriptionId,
    reason: clipFailReason,
  }),
  // Sent when the voice server's health changes, and once after each ready.
  z.strictObject({ type: z.literal('voice_status'), online: z.boolean() }),
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
