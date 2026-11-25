import type { AssistantModel } from '@shared/assistant.ts'
import type { DownFrame, TurnMessage, UpFrame } from '@shared/bridge-frames.ts'
import {
  BRIDGE_PROTOCOL,
  PROTOCOL_MISMATCH,
  readFrame,
  REPLACED,
  SILENT,
  upFrame,
} from '@shared/bridge-frames.ts'
import type { ChatEvent, ChatMessage, MessageStatus } from '@shared/chats.ts'
import type { NoticeKind } from '@shared/notices.ts'
import type { ClipType, SpokenLanguage, VoiceModel } from '@shared/voice.ts'
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

// Covers a cold model load after a reboot and a 60 second clip's inference.
const CLIP_TIMEOUT_MS = 60_000

// Past a live step at its slowest and short of a traveler noticing.
const LIVE_TIMEOUT_MS = 5_000

// Kept on the socket, so it survives the relay hibernating between clips.
interface Attachment {
  // Set once the bridge said hello in this protocol.
  readyAt: number | null
  // The bridge forwards clips, and its voice server last answered.
  voice?: boolean
  voiceOnline?: boolean
  // The bridge answers live pieces and reads a clip's language.
  live?: boolean
}

/** Whether a service answers now, and when it last came up, if ever. */
export interface ServiceState {
  online: boolean
  upAt: number | null
}

/** A clip the voice route hands the relay, held in memory for one request. */
export interface ClipInput {
  id: string
  model: VoiceModel
  language: SpokenLanguage
  contentType: ClipType
  audio: ArrayBuffer
}

/** The bytes of a clip still being spoken, from byte `from`. */
export interface PieceInput extends ClipInput {
  from: number
}

export type PieceEnd =
  | { kind: 'text'; text: string; heard: number }
  | { kind: 'unavailable' }
  | { kind: 'failed' }

export type ClipEnd =
  | { kind: 'text'; text: string; audioMs: number }
  | { kind: 'unavailable' }
  | { kind: 'failed' }

interface PendingClip {
  socket: WebSocket
  done: Promise<ClipEnd>
  resolve: (end: ClipEnd) => void
  timer: ReturnType<typeof setTimeout>
}

interface PendingPiece {
  socket: WebSocket
  resolve: (end: PieceEnd) => void
  timer: ReturnType<typeof setTimeout>
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
  removalAsked: boolean
}

type TurnEnd =
  | { kind: 'final'; text: string; heldRemoval: boolean }
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
 * by the runtime, the one open turn, and any clips waiting beside it, each
 * of whose requests keeps it in memory.
 */
export class AssistantRelay extends DurableObject<Env> {
  private turn: OpenTurn | undefined
  private clips = new Map<string, PendingClip>()
  private pieces = new Map<string, PendingPiece>()
  // Fields rather than the constants, so a spec can shorten a wait.
  clipTimeoutMs = CLIP_TIMEOUT_MS
  liveTimeoutMs = LIVE_TIMEOUT_MS
  silentAfterMs = SILENT_AFTER_MS

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

  /** Whether a clip sent now would reach a voice server that answers. */
  voiceOnline(): boolean {
    return this.voiceSocket() !== undefined
  }

  /**
   * Both services at once. The times are stored, since an outage ends when
   * its service comes up and the socket that said so is gone by the next one.
   */
  services(): Record<NoticeKind, ServiceState> {
    return {
      assistant: { online: this.online(), upAt: this.upAt('assistant') },
      voice: { online: this.voiceOnline(), upAt: this.upAt('voice') },
    }
  }

  /** Asks the bridge to load a speech model ahead of a clip. */
  warmVoice(model: VoiceModel): boolean {
    const socket = this.voiceSocket()
    if (socket === undefined) return false
    send(socket, { type: 'voice_warm', model })
    return true
  }

  /**
   * Sends a clip down to the bridge and waits for its text, never behind the
   * running turn. A retry of a clip still waiting joins that wait rather
   * than sending the clip twice.
   */
  transcribe(clip: ClipInput): Promise<ClipEnd> {
    const waiting = this.clips.get(clip.id)
    if (waiting !== undefined) return waiting.done
    const socket = this.voiceSocket()
    if (socket === undefined) return Promise.resolve({ kind: 'unavailable' })
    let resolve: (end: ClipEnd) => void = () => {}
    const done = new Promise<ClipEnd>((settle) => {
      resolve = settle
    })
    const timer = setTimeout(() => {
      logOutcome('clip_timed_out', { transcriptionId: clip.id })
      this.endClip(clip.id, { kind: 'failed' })
    }, this.clipTimeoutMs)
    this.clips.set(clip.id, { socket, done, resolve, timer })
    send(socket, {
      type: 'transcribe',
      transcriptionId: clip.id,
      model: clip.model,
      contentType: clip.contentType,
      audio: toBase64(new Uint8Array(clip.audio)),
      ...(readsLive(socket) ? { language: clip.language } : {}),
    })
    return done
  }

  /**
   * Sends a live piece down and waits for the words so far, beside the turn
   * and the clips. A retry replaces the piece it retries, since either answer
   * says where the next one starts.
   */
  live(piece: PieceInput): Promise<PieceEnd> {
    const socket = this.voiceSocket()
    if (socket === undefined || !readsLive(socket)) {
      return Promise.resolve({ kind: 'unavailable' })
    }
    this.endPiece(piece.id, { kind: 'failed' })
    const done = new Promise<PieceEnd>((resolve) => {
      const timer = setTimeout(
        () => this.endPiece(piece.id, { kind: 'failed' }),
        this.liveTimeoutMs,
      )
      this.pieces.set(piece.id, { socket, resolve, timer })
    })
    send(socket, {
      type: 'live',
      liveId: piece.id,
      model: piece.model,
      language: piece.language,
      contentType: piece.contentType,
      from: piece.from,
      audio: toBase64(new Uint8Array(piece.audio)),
    })
    return done
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
      ws.serializeAttachment({
        readyAt: Date.now(),
        voice: frame.voice === true,
        voiceOnline: false,
      } satisfies Attachment)
      this.cameUp('assistant')
      send(ws, { type: 'ready' })
      logOutcome('bridge_ready')
      return
    }
    if (frame.type === 'voice_status') {
      const attachment = ws.deserializeAttachment() as Attachment
      if (frame.online && attachment.voiceOnline !== true) this.cameUp('voice')
      ws.serializeAttachment({
        ...attachment,
        voiceOnline: frame.online,
      } satisfies Attachment)
      logOutcome(frame.online ? 'voice_online' : 'voice_offline')
      return
    }
    if (frame.type === 'transcript' || frame.type === 'transcribe_failed') {
      if (this.clips.get(frame.transcriptionId)?.socket !== ws) return
      this.endClip(
        frame.transcriptionId,
        frame.type === 'transcript'
          ? { kind: 'text', text: frame.text, audioMs: frame.audioMs }
          : { kind: frame.reason },
      )
      return
    }
    if (frame.type === 'live_ready') {
      const attachment = ws.deserializeAttachment() as Attachment
      ws.serializeAttachment({ ...attachment, live: true } satisfies Attachment)
      return
    }
    if (frame.type === 'live_text' || frame.type === 'live_failed') {
      if (this.pieces.get(frame.liveId)?.socket !== ws) return
      this.endPiece(
        frame.liveId,
        frame.type === 'live_text'
          ? { kind: 'text', text: frame.text, heard: frame.heard }
          : { kind: 'failed' },
      )
      return
    }
    const turn = this.turn
    if (turn?.socket !== ws || frame.turnId !== turn.input.messageId) return
    this.enqueue(turn, () => this.receive(turn, frame))
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string) {
    logOutcome('bridge_closed')
    this.failAudioOn(ws)
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
    this.failAudioOn(ws)
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

  private upAt(kind: NoticeKind): number | null {
    return this.ctx.storage.kv.get<number>(`up:${kind}`) ?? null
  }

  private cameUp(kind: NoticeKind) {
    this.ctx.storage.kv.put(`up:${kind}`, Date.now())
  }

  // A socket found silent is closed, so a bridge that only slept comes back
  // with a hello and its outage ends.
  private liveSocket(): WebSocket | undefined {
    const now = Date.now()
    return this.ctx.getWebSockets().find((ws) => {
      if (ws.readyState !== WebSocket.OPEN) return false
      const { readyAt } = ws.deserializeAttachment() as Attachment
      if (readyAt === null) return false
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime()
      if (now - Math.max(readyAt, pinged ?? 0) < this.silentAfterMs) return true
      ws.close(SILENT, 'No ping heard')
      logOutcome('bridge_silent')
      return false
    })
  }

  private voiceSocket(): WebSocket | undefined {
    const socket = this.liveSocket()
    if (socket === undefined) return undefined
    const { voice, voiceOnline } = socket.deserializeAttachment() as Attachment
    return voice === true && voiceOnline === true ? socket : undefined
  }

  private endClip(id: string, end: ClipEnd) {
    const clip = this.clips.get(id)
    if (clip === undefined) return
    clearTimeout(clip.timer)
    this.clips.delete(id)
    clip.resolve(end)
  }

  private endPiece(id: string, end: PieceEnd) {
    const piece = this.pieces.get(id)
    if (piece === undefined) return
    clearTimeout(piece.timer)
    this.pieces.delete(id)
    piece.resolve(end)
  }

  // Audio on a socket that went away fails at once, never at the timeout.
  private failAudioOn(ws: WebSocket) {
    for (const [id, clip] of this.clips) {
      if (clip.socket === ws) this.endClip(id, { kind: 'failed' })
    }
    for (const [id, piece] of this.pieces) {
      if (piece.socket === ws) this.endPiece(id, { kind: 'failed' })
    }
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
    try {
      await saveUserMessage(
        createDb(this.env.DB),
        { id: input.messageId, chatId: input.chatId, text: input.text },
        new Date(),
      )
    } catch (error) {
      this.turn = undefined
      stream.error(error)
      throw error
    }
    send(socket, {
      type: 'turn',
      turnId: input.messageId,
      model: input.model,
      messages: input.messages,
      removalAsked: input.removalAsked,
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
      await this.finish(turn, {
        kind: 'final',
        text: frame.text,
        heldRemoval: frame.heldRemoval,
      })
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
          heldRemoval: end.kind === 'final' && end.heldRemoval,
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

function readsLive(ws: WebSocket): boolean {
  return (ws.deserializeAttachment() as Attachment).live === true
}

function sendIfOpen(ws: WebSocket, frame: DownFrame) {
  if (ws.readyState === WebSocket.OPEN) send(ws, frame)
}

// Spread in chunks, since one call with every byte overflows the stack.
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  }
  return btoa(binary)
}
