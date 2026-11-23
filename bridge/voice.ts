// Forwards clips to the voice server on this machine and watches its health.
// A clip lives in memory for one request and is never written to disk, and
// no log line here carries its bytes or its text.
import type {
  ClipFailReason,
  DownFrame,
  UpFrame,
} from '@shared/bridge-frames.ts'
import type { VoiceModel } from '@shared/voice.ts'
import { z } from 'zod'

// Matches the relay's wait, so a hung server frees the request with it.
const CLIP_TIMEOUT_MS = 60_000

const HEALTH_TIMEOUT_MS = 5_000

/** How often the bridge reads the voice server's health. */
export const HEALTH_EVERY_MS = 20_000

type Transcribe = Extract<DownFrame, { type: 'transcribe' }>
type ClipAnswer = Extract<UpFrame, { type: 'transcript' | 'transcribe_failed' }>

// The voice server's answer, `TranscriptionResponse` in `voice/src/voice/server.py`.
const serverAnswer = z.strictObject({
  text: z.string(),
  model: z.string(),
  duration_seconds: z.number().nonnegative(),
  timings: z.strictObject({
    decode_seconds: z.number(),
    load_seconds: z.number(),
    transcribe_seconds: z.number(),
  }),
})

const EXTENSION = { 'audio/webm': 'webm', 'audio/mp4': 'm4a' } as const

/**
 * Posts a clip to the voice server and answers its text. A server that
 * cannot be reached or says its model is not answering reads as
 * `unavailable`, and a clip it refuses or fails as `failed`.
 */
export async function transcribe(
  voiceUrl: string,
  frame: Transcribe,
): Promise<ClipAnswer> {
  const failed = (reason: ClipFailReason): ClipAnswer => ({
    type: 'transcribe_failed',
    transcriptionId: frame.transcriptionId,
    reason,
  })
  const form = new FormData()
  form.set('model', frame.model)
  form.set(
    'file',
    new Blob([Buffer.from(frame.audio, 'base64')], { type: frame.contentType }),
    `clip.${EXTENSION[frame.contentType]}`,
  )
  let res: Response
  try {
    res = await fetch(new URL('/v1/audio/transcriptions', voiceUrl), {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(CLIP_TIMEOUT_MS),
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return failed(timedOut ? 'failed' : 'unavailable')
  }
  if (res.status === 503) return failed('unavailable')
  if (!res.ok) return failed('failed')
  const parsed = serverAnswer.safeParse(await res.json().catch(() => null))
  if (!parsed.success) return failed('failed')
  return {
    type: 'transcript',
    transcriptionId: frame.transcriptionId,
    text: parsed.data.text,
    audioMs: Math.round(parsed.data.duration_seconds * 1000),
  }
}

/** Asks the voice server to load a model ahead of a clip. */
export async function warmVoice(voiceUrl: string, model: VoiceModel) {
  const res = await fetch(new URL('/v1/warm', voiceUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model }),
  })
  if (!res.ok) throw new Error(`Voice warm answered ${res.status}`)
}

/** Whether the voice server answers its health check now. */
export async function voiceHealthy(voiceUrl: string): Promise<boolean> {
  try {
    const res = await fetch(new URL('/health', voiceUrl), {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

export interface VoiceWatch {
  /** Reads health now, saying it when it changed since the last read. */
  check: () => Promise<void>
  /** Forgets the last read, so the next check says it to a new socket. */
  reset: () => void
  stop: () => void
}

/**
 * Reads the voice server's health on a timer and says it only on a change,
 * so the relay hears about a server going down or coming back.
 */
export function watchVoice(
  healthy: () => Promise<boolean>,
  say: (online: boolean) => void,
  everyMs = HEALTH_EVERY_MS,
): VoiceWatch {
  let last: boolean | undefined
  const check = async () => {
    const online = await healthy()
    if (online === last) return
    last = online
    say(online)
  }
  const timer = setInterval(() => void check(), everyMs)
  return {
    check,
    reset: () => {
      last = undefined
    },
    stop: () => clearInterval(timer),
  }
}
