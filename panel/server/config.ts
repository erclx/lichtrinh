import { PANEL_PORT } from '../services.ts'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

export interface PanelConfig {
  port: number
  ollamaUrl: string
  voiceUrl: string
}

/** The panel's settings. Throws on a bad port or an address off this machine. */
export function readConfig(
  env: Record<string, string | undefined>,
): PanelConfig {
  const port = Number(env.PANEL_PORT || PANEL_PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PANEL_PORT must be a port number')
  }
  return {
    port,
    ollamaUrl: onThisMachine(
      'OLLAMA_URL',
      env.OLLAMA_URL,
      'http://127.0.0.1:11434',
    ),
    voiceUrl: onThisMachine(
      'VOICE_URL',
      env.VOICE_URL,
      'http://127.0.0.1:8770',
    ),
  }
}

function onThisMachine(
  name: string,
  value: string | undefined,
  fallback: string,
) {
  const url = new URL(value || fallback)
  if (!LOOPBACK.has(url.hostname)) {
    throw new Error(`${name} must point at this machine`)
  }
  return url.origin
}
