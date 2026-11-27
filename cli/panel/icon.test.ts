import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { icoFromPngs } from './icon'

const png = (size: number) =>
  readFileSync(
    resolve(import.meta.dirname, `../../web/public/icon-${size}x${size}.png`),
  )

describe('icoFromPngs', () => {
  it('heads the file as an icon holding one image per PNG', () => {
    const ico = icoFromPngs([png(16), png(32)])

    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(2)
  })

  it('sizes each entry from its PNG header and points it at the PNG whole', () => {
    const images = [png(16), png(48)]

    const ico = icoFromPngs(images)

    const second = 6 + 16
    expect(ico[second]).toBe(48)
    expect(ico[second + 1]).toBe(48)
    expect(ico.readUInt16LE(second + 6)).toBe(32)
    expect(ico.readUInt32LE(second + 8)).toBe(images[1]?.length)
    const offset = ico.readUInt32LE(second + 12)
    expect(offset).toBe(6 + 2 * 16 + (images[0]?.length ?? 0))
    expect(ico.subarray(offset).equals(images[1] ?? Buffer.alloc(0))).toBe(true)
  })

  it('writes 256 px as the zero the format stands it for', () => {
    const header = Buffer.from(png(16))
    header.writeUInt32BE(256, 16)
    header.writeUInt32BE(256, 20)

    const ico = icoFromPngs([header])

    expect(ico[6]).toBe(0)
    expect(ico[7]).toBe(0)
  })

  it('refuses a file that is not a PNG', () => {
    expect(() => icoFromPngs([Buffer.from('not an image')])).toThrow(/PNG/)
  })

  it('refuses a PNG past the 256 px an icon holds', () => {
    expect(() => icoFromPngs([png(512)])).toThrow(/512/)
  })
})
