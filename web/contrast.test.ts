import { readFileSync } from 'node:fs'
import path from 'node:path'

// The record's color rules, read off the stylesheet that holds the values.
const css = readFileSync(path.join(import.meta.dirname, 'index.css'), 'utf8')

function themeBlock(selector: string) {
  const start = css.indexOf(`${selector} {`)
  const end = css.indexOf('}', start)
  return css.slice(start, end)
}

function token(block: string, name: string) {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`).exec(block)
  if (!match) throw new Error(`--${name} is not a six-digit hex here`)
  return match[1]
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((at) => {
    const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function ratio(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe.each([
  { theme: 'light', selector: ':root' },
  { theme: 'dark', selector: ":root[data-theme='dark']" },
])('the $theme set', ({ selector }) => {
  const block = themeBlock(selector)

  it('holds muted text at 7:1 on the ground', () => {
    expect(
      ratio(token(block, 'muted-foreground'), token(block, 'background')),
    ).toBeGreaterThanOrEqual(7)
  })

  it('holds muted text above 4.5:1 on the muted fill', () => {
    expect(
      ratio(token(block, 'muted-foreground'), token(block, 'muted')),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('holds body text at 7:1 on the ground', () => {
    expect(
      ratio(token(block, 'foreground'), token(block, 'background')),
    ).toBeGreaterThanOrEqual(7)
  })

  it('holds body text above 4.5:1 on the muted fill', () => {
    expect(
      ratio(token(block, 'foreground'), token(block, 'muted')),
    ).toBeGreaterThanOrEqual(4.5)
  })
})
