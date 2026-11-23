import type { DownFrame, UpFrame } from '@shared/bridge-frames.ts'
import { BRIDGE_PROTOCOL, downFrame, readFrame } from '@shared/bridge-frames.ts'

import type { BridgeConfig } from './config.ts'

// The relay's runtime answers `ping` without waking it, and a socket silent
// for three pings reads as offline in the app.
const PING_EVERY_MS = 20_000

export interface BridgeSocket {
  send: (frame: UpFrame) => void
  close: () => void
}

interface Handlers {
  onFrame: (frame: DownFrame) => void
  onClose: (code: number, reason: string) => void
}

/**
 * Dials out to the relay with the secret in the `Authorization` header,
 * never in the URL, so it stays out of request logs. It says hello on open
 * and pings until the socket closes.
 */
export function openSocket(
  config: BridgeConfig,
  handlers: Handlers,
): BridgeSocket {
  // Bun takes headers here, which the DOM typing reads as subprotocols.
  const options = { headers: { authorization: `Bearer ${config.secret}` } }
  const ws = new WebSocket(config.connectUrl, options as unknown as string[])
  let ping: ReturnType<typeof setInterval> | undefined
  const send = (frame: UpFrame) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame))
  }
  ws.addEventListener('open', () => {
    send({ type: 'hello', protocol: BRIDGE_PROTOCOL })
    ping = setInterval(() => ws.send('ping'), PING_EVERY_MS)
  })
  ws.addEventListener('message', (event) => {
    // The runtime's `pong` is not a frame and drops here with any other.
    const frame = readFrame(downFrame, event.data)
    if (frame !== undefined) handlers.onFrame(frame)
  })
  ws.addEventListener('close', (event) => {
    clearInterval(ping)
    handlers.onClose(event.code, event.reason)
  })
  return { send, close: () => ws.close(1000, 'Bridge stopping') }
}
