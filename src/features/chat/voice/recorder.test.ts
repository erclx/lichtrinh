import { pickFormat, record } from '@/features/chat/voice/recorder'
import { aFakeStream, FakeMediaRecorder, setVisibility } from '@/test/media'

const webm = { mime: 'audio/webm;codecs=opus', type: 'audio/webm' } as const

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
})

afterEach(() => {
  setVisibility('visible')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('pickFormat', () => {
  it('picks webm with Opus where the browser records it', () => {
    expect(pickFormat((mime) => mime.startsWith('audio/'))).toEqual(webm)
  })

  it('falls back to mp4 where webm is absent, as on Safari', () => {
    expect(pickFormat((mime) => mime === 'audio/mp4')).toEqual({
      mime: 'audio/mp4',
      type: 'audio/mp4',
    })
  })

  it('answers null where the browser records neither', () => {
    expect(pickFormat(() => false)).toBeNull()
  })
})

describe('record', () => {
  const quiet = { onCap: () => undefined, onHidden: () => undefined }

  it('records at 32 kbps in the picked format', () => {
    const { stream } = aFakeStream()

    record(stream, webm, quiet)

    expect(FakeMediaRecorder.last?.options).toEqual({
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 32_000,
    })
  })

  it('says once when the first audio arrives, and keeps it in the clip', async () => {
    const { stream } = aFakeStream()
    const onAudio = vi.fn()
    const recording = record(stream, webm, { ...quiet, onAudio })

    await Promise.resolve()
    const clip = await recording.stop()

    expect(onAudio).toHaveBeenCalledOnce()
    expect(clip.size).toBe(3)
  })

  it('closes the microphone on Stop and resolves the clip in its type', async () => {
    const { stream, track } = aFakeStream()
    const recording = record(stream, webm, quiet)

    const clip = await recording.stop()

    expect(track.stopped).toBe(true)
    expect(clip.type).toBe('audio/webm')
    expect(clip.size).toBe(2)
  })

  it('stops itself at the cap and hands the clip over', async () => {
    vi.useFakeTimers()
    const { stream, track } = aFakeStream()
    const onCap = vi.fn<(clip: Promise<Blob>) => void>()
    record(stream, webm, { ...quiet, onCap, maxMs: 60_000 })

    vi.advanceTimersByTime(60_000)

    expect(track.stopped).toBe(true)
    const clip = await onCap.mock.calls[0]?.[0]
    expect(clip?.size).toBe(2)
  })

  it('drops the clip and closes the microphone when the page hides', () => {
    const { stream, track } = aFakeStream()
    const onHidden = vi.fn()
    record(stream, webm, { ...quiet, onHidden })

    setVisibility('hidden')

    expect(track.stopped).toBe(true)
    expect(onHidden).toHaveBeenCalledOnce()
  })

  it('closes the microphone on cancel', () => {
    const { stream, track } = aFakeStream()
    const recording = record(stream, webm, quiet)

    recording.cancel()

    expect(track.stopped).toBe(true)
    expect(FakeMediaRecorder.last?.state).toBe('inactive')
  })
})
