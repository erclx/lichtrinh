import type { DownFrame, UpFrame } from '@shared/bridge-frames.ts'
import { BRIDGE_PROTOCOL, downFrame, readFrame } from '@shared/bridge-frames.ts'
import { env } from 'cloudflare:workers'
import { expect, vi } from 'vitest'

import { app } from '../app.ts'
import { relayOf } from '../assistant/relay.ts'

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
  options: { protocol?: number; awaitReady?: boolean; voice?: boolean } = {},
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
  bridge.send({
    type: 'hello',
    protocol: options.protocol ?? BRIDGE_PROTOCOL,
    ...(options.voice === true ? { voice: true as const } : {}),
  })
  if (options.awaitReady ?? true) {
    const first = await bridge.next()
    if (first.type !== 'ready')
      throw new Error(`Expected ready, got ${first.type}`)
  }
  return bridge
}

/**
 * Says the voice server's health, then waits until the relay has read it,
 * since the socket and a request reach the relay apart.
 */
export async function sayVoice(bridge: FakeBridge, online: boolean) {
  bridge.send({ type: 'voice_status', online })
  await vi.waitFor(async () => {
    expect(await relayOf(env).voiceOnline()).toBe(online)
  })
}

/**
 * A bridge online whose voice server answers, and which answers live pieces
 * unless the case asks for one older than them.
 */
export async function connectVoiceBridge({ live = true } = {}) {
  const bridge = await connectBridge({ voice: true })
  // Ahead of the voice status, so the wait below covers both.
  if (live) bridge.send({ type: 'live_ready' })
  await sayVoice(bridge, true)
  return bridge
}

type Transcribe = Extract<DownFrame, { type: 'transcribe' }>

type ClipAnswer =
  | { text: string; audioMs: number }
  | { failed: 'unavailable' | 'failed' }

/** Reads the next frame, which has to be a clip, and answers it. */
export async function answerClip(
  bridge: FakeBridge,
  answer: ClipAnswer,
): Promise<Transcribe> {
  const frame = await bridge.next()
  if (frame.type !== 'transcribe') {
    throw new Error(`Expected transcribe, got ${frame.type}`)
  }
  bridge.send(
    'failed' in answer
      ? {
          type: 'transcribe_failed',
          transcriptionId: frame.transcriptionId,
          reason: answer.failed,
        }
      : {
          type: 'transcript',
          transcriptionId: frame.transcriptionId,
          ...answer,
        },
  )
  return frame
}

type Live = Extract<DownFrame, { type: 'live' }>

/** Reads the next frame, which has to be a live piece, and answers it. */
export async function answerLive(
  bridge: FakeBridge,
  answer: { text: string; heard: number } | 'failed',
): Promise<Live> {
  const frame = await bridge.next()
  if (frame.type !== 'live') throw new Error(`Expected live, got ${frame.type}`)
  const { liveId } = frame
  bridge.send(
    answer === 'failed'
      ? { type: 'live_failed', liveId }
      : { type: 'live_text', liveId, ...answer },
  )
  return frame
}
