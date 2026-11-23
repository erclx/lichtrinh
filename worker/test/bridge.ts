import type { DownFrame, UpFrame } from '@shared/bridge-frames.ts'
import { BRIDGE_PROTOCOL, downFrame, readFrame } from '@shared/bridge-frames.ts'
import { env } from 'cloudflare:workers'

import { app } from '../app.ts'

export const TEST_BRIDGE_SECRET = 'test-bridge-secret'

/** Asks for the bridge socket the way the workspace PC does. */
export function requestBridgeSocket(authorization?: string) {
  const headers: Record<string, string> = { upgrade: 'websocket' }
  if (authorization !== undefined) headers.authorization = authorization
  return app.request('/api/bridge/connect', { headers }, env)
}

interface Closed {
  code: number
  reason: string
}

/**
 * A scripted stand-in for the bridge on the workspace PC, holding a real
 * socket into the relay. Frames the relay sends queue until a case reads
 * them with `next()`.
 */
export interface FakeBridge {
  send: (frame: UpFrame) => void
  next: () => Promise<DownFrame>
  close: () => Promise<Closed>
  closed: Promise<Closed>
}

/**
 * Opens the bridge socket and says hello. Waits for the relay's `ready` by
 * default, so a case starts with the bridge online.
 */
export async function connectBridge(
  options: { protocol?: number; awaitReady?: boolean } = {},
): Promise<FakeBridge> {
  const res = await requestBridgeSocket(`Bearer ${TEST_BRIDGE_SECRET}`)
  const ws = res.webSocket
  if (ws === null) throw new Error(`Bridge connect answered ${res.status}`)
  const queued: DownFrame[] = []
  const waiting: ((frame: DownFrame) => void)[] = []
  let markClosed: (closed: Closed) => void = () => {}
  const closed = new Promise<Closed>((resolve) => {
    markClosed = resolve
  })
  ws.addEventListener('message', (event) => {
    const frame = readFrame(downFrame, event.data)
    if (frame === undefined) throw new Error('The relay sent a bad frame')
    const reader = waiting.shift()
    if (reader === undefined) queued.push(frame)
    else reader(frame)
  })
  ws.addEventListener('close', (event) => {
    markClosed({ code: event.code, reason: event.reason })
  })
  ws.accept()
  const bridge: FakeBridge = {
    send: (frame) => ws.send(JSON.stringify(frame)),
    next: () => {
      const frame = queued.shift()
      if (frame !== undefined) return Promise.resolve(frame)
      return new Promise((resolve) => waiting.push(resolve))
    },
    close: () => {
      ws.close(1000, 'done')
      return closed
    },
    closed,
  }
  bridge.send({ type: 'hello', protocol: options.protocol ?? BRIDGE_PROTOCOL })
  if (options.awaitReady ?? true) {
    const first = await bridge.next()
    if (first.type !== 'ready')
      throw new Error(`Expected ready, got ${first.type}`)
  }
  return bridge
}
