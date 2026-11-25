// Dials out to the relay, runs turns and forwards clips, and redials with
// backoff. It writes nothing to disk and logs ids, models, and durations,
// never message text, tool arguments, clips, or transcripts.
import type { AssistantModel } from '@shared/assistant.ts'
import type { DownFrame } from '@shared/bridge-frames.ts'
import { PROTOCOL_MISMATCH } from '@shared/bridge-frames.ts'

import { readConfig } from './config.ts'
import { turnModel, unload, warm } from './ollama.ts'
import type { BridgeSocket } from './socket.ts'
import { openSocket } from './socket.ts'
import type { RunningTurn } from './turn.ts'
import { runTurn } from './turn.ts'
import {
  liveStep,
  transcribe,
  voiceHealthy,
  warmVoice,
  watchVoice,
} from './voice.ts'

const FIRST_RETRY_MS = 1_000
const LAST_RETRY_MS = 30_000

function log(event: string, fields: Record<string, string | number> = {}) {
  console.log(JSON.stringify({ event, ...fields }))
}

let config: ReturnType<typeof readConfig>
try {
  config = readConfig(process.env)
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Bad bridge settings')
  process.exit(1)
}

let socket: BridgeSocket | undefined
let current: { turnId: string; running: RunningTurn } | undefined
let lastModel: AssistantModel | undefined
let retryMs = FIRST_RETRY_MS
let stopping = false
const voiceWatch = watchVoice(
  () => voiceHealthy(config.voiceUrl),
  (online) => {
    log(online ? 'voice_online' : 'voice_offline')
    socket?.send({ type: 'voice_status', online })
  },
)
const pending = new Map<
  string,
  {
    turnId: string
    resolve: (result: Record<string, unknown>) => void
    reject: () => void
  }
>()

function rejectPending(turnId?: string) {
  for (const [callId, call] of pending) {
    if (turnId !== undefined && call.turnId !== turnId) continue
    call.reject()
    pending.delete(callId)
  }
}

function connect() {
  log('connecting')
  const opened = openSocket(config, {
    onFrame: (frame) => onFrame(opened, frame),
    onClose: (code) => {
      log('closed', { code })
      current?.running.cancel()
      rejectPending()
      if (stopping) return
      if (code === PROTOCOL_MISMATCH) {
        console.error(
          'The app speaks another bridge protocol. Pull the checkout and restart.',
        )
        process.exit(1)
      }
      setTimeout(connect, retryMs)
      retryMs = Math.min(retryMs * 2, LAST_RETRY_MS)
    },
  })
  socket = opened
}

function onFrame(opened: BridgeSocket, frame: DownFrame) {
  if (frame.type === 'ready') {
    retryMs = FIRST_RETRY_MS
    log('ready')
    opened.send({ type: 'live_ready' })
    // A new socket starts with voice unknown to the relay, so say it again.
    voiceWatch.reset()
    void voiceWatch.check()
    return
  }
  if (frame.type === 'transcribe') {
    const startedAt = Date.now()
    const { transcriptionId, model } = frame
    void transcribe(config.voiceUrl, frame).then((answer) => {
      log('clip_ended', {
        transcriptionId,
        model,
        outcome: answer.type === 'transcript' ? 'ok' : answer.reason,
        ms: Date.now() - startedAt,
      })
      opened.send(answer)
    })
    return
  }
  if (frame.type === 'voice_warm') {
    warmVoice(config.voiceUrl, frame.model).catch(() =>
      log('voice_warm_failed', { model: frame.model }),
    )
    return
  }
  if (frame.type === 'live') {
    void liveStep(config.voiceUrl, frame).then((answer) => opened.send(answer))
    return
  }
  if (frame.type === 'tool_result') {
    pending.get(frame.callId)?.resolve(frame.result)
    pending.delete(frame.callId)
    return
  }
  if (frame.type === 'cancel') {
    if (current?.turnId === frame.turnId) current.running.cancel()
    rejectPending(frame.turnId)
    return
  }
  if (frame.type === 'warm') {
    lastModel = frame.model
    warm(config.ollamaUrl, frame.model).catch(() =>
      log('warm_failed', { model: frame.model }),
    )
    return
  }
  const startedAt = Date.now()
  lastModel = frame.model
  log('turn_started', { turnId: frame.turnId, model: frame.model })
  const running = runTurn(frame, {
    model: turnModel(config.ollamaUrl),
    send: opened.send,
    callTool: (call) =>
      new Promise((resolve, reject) => {
        pending.set(call.callId, { turnId: call.turnId, resolve, reject })
        opened.send(call)
      }),
  })
  current = { turnId: frame.turnId, running }
  void running.done.then(() => {
    log('turn_ended', { turnId: frame.turnId, ms: Date.now() - startedAt })
    if (current?.running === running) current = undefined
  })
}

async function stop() {
  stopping = true
  voiceWatch.stop()
  current?.running.cancel()
  socket?.close()
  if (lastModel !== undefined) {
    await unload(config.ollamaUrl, lastModel).catch(() => undefined)
  }
  process.exit(0)
}

process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())
connect()
