import { describe, expect, it } from 'vitest'

import { readConfig } from './config.ts'

describe('readConfig', () => {
  it('turns the app address into its secure socket address', () => {
    const config = readConfig({
      LICHTRINH_URL: 'https://calendar.invented.example',
      BRIDGE_SECRET: 'secret',
    })

    expect(config).toEqual({
      connectUrl: 'wss://calendar.invented.example/api/bridge/connect',
      secret: 'secret',
      ollamaUrl: 'http://127.0.0.1:11434',
      voiceUrl: 'http://127.0.0.1:8770',
    })
  })

  it('takes plain ws for a dev server on this machine', () => {
    const config = readConfig({
      LICHTRINH_URL: 'http://localhost:5173',
      BRIDGE_SECRET: 'secret',
    })

    expect(config.connectUrl).toBe('ws://localhost:5173/api/bridge/connect')
  })

  it('names every setting that is missing', () => {
    expect(() => readConfig({})).toThrow(
      'Set LICHTRINH_URL and BRIDGE_SECRET in ~/.config/lichtrinh/bridge.env',
    )
  })

  it('refuses a remote app over plain http, which would leak the secret', () => {
    expect(() =>
      readConfig({
        LICHTRINH_URL: 'http://calendar.invented.example',
        BRIDGE_SECRET: 'secret',
      }),
    ).toThrow('https')
  })

  it('refuses an Ollama that is not on this machine', () => {
    expect(() =>
      readConfig({
        LICHTRINH_URL: 'http://localhost:5173',
        BRIDGE_SECRET: 'secret',
        OLLAMA_URL: 'http://192.0.2.10:11434',
      }),
    ).toThrow('this machine')
  })

  it('refuses a voice server that is not on this machine', () => {
    expect(() =>
      readConfig({
        LICHTRINH_URL: 'http://localhost:5173',
        BRIDGE_SECRET: 'secret',
        VOICE_URL: 'http://192.0.2.10:8770',
      }),
    ).toThrow('VOICE_URL must point at this machine')
  })

  it('takes a voice server on another local port', () => {
    const config = readConfig({
      LICHTRINH_URL: 'http://localhost:5173',
      BRIDGE_SECRET: 'secret',
      VOICE_URL: 'http://127.0.0.1:9100',
    })

    expect(config.voiceUrl).toBe('http://127.0.0.1:9100')
  })
})
