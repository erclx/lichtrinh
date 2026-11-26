import { describe, expect, it } from 'vitest'

import { readConfig } from './config.ts'

describe('readConfig', () => {
  it('stands on this machine with nothing set', () => {
    expect(readConfig({})).toEqual({
      port: 4180,
      ollamaUrl: 'http://127.0.0.1:11434',
      voiceUrl: 'http://127.0.0.1:8770',
      app: null,
    })
  })

  it('links the app at its origin with its secret', () => {
    const config = readConfig({
      LICHTRINH_URL: 'https://lichtrinh.example.com/today',
      PANEL_SECRET: 'invented-panel-secret',
    })

    expect(config.app).toEqual({
      url: 'https://lichtrinh.example.com',
      secret: 'invented-panel-secret',
    })
  })

  it('takes plain http for an app on this machine', () => {
    const config = readConfig({
      LICHTRINH_URL: 'http://127.0.0.1:5173',
      PANEL_SECRET: 'invented-panel-secret',
    })

    expect(config.app?.url).toBe('http://127.0.0.1:5173')
  })

  it('refuses plain http for an app off this machine', () => {
    expect(() =>
      readConfig({
        LICHTRINH_URL: 'http://lichtrinh.example.com',
        PANEL_SECRET: 'invented-panel-secret',
      }),
    ).toThrow('LICHTRINH_URL must use https off this machine')
  })

  it.each([
    ['the address alone', { LICHTRINH_URL: 'https://lichtrinh.example.com' }],
    ['the secret alone', { PANEL_SECRET: 'invented-panel-secret' }],
  ])('refuses %s', (_, env) => {
    expect(() => readConfig(env)).toThrow(
      'Set LICHTRINH_URL and PANEL_SECRET together',
    )
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
