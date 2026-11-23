/**
 * Stand-ins for the browser's recorder and microphone, which jsdom lacks.
 * The recorder hands back one chunk on stop, as a real one flushes.
 */
export class FakeMediaRecorder {
  static supported = new Set(['audio/webm;codecs=opus', 'audio/mp4'])
  static last: FakeMediaRecorder | null = null

  static isTypeSupported(mime: string) {
    return FakeMediaRecorder.supported.has(mime)
  }

  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  readonly options: { mimeType: string; audioBitsPerSecond: number }

  constructor(
    _stream: unknown,
    options: { mimeType: string; audioBitsPerSecond: number },
  ) {
    this.options = options
    FakeMediaRecorder.last = this
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob([new Uint8Array([7, 7])]) })
      this.onstop?.()
    })
  }
}

export interface FakeTrack {
  stopped: boolean
  stop: () => void
}

export function aFakeStream(): { stream: MediaStream; track: FakeTrack } {
  const track: FakeTrack = {
    stopped: false,
    stop() {
      track.stopped = true
    },
  }
  const stream = { getTracks: () => [track] } as unknown as MediaStream
  return { stream, track }
}

export function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}
