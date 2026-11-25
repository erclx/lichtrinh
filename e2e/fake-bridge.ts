import type { DownFrame, UpFrame } from '@shared/bridge-frames.ts'
import { BRIDGE_PROTOCOL, downFrame, readFrame } from '@shared/bridge-frames.ts'

/**
 * The secret the e2e server runs with, set in `playwright.config.ts`. It is
 * invented and public, and never the developer's `.dev.vars` value.
 */
export const E2E_BRIDGE_SECRET = 'e2e-bridge-secret'

export interface FakeBridge {
  /**
   * Answers the next turn with one `add_entry` call and a reply, the way the
   * workspace PC's model would.
   */
  answerWithAdd: (args: Record<string, unknown>, reply: string) => Promise<void>
  /** Answers the next turn with a reply and no change. */
  answerWithReply: (reply: string) => Promise<void>
  /**
   * Answers the next clip with `text` after `delayMs`, the way the voice
   * server would, so the transcribing line has time to show.
   */
  answerClip: (text: string, delayMs: number) => Promise<void>
  /** Answers the next live piece with the words so far. */
  answerLive: (text: string) => Promise<void>
  /** Reports the voice server's health, as the bridge does when it changes. */
  setVoice: (online: boolean) => void
  close: () => Promise<void>
}

interface FakeBridgeOptions {
  /** Says hello as a bridge forwarding clips and live pieces, its voice server up. */
  voice?: boolean
}

/**
 * Dials the dev Worker's relay as the workspace PC does, says hello, and
 * waits for `ready`, so a test starts with the assistant online.
 */
export async function connectFakeBridge(
  baseURL: string,
  { voice = false }: FakeBridgeOptions = {},
): Promise<FakeBridge> {
  const url = new URL('/api/bridge/connect', baseURL)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  // Node takes headers here, which the DOM typing reads as subprotocols.
  const options = { headers: { authorization: `Bearer ${E2E_BRIDGE_SECRET}` } }
  const ws = new WebSocket(url, options as unknown as string[])
  const queued: DownFrame[] = []
  const waiting: ((frame: DownFrame) => void)[] = []
  const closed = new Promise<void>((resolve) => {
    ws.addEventListener('close', () => resolve())
  })

  ws.addEventListener('message', (event) => {
    const frame = readFrame(downFrame, event.data)
    if (frame === undefined) return
    const reader = waiting.shift()
    if (reader === undefined) queued.push(frame)
    else reader(frame)
  })

  const send = (frame: UpFrame) => ws.send(JSON.stringify(frame))
  const next = (): Promise<DownFrame> => {
    const frame = queued.shift()
    if (frame !== undefined) return Promise.resolve(frame)
    return new Promise((resolve) => waiting.push(resolve))
  }
  async function nextOf<T extends DownFrame['type']>(type: T) {
    for (;;) {
      const frame = await next()
      if (frame.type === type) return frame as Extract<DownFrame, { type: T }>
    }
  }

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve())
    ws.addEventListener('error', () =>
      reject(
        new Error(
          'The relay refused the fake bridge. A BRIDGE_SECRET in .dev.vars overrides the e2e value, so run from a checkout without one.',
        ),
      ),
    )
  })
  send(
    voice
      ? { type: 'hello', protocol: BRIDGE_PROTOCOL, voice: true }
      : { type: 'hello', protocol: BRIDGE_PROTOCOL },
  )
  await nextOf('ready')
  if (voice) {
    send({ type: 'live_ready' })
    send({ type: 'voice_status', online: true })
  }

  return {
    answerWithAdd: async (args, reply) => {
      const { turnId } = await nextOf('turn')
      send({
        type: 'tool_call',
        turnId,
        callId: 'call-add',
        name: 'add_entry',
        arguments: args,
      })
      const result = await nextOf('tool_result')
      if (result.result.ok !== true) {
        throw new Error('The relay refused the scripted add')
      }
      send({ type: 'delta', turnId, text: reply })
      send({ type: 'final', turnId, text: reply, heldRemoval: false })
    },
    answerWithReply: async (reply) => {
      const { turnId } = await nextOf('turn')
      send({ type: 'delta', turnId, text: reply })
      send({ type: 'final', turnId, text: reply, heldRemoval: false })
    },
    answerClip: async (text, delayMs) => {
      const { transcriptionId } = await nextOf('transcribe')
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      send({ type: 'transcript', transcriptionId, text, audioMs: 2100 })
    },
    answerLive: async (text) => {
      const { liveId, from, audio } = await nextOf('live')
      const heard = from + Buffer.from(audio, 'base64').length
      send({ type: 'live_text', liveId, text, heard })
    },
    setVoice: (online) => send({ type: 'voice_status', online }),
    close: () => {
      ws.close(1000, 'done')
      return closed
    },
  }
}
