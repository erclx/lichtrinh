import type { DownFrame } from '@shared/bridge-frames.ts'
import { chatThread } from '@shared/chats.ts'
import { apiError } from '@shared/errors.ts'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'

import { app } from '../app.ts'
import type { FakeBridge } from '../test/bridge.ts'
import { connectBridge } from '../test/bridge.ts'
import { chatterWithChat, readEvents, sendMessage } from '../test/chats.ts'
import { bare } from '../test/requests.ts'
import type { TurnInput } from './relay.ts'
import { relayOf } from './relay.ts'

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
