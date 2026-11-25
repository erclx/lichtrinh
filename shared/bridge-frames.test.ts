import { describe, expect, it } from 'vitest'

import { downFrame, readFrame, upFrame } from './bridge-frames.ts'

describe('readFrame', () => {
  it('parses a frame that fits the schema', () => {
    const frame = readFrame(upFrame, '{"type":"hello","protocol":1}')

    expect(frame).toEqual({ type: 'hello', protocol: 1 })
  })

  it('drops text that is not JSON', () => {
    expect(readFrame(upFrame, 'hello')).toBeUndefined()
  })

  it('drops a binary frame', () => {
    expect(readFrame(upFrame, new ArrayBuffer(4))).toBeUndefined()
  })

  it('drops a frame of a type the protocol lacks', () => {
    const frame = readFrame(upFrame, '{"type":"exec","command":"ls"}')

    expect(frame).toBeUndefined()
  })
})

const CLIP_ID = '0b9c6a52-4f0c-4b8e-9d2a-6f1e3c7a5b10'

describe('the voice frames', () => {
  it('reads a hello from a bridge that forwards clips', () => {
    const frame = readFrame(
      upFrame,
      '{"type":"hello","protocol":1,"voice":true}',
    )

    expect(frame).toEqual({ type: 'hello', protocol: 1, voice: true })
  })

  it('carries a clip down as base64', () => {
    const transcribe = {
      type: 'transcribe',
      transcriptionId: CLIP_ID,
      model: 'qwen3-asr-1.7b',
      contentType: 'audio/webm',
      audio: 'aW52ZW50ZWQ=',
    }

    expect(readFrame(downFrame, JSON.stringify(transcribe))).toEqual(transcribe)
  })

  it('drops a clip that is not base64', () => {
    const frame = readFrame(
      downFrame,
      JSON.stringify({
        type: 'transcribe',
        transcriptionId: CLIP_ID,
        model: 'qwen3-asr-1.7b',
        contentType: 'audio/webm',
        audio: 'not base64!',
      }),
    )

    expect(frame).toBeUndefined()
  })

  it('drops a warm for a model the voice server does not offer', () => {
    const frame = readFrame(
      downFrame,
      JSON.stringify({ type: 'voice_warm', model: 'invented-model' }),
    )

    expect(frame).toBeUndefined()
  })
})

const LIVE_ID = `invented-user.${CLIP_ID}`

describe('the live frames', () => {
  const piece = {
    type: 'live',
    liveId: LIVE_ID,
    model: 'qwen3-asr-1.7b',
    language: 'vi',
    contentType: 'audio/webm',
    from: 4096,
    audio: 'aW52ZW50ZWQ=',
  }

  it('carries a piece down with the byte it starts at', () => {
    expect(readFrame(downFrame, JSON.stringify(piece))).toEqual(piece)
  })

  it.each([
    { type: 'live_ready' },
    { type: 'live_text', liveId: LIVE_ID, text: 'Invented words', heard: 8192 },
    { type: 'live_failed', liveId: LIVE_ID },
  ])('carries $type up', (frame) => {
    expect(readFrame(upFrame, JSON.stringify(frame))).toEqual(frame)
  })

  it('drops a live id that would change the path it rides', () => {
    const frame = JSON.stringify({ ...piece, liveId: '../health' })

    expect(readFrame(downFrame, frame)).toBeUndefined()
  })

  it('drops a piece in a language no account speaks', () => {
    const frame = JSON.stringify({ ...piece, language: 'xx' })

    expect(readFrame(downFrame, frame)).toBeUndefined()
  })
})

describe('a transcribe across two ages of bridge', () => {
  const clip = {
    type: 'transcribe',
    transcriptionId: CLIP_ID,
    model: 'qwen3-asr-1.7b',
    contentType: 'audio/webm',
    audio: 'aW52ZW50ZWQ=',
  }

  it('reads one from a relay older than the language', () => {
    expect(readFrame(downFrame, JSON.stringify(clip))).toEqual(clip)
  })

  it('reads one naming the language', () => {
    const named = { ...clip, language: 'vi' }

    expect(readFrame(downFrame, JSON.stringify(named))).toEqual(named)
  })
})
