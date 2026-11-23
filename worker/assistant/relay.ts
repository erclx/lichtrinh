import type { AssistantModel } from '@shared/assistant.ts'
import type { DownFrame } from '@shared/bridge-frames.ts'
import {
  BRIDGE_PROTOCOL,
  PROTOCOL_MISMATCH,
  readFrame,
  REPLACED,
  upFrame,
} from '@shared/bridge-frames.ts'
import { DurableObject } from 'cloudflare:workers'

import { logOutcome } from '../log.ts'

// The bridge pings every 20 seconds, so a socket silent for three pings is
// treated as gone even before the runtime notices.
const SILENT_AFTER_MS = 60_000

interface Attachment {
  // Set once the bridge said hello in this protocol.
  readyAt: number | null
}

/** The one relay instance, since one workspace PC serves the whole app. */
export function relayOf(env: Env) {
  return env.ASSISTANT_RELAY.get(env.ASSISTANT_RELAY.idFromName('relay'))
}

/**
 * Holds the socket the workspace PC's bridge dials out on. It accepts the
 * socket through the hibernation API, so an idle connection costs nothing,
 * and the runtime answers the bridge's pings without waking it.
 */
export class AssistantRelay extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    )
  }

  override async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/connect') return this.acceptBridge()
    return new Response(null, { status: 404 })
  }

  /** Whether a bridge holds a live socket now. */
  online(): boolean {
    return this.liveSocket() !== undefined
  }

  /** Asks the bridge to load a model ahead of a turn. False when offline. */
  warm(model: AssistantModel): boolean {
    const socket = this.liveSocket()
    if (socket === undefined) return false
    send(socket, { type: 'warm', model })
    return true
  }

  override webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    const frame = readFrame(upFrame, data)
    if (frame === undefined) {
      logOutcome('bridge_frame_dropped')
      return
    }
    if (frame.type === 'hello') {
      if (frame.protocol !== BRIDGE_PROTOCOL) {
        logOutcome('bridge_protocol_mismatch')
        ws.close(PROTOCOL_MISMATCH, `Relay speaks protocol ${BRIDGE_PROTOCOL}`)
        return
      }
      ws.serializeAttachment({ readyAt: Date.now() } satisfies Attachment)
      send(ws, { type: 'ready' })
      logOutcome('bridge_ready')
    }
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string) {
    logOutcome('bridge_closed')
    // A hibernatable socket completes the closing handshake by hand. The
    // codes below carry no close frame to echo.
    if (ws.readyState === WebSocket.CLOSED) return
    if ([1005, 1006, 1015].includes(code)) ws.close()
    else ws.close(code, reason)
  }

  override webSocketError() {
    logOutcome('bridge_errored')
  }

  private acceptBridge(): Response {
    for (const older of this.ctx.getWebSockets()) {
      older.close(REPLACED, 'A newer bridge connected')
    }
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ readyAt: null } satisfies Attachment)
    logOutcome('bridge_connected')
    return new Response(null, { status: 101, webSocket: client })
  }

  private liveSocket(): WebSocket | undefined {
    const now = Date.now()
    return this.ctx.getWebSockets().find((ws) => {
      if (ws.readyState !== WebSocket.OPEN) return false
      const { readyAt } = ws.deserializeAttachment() as Attachment
      if (readyAt === null) return false
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime()
      return now - Math.max(readyAt, pinged ?? 0) < SILENT_AFTER_MS
    })
  }
}

function send(ws: WebSocket, frame: DownFrame) {
  ws.send(JSON.stringify(frame))
}
