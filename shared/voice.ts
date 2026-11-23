import { z } from 'zod'

// Read by the talk button and the admin page, so every field added here is
// optional and none is renamed once it ships.

/**
 * The speech models the workspace PC's voice server offers, in the order a
 * picker shows them. The ids match the server's own list.
 */
export const voiceModel = z.enum([
  'qwen3-asr-1.7b',
  'whisper-large-v3-turbo',
  'phowhisper-large',
])
export type VoiceModel = z.infer<typeof voiceModel>

export const DEFAULT_VOICE_MODEL: VoiceModel = 'qwen3-asr-1.7b'

/** What the browser records, being webm on Chrome and mp4 on Safari. */
export const clipType = z.enum(['audio/webm', 'audio/mp4'])
export type ClipType = z.infer<typeof clipType>

export const MAX_CLIP_SECONDS = 60

// A 60 second clip in either type runs well under this.
export const MAX_CLIP_BYTES = 2 * 1024 * 1024

/**
 * A clip's text, under the id the client sent it with. `audioMs` is the
 * clip's length and `ms` how long the workspace PC took to answer. Empty
 * text means the clip held no speech.
 */
export const transcription = z.strictObject({
  id: z.uuid(),
  text: z.string(),
  model: voiceModel,
  audioMs: z.int().nonnegative(),
  ms: z.int().nonnegative(),
})
export type Transcription = z.infer<typeof transcription>

/** The speech model every clip runs on, which the admin sets. */
export const voiceSettings = z.strictObject({ model: voiceModel })
export type VoiceSettings = z.infer<typeof voiceSettings>

/**
 * How one model did in use. `clips` counts the clips it transcribed and
 * `sent` those sent as a message, and `meanEditRatio` runs from 0 when the
 * traveler sent its text untouched to 1 when they rewrote it, or is null
 * before the first send.
 */
export const voiceUsage = z.strictObject({
  model: voiceModel,
  clips: z.int().nonnegative(),
  sent: z.int().nonnegative(),
  meanEditRatio: z.number().min(0).max(1).nullable(),
})
export type VoiceUsage = z.infer<typeof voiceUsage>

/** The admin page's read, with a usage row per model in the offered order. */
export const voiceAdmin = z.strictObject({
  model: voiceModel,
  usage: z.array(voiceUsage),
})
export type VoiceAdmin = z.infer<typeof voiceAdmin>

/**
 * Whether a clip can be transcribed now. `online` means the bridge holds a
 * live socket and its voice server last answered its health check.
 */
export const voiceStatus = z.strictObject({
  online: z.boolean(),
  model: voiceModel,
})
export type VoiceStatus = z.infer<typeof voiceStatus>

/**
 * Rides a send whose text started as a clip's transcript. The browser holds
 * both strings, so it measures the edit and the Worker stores no text.
 */
export const voiceSend = z.strictObject({
  transcriptionId: z.uuid(),
  editRatio: z.number().min(0).max(1),
})
export type VoiceSend = z.infer<typeof voiceSend>
