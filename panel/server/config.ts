import { PANEL_PORT } from '../services.ts'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Where the family's app answers, and the secret its owner route takes. */
export interface AppLink {
  url: string
  secret: string
}

export interface PanelConfig {
  port: number
  ollamaUrl: string
  voiceUrl: string
  /** Null where neither is set, so the panel runs without Messages. */
  app: AppLink | null
}

/**
 * The panel's settings. Throws on a bad port, a service address off this
 * machine, an app address in plain http off it, or half of the app's pair.
 */
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
    app: appLink(env.LICHTRINH_URL, env.PANEL_SECRET),
  }
}

function appLink(
  url: string | undefined,
  secret: string | undefined,
): AppLink | null {
  if (!url && !secret) return null
  if (!url || !secret) {
    throw new Error('Set LICHTRINH_URL and PANEL_SECRET together')
  }
  const parsed = new URL(url)
  // The secret rides every read, so it crosses no network in the clear.
  if (parsed.protocol !== 'https:' && !LOOPBACK.has(parsed.hostname)) {
    throw new Error('LICHTRINH_URL must use https off this machine')
  }
  return { url: parsed.origin, secret }
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
