import type { DownFrame } from '@shared/bridge-frames.ts'
import { SILENT } from '@shared/bridge-frames.ts'
import { chatThread } from '@shared/chats.ts'
import { apiError } from '@shared/errors.ts'
import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { app } from '../app.ts'
import type { FakeBridge } from '../test/bridge.ts'
import {
  answerClip,
  answerLive,
  connectBridge,
  connectVoiceBridge,
  sayVoice,
} from '../test/bridge.ts'
import { chatterWithChat, readEvents, sendMessage } from '../test/chats.ts'
import { bare } from '../test/requests.ts'
import { sendClip, sendPiece } from '../test/voice.ts'
import type { TurnInput } from './relay.ts'
import { AssistantRelay, relayOf } from './relay.ts'

const open: FakeBridge[] = []

async function bridgeOnline() {
  const bridge = await connectBridge()
  open.push(bridge)
  return bridge
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((bridge) => bridge.close()))
})

async function nextOf<T extends DownFrame['type']>(
  bridge: FakeBridge,
  type: T,
): Promise<Extract<DownFrame, { type: T }>> {
  const frame = await bridge.next()
  if (frame.type !== type)
    throw new Error(`Expected ${type}, got ${frame.type}`)
  return frame as Extract<DownFrame, { type: T }>
}

async function readThread(cookie: string, chatId: string) {
  const res = await app.request(
    `/api/chats/${chatId}`,
    bare('GET', cookie),
    env,
  )
  return chatThread.parse(await res.json())
}

const ADD = {
  title: 'Invented Pier Lunch',
  date: '2031-04-11',
  start: '12:00',
}

describe('a whole turn through the relay', () => {
  it('sends the turn, runs the tool, and streams the reply to done', async () => {
    const { cookie, chat, user } = await chatterWithChat()
    const bridge = await bridgeOnline()
    const messageId = crypto.randomUUID()

    const res = await sendMessage(cookie, chat.id, {
      id: messageId,
      text: 'Add a pier lunch',
    })
    const turn = await nextOf(bridge, 'turn')
    bridge.send({
      type: 'tool_call',
      turnId: turn.turnId,
      callId: 'call-1',
      name: 'add_entry',
      arguments: ADD,
    })
    const result = await nextOf(bridge, 'tool_result')
    bridge.send({ type: 'delta', turnId: turn.turnId, text: 'Added.' })
    bridge.send({
      type: 'final',
      turnId: turn.turnId,
      text: 'Added.',
      heldRemoval: false,
    })
    const events = await readEvents(res)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/x-ndjson')
    expect(turn).toMatchObject({
      turnId: messageId,
      model: 'lichtrinh-assistant',
    })
    expect(turn.messages.at(-1)).toEqual({
      role: 'user',
      content: 'Add a pier lunch',
    })
    expect(result).toMatchObject({ callId: 'call-1', result: { ok: true } })
    expect(events.map((event) => event.type)).toEqual([
      'step',
      'change',
      'delta',
      'done',
    ])
    const done = events[3]
    if (done.type !== 'done') throw new Error('No done event')
    expect(done.message).toMatchObject({
      role: 'assistant',
      text: 'Added.',
      status: 'complete',
      model: 'lichtrinh-assistant',
    })
    expect(done.message.changes).toHaveLength(1)
    expect(done.message.changes[0]).toMatchObject({
      source: 'assistant',
      actor: { id: user.id },
    })
  })

  it('saves the message and its reply in order, each with its changes', async () => {
    const { cookie, chat } = await chatterWithChat()
    const bridge = await bridgeOnline()
    const res = await sendMessage(cookie, chat.id, { text: 'Add a pier lunch' })
    const turn = await nextOf(bridge, 'turn')
    bridge.send({
      type: 'tool_call',
      turnId: turn.turnId,
      callId: 'call-1',
      name: 'add_entry',
      arguments: ADD,
    })
    await nextOf(bridge, 'tool_result')
    bridge.send({
      type: 'final',
      turnId: turn.turnId,
      text: 'Added.',
      heldRemoval: false,
    })
    await readEvents(res)

    const thread = await readThread(cookie, chat.id)

    expect(thread.chat.title).toBe('Add a pier lunch')
    expect(
      thread.messages.map((m) => [m.role, m.text, m.changes.length]),
    ).toEqual([
      ['user', 'Add a pier lunch', 0],
      ['assistant', 'Added.', 1],
    ])
  })

  it('answers assistant_busy to a second send while a turn runs', async () => {
    const { cookie, chat } = await chatterWithChat()
    const bridge = await bridgeOnline()
    const first = await sendMessage(cookie, chat.id)
    const turn = await nextOf(bridge, 'turn')

    const second = await sendMessage(cookie, chat.id)

    expect(second.status).toBe(409)
    expect(apiError.parse(await second.json()).error.code).toBe(
      'assistant_busy',
    )
    bridge.send({
      type: 'final',
      turnId: turn.turnId,
      text: 'Done.',
      heldRemoval: false,
    })
    await readEvents(first)
  })

  it('answers assistant_busy to a retry of the message still running', async () => {
    const { cookie, chat } = await chatterWithChat()
    const bridge = await bridgeOnline()
    const id = crypto.randomUUID()
    const first = await sendMessage(cookie, chat.id, { id })
    const turn = await nextOf(bridge, 'turn')

    const retry = await sendMessage(cookie, chat.id, { id })

    expect(retry.status).toBe(409)
    bridge.send({
      type: 'final',
      turnId: turn.turnId,
      text: 'Done.',
      heldRemoval: false,
    })
    await readEvents(first)
  })
})

describe('holding several removals for a yes', () => {
  it('tells the next turn the reply before it held removals', async () => {
    const { cookie, chat } = await chatterWithChat()
    const bridge = await bridgeOnline()
    const first = await sendMessage(cookie, chat.id)
    const held = await nextOf(bridge, 'turn')
    bridge.send({
      type: 'final',
      turnId: held.turnId,
      text: 'Both?',
      heldRemoval: true,
    })
    await readEvents(first)

    const second = await sendMessage(cookie, chat.id)
    const next = await nextOf(bridge, 'turn')

    expect(held.removalAsked).toBe(false)
    expect(next.removalAsked).toBe(true)
    bridge.send({
      type: 'final',
      turnId: next.turnId,
      text: 'Done.',
      heldRemoval: false,
    })
    await readEvents(second)
  })
})

describe('a turn that breaks off', () => {
  it('frees the relay when saving the message throws', async () => {
    const { cookie, chat, user, trip } = await chatterWithChat()
    const bridge = await bridgeOnline()
    const broken = relayOf(env).fetch('https://relay/turn', {
      method: 'POST',
      body: JSON.stringify({
        chatId: 'no-such-chat',
        ownerId: user.id,
        tripId: trip.id,
        messageId: crypto.randomUUID(),
        text: 'Invented ask',
        model: 'lichtrinh-assistant',
        messages: [],
        versions: {},
        removalAsked: false,
      } satisfies TurnInput),
    })
    await expect(broken).rejects.toThrow()

    const res = await sendMessage(cookie, chat.id)

    expect(res.status).toBe(200)
    const turn = await nextOf(bridge, 'turn')
    bridge.send({
      type: 'final',
      turnId: turn.turnId,
      text: 'Done.',
      heldRemoval: false,
    })
    await readEvents(res)
  })

  it('keeps a write made before the socket closed and says something changed', async () => {
    const { cookie, chat } = await chatterWithChat()
    const bridge = await connectBridge()
    const res = await sendMessage(cookie, chat.id)
    const turn = await nextOf(bridge, 'turn')
    bridge.send({
      type: 'tool_call',
      turnId: turn.turnId,
      callId: 'call-1',
      name: 'add_entry',
      arguments: ADD,
    })
    await nextOf(bridge, 'tool_result')
    bridge.send({ type: 'delta', turnId: turn.turnId, text: 'Adding' })

    await bridge.close()
    const events = await readEvents(res)

    const last = events.at(-1)
    expect(last).toMatchObject({
      type: 'error',
      code: 'assistant_unavailable',
      changed: true,
      message: { status: 'failed', text: 'Adding' },
    })
    expect(events.filter((event) => event.type === 'change')).toHaveLength(1)
    const thread = await readThread(cookie, chat.id)
    expect(thread.messages[1]).toMatchObject({ status: 'failed' })
    expect(thread.messages[1].changes).toHaveLength(1)
  })

  it('ends on assistant_failed when the bridge gives up', async () => {
    const { cookie, chat } = await chatterWithChat()
    const bridge = await bridgeOnline()
    const res = await sendMessage(cookie, chat.id)
    const turn = await nextOf(bridge, 'turn')

    bridge.send({ type: 'failed', turnId: turn.turnId, reason: 'model_error' })
    const events = await readEvents(res)

    expect(events).toEqual([
      expect.objectContaining({
        type: 'error',
        code: 'assistant_failed',
        changed: false,
        message: expect.objectContaining({ status: 'failed' }),
      }),
    ])
  })

  it('saves a final with no text and no change as failed, never complete', async () => {
    const { cookie, chat } = await chatterWithChat()
    const bridge = await bridgeOnline()
    const res = await sendMessage(cookie, chat.id)
    const turn = await nextOf(bridge, 'turn')

    bridge.send({
      type: 'final',
      turnId: turn.turnId,
      text: '  ',
      heldRemoval: false,
    })
    const events = await readEvents(res)

    expect(events.at(-1)).toMatchObject({
      type: 'error',
      code: 'assistant_failed',
      message: { status: 'failed' },
    })
  })

  it('cancels the bridge and saves the reply as stopped when the reader stops', async () => {
    const { cookie, chat } = await chatterWithChat()
    const bridge = await bridgeOnline()
    const res = await sendMessage(cookie, chat.id)
    const turn = await nextOf(bridge, 'turn')
    bridge.send({ type: 'delta', turnId: turn.turnId, text: 'Partly' })

    await res.body?.cancel()
    const cancel = await nextOf(bridge, 'cancel')

    expect(cancel.turnId).toBe(turn.turnId)
    const thread = await readThread(cookie, chat.id)
    expect(thread.messages[1]).toMatchObject({ status: 'stopped' })
  })

  it('runs the next turn once a turn has ended', async () => {
    const { cookie, chat } = await chatterWithChat()
    const bridge = await bridgeOnline()
    const first = await sendMessage(cookie, chat.id)
    const turn = await nextOf(bridge, 'turn')
    bridge.send({ type: 'failed', turnId: turn.turnId, reason: 'model_error' })
    await readEvents(first)

    const second = await sendMessage(cookie, chat.id)

    expect(second.status).toBe(200)
    const next = await nextOf(bridge, 'turn')
    bridge.send({
      type: 'final',
      turnId: next.turnId,
      text: 'Done.',
      heldRemoval: false,
    })
    await readEvents(second)
  })
})

describe('a clip beside the turn', () => {
  async function voiceOnline() {
    const bridge = await connectVoiceBridge()
    open.push(bridge)
    return bridge
  }

  async function errorCode(res: Response) {
    return apiError.parse(await res.json()).error.code
  }

  it('answers a clip while a turn runs, without waiting for the turn', async () => {
    const { cookie, chat } = await chatterWithChat()
    const bridge = await voiceOnline()
    const reply = await sendMessage(cookie, chat.id)
    const turn = await nextOf(bridge, 'turn')

    const clip = sendClip(cookie)
    await answerClip(bridge, { text: 'Invented', audioMs: 700 })
    const res = await clip

    expect(res.status).toBe(200)
    bridge.send({
      type: 'final',
      turnId: turn.turnId,
      text: 'Done.',
      heldRemoval: false,
    })
    expect((await readEvents(reply)).at(-1)?.type).toBe('done')
  })

  it('answers voice_failed when the model could not transcribe the clip', async () => {
    const { cookie } = await chatterWithChat()
    const bridge = await voiceOnline()

    const clip = sendClip(cookie)
    await answerClip(bridge, { failed: 'failed' })
    const res = await clip

    expect(res.status).toBe(502)
    expect(await errorCode(res)).toBe('voice_failed')
  })

  it('answers voice_failed once the clip outlasts its wait', async () => {
    const { cookie } = await chatterWithChat()
    const bridge = await voiceOnline()
    await runInDurableObject(relayOf(env), (relay: AssistantRelay) => {
      relay.clipTimeoutMs = 50
    })

    const clip = sendClip(cookie)
    await nextOf(bridge, 'transcribe')
    const res = await clip

    await runInDurableObject(relayOf(env), (relay: AssistantRelay) => {
      relay.clipTimeoutMs = 60_000
    })
    expect(res.status).toBe(502)
    expect(await errorCode(res)).toBe('voice_failed')
  })

  it('answers voice_failed at once when the socket closes with a clip pending', async () => {
    const { cookie } = await chatterWithChat()
    const bridge = await connectVoiceBridge()
    const clip = sendClip(cookie)
    await nextOf(bridge, 'transcribe')

    await bridge.close()
    const res = await clip

    expect(res.status).toBe(502)
    expect(await errorCode(res)).toBe('voice_failed')
  })

  it('ignores a transcript for a clip nobody sent', async () => {
    const { cookie } = await chatterWithChat()
    const bridge = await voiceOnline()
    bridge.send({
      type: 'transcript',
      transcriptionId: crypto.randomUUID(),
      text: 'Stray',
      audioMs: 10,
    })

    const clip = sendClip(cookie)
    await answerClip(bridge, { text: 'Invented', audioMs: 700 })
    const res = await clip

    expect(res.status).toBe(200)
  })
})

describe('a live piece beside everything else', () => {
  async function voiceOnline(options: { live?: boolean } = {}) {
    const bridge = await connectVoiceBridge(options)
    open.push(bridge)
    return bridge
  }

  function setLiveTimeout(ms: number) {
    return runInDurableObject(relayOf(env), (relay: AssistantRelay) => {
      relay.liveTimeoutMs = ms
    })
  }

  it('answers while a turn runs, without waiting for the turn', async () => {
    const { cookie, chat } = await chatterWithChat()
    const bridge = await voiceOnline()
    const reply = await sendMessage(cookie, chat.id)
    const turn = await nextOf(bridge, 'turn')

    const piece = sendPiece(cookie)
    await answerLive(bridge, { text: 'Invented', heard: 19 })
    const res = await piece

    expect(res.status).toBe(200)
    bridge.send({
      type: 'final',
      turnId: turn.turnId,
      text: 'Done.',
      heldRemoval: false,
    })
    expect((await readEvents(reply)).at(-1)?.type).toBe('done')
  })

  it('never holds back the clip sent at Stop', async () => {
    const { cookie } = await chatterWithChat()
    const bridge = await voiceOnline()
    const piece = sendPiece(cookie)
    const live = await nextOf(bridge, 'live')

    const clip = sendClip(cookie)
    await answerClip(bridge, { text: 'Invented', audioMs: 700 })

    expect((await clip).status).toBe(200)
    bridge.send({
      type: 'live_text',
      liveId: live.liveId,
      text: 'Late',
      heard: 19,
    })
    expect((await piece).status).toBe(200)
  })

  it('gives up on a piece that outlasts its wait', async () => {
    const { cookie } = await chatterWithChat()
    const bridge = await voiceOnline()
    await setLiveTimeout(50)

    const piece = sendPiece(cookie)
    await nextOf(bridge, 'live')
    const res = await piece

    await setLiveTimeout(5_000)
    expect(res.status).toBe(502)
  })

  it('gives up at once when the socket closes with a piece pending', async () => {
    const { cookie } = await chatterWithChat()
    const bridge = await connectVoiceBridge()
    const piece = sendPiece(cookie)
    await nextOf(bridge, 'live')

    await bridge.close()

    expect((await piece).status).toBe(502)
  })

  it('answers a retried piece rather than the one it replaces', async () => {
    const { cookie } = await chatterWithChat()
    const bridge = await voiceOnline()
    const id = crypto.randomUUID()
    const lost = sendPiece(cookie, { id })
    await nextOf(bridge, 'live')

    const retry = sendPiece(cookie, { id })
    await answerLive(bridge, { text: 'Invented', heard: 19 })

    expect((await retry).status).toBe(200)
    expect((await lost).status).toBe(502)
  })

  it('names the language of a clip to a bridge that reads live pieces', async () => {
    const { cookie } = await chatterWithChat()
    const bridge = await voiceOnline()

    const clip = sendClip(cookie)
    const frame = await answerClip(bridge, { text: 'Invented', audioMs: 700 })
    await clip

    expect(frame.language).toBe('vi')
  })

  it('sends a bridge older than live pieces no field it cannot read', async () => {
    const { cookie } = await chatterWithChat()
    const bridge = await voiceOnline({ live: false })

    await sendPiece(cookie)
    const clip = sendClip(cookie)
    // The first frame it reads is the clip, so the piece never reached it.
    const frame = await answerClip(bridge, { text: 'Invented', audioMs: 700 })
    await clip

    expect(frame).not.toHaveProperty('language')
  })
})

describe('when each service last came up', () => {
  function services() {
    return relayOf(env).services()
  }

  function setSilentAfter(ms: number) {
    return runInDurableObject(relayOf(env), (relay: AssistantRelay) => {
      relay.silentAfterMs = ms
    })
  }

  it('moves the assistant to now on a hello and leaves voice alone', async () => {
    const before = await services()
    const at = Date.now()

    await bridgeOnline()

    const after = await services()
    expect(after.assistant.online).toBe(true)
    expect(after.assistant.upAt).toBeGreaterThanOrEqual(at)
    expect(after.voice).toEqual({ online: false, upAt: before.voice.upAt })
  })

  it('moves voice to now when its server starts answering', async () => {
    const bridge = await connectBridge({ voice: true })
    open.push(bridge)
    const at = Date.now()

    await sayVoice(bridge, true)

    const { voice } = await services()
    expect(voice.online).toBe(true)
    expect(voice.upAt).toBeGreaterThanOrEqual(at)
  })

  it('keeps the time through a repeated voice status', async () => {
    const bridge = await connectBridge({ voice: true })
    open.push(bridge)
    await sayVoice(bridge, true)
    const first = await services()
    await vi.waitFor(() => {
      expect(Date.now()).toBeGreaterThan(first.voice.upAt ?? 0)
    })

    bridge.send({ type: 'voice_status', online: true })
    // Read after the status above, so the relay has read both.
    await sayVoice(bridge, false)

    expect((await services()).voice.upAt).toBe(first.voice.upAt)
  })

  it('keeps the time once the bridge has gone', async () => {
    const bridge = await connectBridge()
    const up = await services()

    await bridge.close()

    expect((await services()).assistant).toEqual({
      online: false,
      upAt: up.assistant.upAt,
    })
  })

  it('hangs up on a bridge gone silent, so its return is a new hello', async () => {
    const bridge = await connectBridge()
    const up = await services()
    await setSilentAfter(0)

    const silent = await services()

    await setSilentAfter(60_000)
    expect(silent.assistant.online).toBe(false)
    expect((await bridge.closed).code).toBe(SILENT)
    // Live again by the clock alone, yet down until it says hello.
    expect((await services()).assistant).toEqual({
      online: false,
      upAt: up.assistant.upAt,
    })
  })

  it('moves the time on when the bridge comes back', async () => {
    const bridge = await connectBridge()
    const first = await services()
    await bridge.close()
    await vi.waitFor(() => {
      expect(Date.now()).toBeGreaterThan(first.assistant.upAt ?? 0)
    })

    await bridgeOnline()

    expect((await services()).assistant.upAt).toBeGreaterThan(
      first.assistant.upAt ?? 0,
    )
  })
})
