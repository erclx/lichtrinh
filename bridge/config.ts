/** Where the owner keeps the bridge's settings, outside the repository. */
export const ENV_FILE = '~/.config/lichtrinh/bridge.env'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

export interface BridgeConfig {
  /** The relay's socket address, `wss:` except on this machine. */
  connectUrl: string
  secret: string
  ollamaUrl: string
}

/**
 * The bridge's settings, read from the environment the owner's env file
 * sets. Throws naming what is missing or unsafe: a remote app reached over
 * plain `http:`, which would send the secret in the clear, or an Ollama
 * anywhere but this machine.
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
  }
}

/** Ollama's address, which has to be this machine. */
export function readOllamaUrl(env: Record<string, string | undefined>) {
  const ollama = new URL(env.OLLAMA_URL || 'http://127.0.0.1:11434')
  if (!LOOPBACK.has(ollama.hostname)) {
    throw new Error('OLLAMA_URL must point at this machine')
  }
  return ollama.origin
}
