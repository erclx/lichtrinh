import { describe, expect, it } from 'vitest'

import { readConfig } from './config.ts'

describe('readConfig', () => {
  it('stands on this machine with nothing set', () => {
    expect(readConfig({})).toEqual({
      port: 4180,
      ollamaUrl: 'http://127.0.0.1:11434',
      voiceUrl: 'http://127.0.0.1:8770',
    })
  })

  it('takes an address on this machine as its origin alone', () => {
    const config = readConfig({ VOICE_URL: 'http://localhost:9000/health' })

    expect(config.voiceUrl).toBe('http://localhost:9000')
  })

  it.each([
    ['OLLAMA_URL', 'http://ollama.invalid:11434'],
    ['VOICE_URL', 'http://10.0.0.2:8770'],
  ])('refuses %s off this machine', (name, value) => {
    expect(() => readConfig({ [name]: value })).toThrow(
      `${name} must point at this machine`,
    )
  })

  it.each(['0', '70000', 'abc', '41.5'])('refuses the port %s', (port) => {
    expect(() => readConfig({ PANEL_PORT: port })).toThrow('PANEL_PORT')
  })
})
