/** Where the owner keeps the bridge's settings, outside the repository. */
export const ENV_FILE = '~/.config/lichtrinh/bridge.env'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

export interface BridgeConfig {
  /** The relay's socket address, `wss:` except on this machine. */
  connectUrl: string
  secret: string
  ollamaUrl: string
  /** The voice server, which listens on this machine alone. */
  voiceUrl: string
}

/**
 * The bridge's settings from the environment. Throws on a missing setting,
 * a remote app over plain `http:`, or an Ollama off this machine.
 */
export function readConfig(
  env: Record<string, string | undefined>,
): BridgeConfig {
  const missing = ['LICHTRINH_URL', 'BRIDGE_SECRET'].filter(
    (name) => (env[name] ?? '') === '',
  )
  if (missing.length > 0) {
    throw new Error(`Set ${missing.join(' and ')} in ${ENV_FILE}`)
  }
  const app = new URL(env.LICHTRINH_URL ?? '')
  if (app.protocol === 'http:' && !LOOPBACK.has(app.hostname)) {
    throw new Error('LICHTRINH_URL must use https outside this machine')
  }
  const connect = new URL('/api/bridge/connect', app)
  connect.protocol = app.protocol === 'https:' ? 'wss:' : 'ws:'
  return {
    connectUrl: connect.toString(),
    secret: env.BRIDGE_SECRET ?? '',
    ollamaUrl: readOllamaUrl(env),
    voiceUrl: onThisMachine(
      'VOICE_URL',
      env.VOICE_URL,
      'http://127.0.0.1:8770',
    ),
  }
}

/** Ollama's address, which has to be this machine. */
export function readOllamaUrl(env: Record<string, string | undefined>) {
  return onThisMachine('OLLAMA_URL', env.OLLAMA_URL, 'http://127.0.0.1:11434')
}

// Ollama and the voice server hear prompts and clips, so neither may sit
// on another machine.
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
