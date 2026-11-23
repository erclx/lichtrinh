import type { AssistantModel } from '@shared/assistant.ts'
import type { DownFrame, TurnMessage, UpFrame } from '@shared/bridge-frames.ts'
import {
  BRIDGE_PROTOCOL,
  PROTOCOL_MISMATCH,
  readFrame,
  REPLACED,
  upFrame,
} from '@shared/bridge-frames.ts'
import type { ChatEvent, ChatMessage, MessageStatus } from '@shared/chats.ts'
import { DurableObject } from 'cloudflare:workers'

import { createDb } from '../db/client.ts'
import { refusalResponse } from '../envelope.ts'
import { logOutcome } from '../log.ts'
import { saveReply, saveUserMessage } from './chats.ts'
import { runTool } from './tools.ts'

// The bridge pings every 20 seconds, so a socket silent for three pings is
// treated as gone even before the runtime notices.
const SILENT_AFTER_MS = 60_000

// The backstop behind the bridge's own turn timeout, so a turn whose bridge
// went quiet still ends and frees the relay.
const TURN_TIMEOUT_MS = 120_000

interface Attachment {
  // Set once the bridge said hello in this protocol.
  readyAt: number | null
}

/** What the send route hands the relay for one turn, read fresh from D1. */
export interface TurnInput {
  chatId: string
  ownerId: string
  tripId: string
  messageId: string
  text: string
  model: AssistantModel
  messages: TurnMessage[]
  // Each listed entry's version as the prompt showed it.
  versions: Record<string, number>
}

type TurnEnd =
  | { kind: 'final'; text: string }
  | { kind: 'failed' }
  | { kind: 'closed' }
  | { kind: 'stopped' }
  | { kind: 'timeout' }

interface OpenTurn {
  input: TurnInput
  socket: WebSocket
  stream: ReadableStreamDefaultController<Uint8Array>
  text: string
  changeIds: string[]
  versions: Map<string, number>
  // Frames run one at a time in arrival order, so a close arriving while a
  // tool write is under way waits for that write and saves its change.
  queue: Promise<void>
  ended: boolean
  startedAt: number
  timer?: ReturnType<typeof setTimeout>
}

const encoder = new TextEncoder()

/** The one relay instance, since one workspace PC serves the whole app. */
export function relayOf(env: Env) {
  return env.ASSISTANT_RELAY.get(env.ASSISTANT_RELAY.idFromName('relay'))
}

/**
 * Holds the bridge's hibernatable socket, idle at no cost with pings answered
 * by the runtime, and the one open turn, whose response keeps it in memory.
 */
export class AssistantRelay extends DurableObject<Env> {
  private turn: OpenTurn | undefined

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    )
  }

  override async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/connect') return this.acceptBridge()
    if (pathname === '/turn' && request.method === 'POST') {
      return this.startTurn(await request.json())
    }
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
      return
    }
    const turn = this.turn
    if (turn?.socket !== ws || frame.turnId !== turn.input.messageId) return
    this.enqueue(turn, () => this.receive(turn, frame))
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string) {
    logOutcome('bridge_closed')
    const turn = this.turn
    if (turn?.socket === ws) {
      this.enqueue(turn, () => this.finish(turn, { kind: 'closed' }))
    }
    // A hibernatable socket echoes the close by hand, bar codes with no frame.
    if (ws.readyState === WebSocket.CLOSED) return
    if ([1005, 1006, 1015].includes(code)) ws.close()
    else ws.close(code, reason)
  }

  override webSocketError(ws: WebSocket) {
    logOutcome('bridge_errored')
    const turn = this.turn
    if (turn?.socket === ws) {
      this.enqueue(turn, () => this.finish(turn, { kind: 'closed' }))
    }
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

  // The turn is claimed before the first await, so a second send arriving
  // while the message saves already reads busy.
  private async startTurn(input: TurnInput): Promise<Response> {
    if (this.turn !== undefined) return refusalResponse('assistant_busy')
    const socket = this.liveSocket()
    if (socket === undefined) return refusalResponse('assistant_unavailable')
    let stream: ReadableStreamDefaultController<Uint8Array> | undefined
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        stream = controller
      },
      cancel: () =>
        this.enqueue(turn, () => this.finish(turn, { kind: 'stopped' })),
    })
    if (stream === undefined) throw new Error('The stream did not start')
    const turn: OpenTurn = {
      input,
      socket,
      stream,
      text: '',
      changeIds: [],
      versions: new Map(Object.entries(input.versions)),
      queue: Promise.resolve(),
      ended: false,
      startedAt: Date.now(),
    }
    this.turn = turn
    await saveUserMessage(
      createDb(this.env.DB),
      { id: input.messageId, chatId: input.chatId, text: input.text },
      new Date(),
    )
    send(socket, {
      type: 'turn',
      turnId: input.messageId,
      model: input.model,
      messages: input.messages,
    })
    turn.timer = setTimeout(
      () => this.enqueue(turn, () => this.finish(turn, { kind: 'timeout' })),
      TURN_TIMEOUT_MS,
    )
    logOutcome('turn_started', {
      chatId: input.chatId,
      messageId: input.messageId,
      model: input.model,
    })
    return new Response(body, {
      headers: { 'content-type': 'application/x-ndjson' },
    })
  }

  private enqueue(turn: OpenTurn, task: () => Promise<void>) {
    turn.queue = turn.queue
      .then(() => (turn.ended ? undefined : task()))
      .catch(async (error: unknown) => {
        logOutcome('turn_errored', { messageId: turn.input.messageId })
        if (error instanceof Error) console.error(error.name)
        if (!turn.ended) await this.finish(turn, { kind: 'failed' })
      })
  }

  private async receive(
    turn: OpenTurn,
    frame: Exclude<UpFrame, { type: 'hello' }>,
  ) {
    if (frame.type === 'delta') {
      turn.text += frame.text
      emit(turn, { type: 'delta', text: frame.text })
      return
    }
    if (frame.type === 'tool_call') {
      const outcome = await runTool(
        {
          db: createDb(this.env.DB),
          ownerId: turn.input.ownerId,
          tripId: turn.input.tripId,
          versions: turn.versions,
          at: new Date(),
        },
        frame.name,
        frame.arguments,
      )
      if (outcome.step !== undefined) {
        emit(turn, { type: 'step', step: outcome.step })
      }
      if (outcome.changeId !== undefined) {
        turn.changeIds.push(outcome.changeId)
        emit(turn, { type: 'change', changeId: outcome.changeId })
      }
      send(turn.socket, {
        type: 'tool_result',
        turnId: frame.turnId,
        callId: frame.callId,
        result: outcome.result,
      })
      return
    }
    if (frame.type === 'final') {
      await this.finish(turn, { kind: 'final', text: frame.text })
      return
    }
    await this.finish(turn, { kind: 'failed' })
  }

  /**
   * Saves the reply with every change the turn made and ends the stream.
   * A reply with no text and no change is a failure, never a blank answer.
   */
  private async finish(turn: OpenTurn, end: TurnEnd) {
    turn.ended = true
    if (turn.timer !== undefined) clearTimeout(turn.timer)
    const { input } = turn
    const text = end.kind === 'final' ? end.text : turn.text
    const answered =
      end.kind === 'final' && (text.trim() !== '' || turn.changeIds.length > 0)
    const status: MessageStatus = answered
      ? 'complete'
      : end.kind === 'stopped'
        ? 'stopped'
        : 'failed'
    try {
      const message = await saveReply(
        createDb(this.env.DB),
        {
          chatId: input.chatId,
          replyTo: input.messageId,
          text,
          status,
          model: input.model,
          changeIds: turn.changeIds,
        },
        new Date(),
      )
      if (end.kind !== 'stopped') closeWith(turn, endEvent(end, message, turn))
    } finally {
      if (end.kind === 'stopped' || end.kind === 'timeout') {
        sendIfOpen(turn.socket, { type: 'cancel', turnId: input.messageId })
      }
      if (this.turn === turn) this.turn = undefined
      logOutcome(`turn_${status}`, {
        chatId: input.chatId,
        messageId: input.messageId,
        model: input.model,
        changes: turn.changeIds.length,
        ms: Date.now() - turn.startedAt,
      })
    }
  }
}

function endEvent(
  end: TurnEnd,
  message: ChatMessage,
  turn: OpenTurn,
): ChatEvent {
  if (message.status === 'complete') return { type: 'done', message }
  return {
    type: 'error',
    code: end.kind === 'closed' ? 'assistant_unavailable' : 'assistant_failed',
    changed: turn.changeIds.length > 0,
    message,
  }
}

// The reader may have gone, which only means nobody hears the rest.
function emit(turn: OpenTurn, event: ChatEvent) {
  try {
    turn.stream.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
  } catch {
    // The stream was cancelled, and its cancel ends the turn.
  }
}

function closeWith(turn: OpenTurn, event: ChatEvent) {
  emit(turn, event)
  try {
    turn.stream.close()
  } catch {
    // Already cancelled.
  }
}

function send(ws: WebSocket, frame: DownFrame) {
  ws.send(JSON.stringify(frame))
}

function sendIfOpen(ws: WebSocket, frame: DownFrame) {
  if (ws.readyState === WebSocket.OPEN) send(ws, frame)
}
