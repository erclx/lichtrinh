import { describe, expect, it } from 'vitest'

import { readFrame, upFrame } from './bridge-frames.ts'

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
