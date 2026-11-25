import { type ClipType, MAX_CLIP_SECONDS } from '@shared/voice.ts'

export interface ClipFormat {
  /** What `MediaRecorder` records, codec included. */
  mime: string
  /** What the clip is sent as, which the API reads. */
  type: ClipType
}

// Chrome and Safari from 18.4 record webm with Opus, and an older Safari
// records mp4 with AAC alone.
const FORMATS: readonly ClipFormat[] = [
  { mime: 'audio/webm;codecs=opus', type: 'audio/webm' },
  { mime: 'audio/mp4', type: 'audio/mp4' },
]

const BITS_PER_SECOND = 32_000

/** The first format this browser records, or null when it records neither. */
export function pickFormat(
  supported: (mime: string) => boolean = (mime) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime),
): ClipFormat | null {
  return FORMATS.find((format) => supported(format.mime)) ?? null
}

/** The traveler refused the microphone, or the browser did for them. */
export class MicDenied extends Error {
  constructor() {
    super('microphone denied')
    this.name = 'MicDenied'
  }
}

/** Opens the microphone, which asks for permission on the first call. */
export async function openMic(): Promise<MediaStream> {
  if (navigator.mediaDevices === undefined) throw new Error('no microphone')
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === 'NotAllowedError' || error.name === 'SecurityError')
    ) {
      throw new MicDenied()
    }
    throw error
  }
}

export interface Recording {
  /** The bytes recorded past an offset, in the clip's type. */
  since: (from: number) => Blob
  /** Ends the clip and closes the microphone, resolving the whole clip. */
  stop: () => Promise<Blob>
  /** Ends the clip and closes the microphone, keeping nothing. */
  cancel: () => void
}

interface RecordOptions {
  /** Called with the clip when the cap stops it. */
  onCap: (clip: Promise<Blob>) => void
  /** Called when the page hides, which drops the clip. */
  onHidden: () => void
  /** Called once, when the first audio arrives, so a Stop sends a clip. */
  onAudio?: () => void
  maxMs?: number
}

// A short slice delivers the first audio a quarter second in.
const SLICE_MS = 250

/**
 * Records `stream` until Stop, the cap, or the page hiding, and closes its
 * tracks on each, so the phone's recording light never stays on. The clip
 * lives in memory alone.
 */
export function record(
  stream: MediaStream,
  format: ClipFormat,
  {
    onCap,
    onHidden,
    onAudio = () => undefined,
    maxMs = MAX_CLIP_SECONDS * 1000,
  }: RecordOptions,
): Recording {
  const recorder = new MediaRecorder(stream, {
    mimeType: format.mime,
    audioBitsPerSecond: BITS_PER_SECOND,
  })
  const chunks: Blob[] = []
  let ended: Promise<Blob> | null = null

  recorder.ondataavailable = (event) => {
    if (event.data.size === 0) return
    chunks.push(event.data)
    if (chunks.length === 1) onAudio()
  }

  function since(from: number): Blob {
    const whole = new Blob(chunks)
    return whole.slice(from, whole.size, format.type)
  }

  function release() {
    clearTimeout(cap)
    document.removeEventListener('visibilitychange', onVisibility)
    for (const track of stream.getTracks()) track.stop()
  }

  function stop(): Promise<Blob> {
    if (ended !== null) return ended
    ended = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: format.type }))
    })
    if (recorder.state !== 'inactive') recorder.stop()
    release()
    return ended
  }

  function cancel() {
    if (ended !== null) return
    ended = Promise.resolve(new Blob([], { type: format.type }))
    recorder.ondataavailable = null
    recorder.onstop = null
    if (recorder.state !== 'inactive') recorder.stop()
    release()
  }

  function onVisibility() {
    if (document.visibilityState !== 'hidden') return
    cancel()
    onHidden()
  }

  const cap = setTimeout(() => onCap(stop()), maxMs)
  document.addEventListener('visibilitychange', onVisibility)
  recorder.start(SLICE_MS)

  return { since, stop, cancel }
}
