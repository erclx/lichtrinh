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
