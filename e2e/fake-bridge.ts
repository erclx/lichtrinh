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
  close: () => Promise<void>
}

/**
 * Dials the dev Worker's relay as the workspace PC does, says hello, and
 * waits for `ready`, so a test starts with the assistant online.
 */
export async function connectFakeBridge(baseURL: string): Promise<FakeBridge> {
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
  send({ type: 'hello', protocol: BRIDGE_PROTOCOL })
  await nextOf('ready')

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
    close: () => {
      ws.close(1000, 'done')
      return closed
    },
  }
}
