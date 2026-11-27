import { chatList, chatRead, chatThread } from '@shared/chats.ts'
import { apiError } from '@shared/errors.ts'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'

import { app } from '../app.ts'
import { createDb } from '../db/client.ts'
import {
  chatMessages,
  settings,
  transcriptions,
  trips,
  users,
} from '../db/schema.ts'
import type { FakeBridge } from '../test/bridge.ts'
import { connectBridge } from '../test/bridge.ts'
import { chatterWithChat, readEvents, sendMessage } from '../test/chats.ts'
import { bare, json } from '../test/requests.ts'
import { addTrip } from '../test/trips.ts'
import { signedIn } from '../test/users.ts'

async function errorCode(res: Response) {
  return apiError.parse(await res.json()).error.code
}

function postChat(cookie: string, id: string = crypto.randomUUID()) {
  return app.request('/api/chats', json('POST', { id }, cookie), env)
}

async function addChat(cookie: string, id?: string) {
  const res = await postChat(cookie, id)
  if (res.status !== 201) throw new Error(`Chat create answered ${res.status}`)
  return chatRead.parse(await res.json()).chat
}

function getChats(cookie: string) {
  return app.request('/api/chats', bare('GET', cookie), env)
}

function getThread(cookie: string, id: string) {
  return app.request(`/api/chats/${id}`, bare('GET', cookie), env)
}

/** Saves an invented message, the traveler's own unless told otherwise. */
async function addMessage(
  chatId: string,
  message: Partial<typeof chatMessages.$inferInsert> & { text: string },
) {
  await createDb(env.DB)
    .insert(chatMessages)
    .values({
      id: crypto.randomUUID(),
      chatId,
      role: 'user',
      status: 'complete',
      createdAt: new Date('2031-05-15T01:00:00Z'),
      ...message,
    })
}

async function lastMessages(cookie: string) {
  const { chats } = chatList.parse(await (await getChats(cookie)).json())
  return Object.fromEntries(chats.map((chat) => [chat.id, chat.lastMessage]))
}

/** A chatting account and a live trip for its chats to bind to. */
async function chatter() {
  const signed = await signedIn({ canChat: true })
  await addTrip(signed.cookie)
  return signed
}

describe('POST /api/chats', () => {
  it('binds the new chat to a live trip with no title yet', async () => {
    const { cookie } = await chatter()
    const id = crypto.randomUUID()

    const res = await postChat(cookie, id)

    expect(res.status).toBe(201)
    const { chat } = chatRead.parse(await res.json())
    expect(chat).toMatchObject({ id, title: null })
    const live = await createDb(env.DB).select().from(trips)
    expect(live.map((row) => row.id)).toContain(chat.tripId)
  })

  it('answers the stored chat to a retry of its create', async () => {
    const { cookie } = await chatter()
    const first = await addChat(cookie)

    const res = await postChat(cookie, first.id)

    expect(res.status).toBe(201)
    expect(chatRead.parse(await res.json()).chat).toEqual(first)
  })

  it('refuses an id another account already took', async () => {
    const owner = await chatter()
    const other = await chatter()
    const taken = await addChat(owner.cookie)

    const res = await postChat(other.cookie, taken.id)

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('id_conflict')
  })

  it('answers no_trip when there is no live trip to plan', async () => {
    const { cookie } = await signedIn({ canChat: true })
    await createDb(env.DB).update(trips).set({ deletedAt: new Date() })

    const res = await postChat(cookie)

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('no_trip')
  })

  it('refuses an account that cannot chat', async () => {
    const { cookie } = await signedIn({ canChat: false })
    await addTrip(cookie)

    const res = await postChat(cookie)

    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('forbidden')
  })
})

describe('GET /api/chats', () => {
  it('lists the account own chats alone, newest activity first', async () => {
    const { cookie } = await chatter()
    const other = await chatter()
    const older = await addChat(cookie)
    const newer = await addChat(cookie)
    await addChat(other.cookie)

    const res = await getChats(cookie)

    expect(res.status).toBe(200)
    const { chats } = chatList.parse(await res.json())
    expect(chats.map((chat) => chat.id)).toEqual([newer.id, older.id])
  })

  it("reads each chat's own newest message", async () => {
    const { cookie } = await chatter()
    const answered = await addChat(cookie)
    const waiting = await addChat(cookie)
    await addMessage(answered.id, {
      role: 'assistant',
      text: 'Invented reply',
      createdAt: new Date('2031-05-15T01:01:00Z'),
    })
    await addMessage(answered.id, { text: 'Invented ask' })
    await addMessage(waiting.id, { text: 'Another ask' })

    expect(await lastMessages(cookie)).toEqual({
      [answered.id]: 'Invented reply',
      [waiting.id]: 'Another ask',
    })
  })

  it('reads the reply over a message saved in the same millisecond', async () => {
    const { cookie } = await chatter()
    const chat = await addChat(cookie)
    await addMessage(chat.id, { text: 'Invented ask' })
    await addMessage(chat.id, { role: 'assistant', text: 'Invented reply' })

    expect(await lastMessages(cookie)).toEqual({ [chat.id]: 'Invented reply' })
  })

  it('reads a stopped reply by the text it reached', async () => {
    const { cookie } = await chatter()
    const chat = await addChat(cookie)
    await addMessage(chat.id, { text: 'Invented ask' })
    await addMessage(chat.id, {
      role: 'assistant',
      status: 'stopped',
      text: 'Invented rep',
    })

    expect(await lastMessages(cookie)).toEqual({ [chat.id]: 'Invented rep' })
  })

  it.each([
    ['no text', ''],
    ['line breaks alone', ' \n\r\n\t'],
  ])(
    'falls back to the message before a failed reply of %s',
    async (_, text) => {
      const { cookie } = await chatter()
      const chat = await addChat(cookie)
      await addMessage(chat.id, { text: 'Invented ask' })
      await addMessage(chat.id, { role: 'assistant', status: 'failed', text })

      expect(await lastMessages(cookie)).toEqual({ [chat.id]: 'Invented ask' })
    },
  )

  it('puts a message of several lines on one line', async () => {
    const { cookie } = await chatter()
    const chat = await addChat(cookie)
    await addMessage(chat.id, { text: '\nPhở lúc 7:00\r\n\n- Cà phê\t15:00\n' })

    expect(await lastMessages(cookie)).toEqual({
      [chat.id]: 'Phở lúc 7:00 - Cà phê 15:00',
    })
  })

  it('cuts a long message to 120 characters', async () => {
    const { cookie } = await chatter()
    const chat = await addChat(cookie)
    await addMessage(chat.id, { text: 'a'.repeat(121) })

    expect(await lastMessages(cookie)).toEqual({ [chat.id]: 'a'.repeat(120) })
  })

  it('cuts before an emoji that would cross the limit', async () => {
    const { cookie } = await chatter()
    const chat = await addChat(cookie)
    await addMessage(chat.id, { text: `${'a'.repeat(119)}🍜` })

    expect(await lastMessages(cookie)).toEqual({ [chat.id]: 'a'.repeat(119) })
  })

  it('reads null for a chat with no message yet', async () => {
    const { cookie } = await chatter()
    const other = await chatterWithChat()
    await addMessage(other.chat.id, { text: 'Another account ask' })
    const chat = await addChat(cookie)

    expect(await lastMessages(cookie)).toEqual({ [chat.id]: null })
  })

  it('refuses an account that cannot chat', async () => {
    const { cookie } = await signedIn({ canChat: false })

    const res = await getChats(cookie)

    expect(res.status).toBe(403)
  })
})

describe('GET /api/chats/:id', () => {
  it('reads a new chat with no messages', async () => {
    const { cookie } = await chatter()
    const chat = await addChat(cookie)

    const res = await getThread(cookie, chat.id)

    expect(res.status).toBe(200)
    expect(chatThread.parse(await res.json())).toEqual({ chat, messages: [] })
  })

  it('answers not_found for a chat another account owns', async () => {
    const owner = await chatter()
    const other = await chatter()
    const chat = await addChat(owner.cookie)

    const res = await getThread(other.cookie, chat.id)

    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('not_found')
  })
})

describe('POST /api/chats/:id/messages', () => {
  const open: FakeBridge[] = []

  afterEach(async () => {
    await Promise.all(open.splice(0).map((bridge) => bridge.close()))
  })

  /** Runs one turn the fake bridge answers with `reply`. */
  async function answeredSend(
    cookie: string,
    chatId: string,
    body: { id: string; text: string },
  ) {
    const bridge = await connectBridge()
    open.push(bridge)
    const res = await sendMessage(cookie, chatId, body)
    const turn = await bridge.next()
    if (turn.type !== 'turn') throw new Error(`Expected turn, got ${turn.type}`)
    bridge.send({
      type: 'final',
      turnId: turn.turnId,
      text: 'Invented reply',
      heldRemoval: false,
    })
    await readEvents(res)
    return bridge
  }

  it.each([
    ['English', 'an English account', 'en'],
    ['Vietnamese', 'a Vietnamese account', 'vi'],
    ['Vietnamese', 'an account with no saved language', null],
  ] as const)('asks for a reply in %s for %s', async (reply, _, language) => {
    const { cookie, chat } = await chatterWithChat({ language })
    const bridge = await connectBridge()
    open.push(bridge)

    const res = await sendMessage(cookie, chat.id)
    const turn = await bridge.next()
    if (turn.type !== 'turn') throw new Error(`Expected turn, got ${turn.type}`)
    bridge.send({
      type: 'final',
      turnId: turn.turnId,
      text: 'Invented reply',
      heldRemoval: false,
    })
    await readEvents(res)

    expect(turn.messages[0].content).toContain(`Reply in ${reply}`)
  })

  it('names each trip day in Vietnamese in the Worker runtime', async () => {
    const { cookie, chat } = await chatterWithChat()
    const bridge = await connectBridge()
    open.push(bridge)

    const res = await sendMessage(cookie, chat.id)
    const turn = await bridge.next()
    if (turn.type !== 'turn') throw new Error(`Expected turn, got ${turn.type}`)
    bridge.send({
      type: 'final',
      turnId: turn.turnId,
      text: 'Invented reply',
      heldRemoval: false,
    })
    await readEvents(res)

    expect(turn.messages[0].content).toContain(
      '2031-04-10 Thursday, Thứ Năm; 2031-04-11 Friday, Thứ Sáu',
    )
  })

  it('names the stored rate in the turn it sends', async () => {
    const { cookie, user, chat } = await chatterWithChat()
    const db = createDb(env.DB)
    await db.insert(settings).values({
      key: 'rate:USD:VND',
      value: '25500',
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    const bridge = await connectBridge()
    open.push(bridge)

    const res = await sendMessage(cookie, chat.id)
    const turn = await bridge.next()
    if (turn.type !== 'turn') throw new Error(`Expected turn, got ${turn.type}`)
    bridge.send({
      type: 'final',
      turnId: turn.turnId,
      text: 'Invented reply',
      heldRemoval: false,
    })
    await readEvents(res)
    await db.delete(settings)

    expect(turn.messages[0].content).toContain('1 USD = 25500 VND')
  })

  it('answers a retried send with the saved reply and runs no second turn', async () => {
    const { cookie, chat } = await chatterWithChat()
    const body = { id: crypto.randomUUID(), text: 'Invented ask' }
    await answeredSend(cookie, chat.id, body)

    const retry = await sendMessage(cookie, chat.id, body)

    expect(retry.status).toBe(200)
    expect(await readEvents(retry)).toEqual([
      expect.objectContaining({
        type: 'done',
        message: expect.objectContaining({ text: 'Invented reply' }),
      }),
    ])
    const thread = chatThread.parse(
      await (await getThread(cookie, chat.id)).json(),
    )
    expect(thread.messages).toHaveLength(2)
  })

  it('answers a retry of a failed reply with error, not done', async () => {
    const { cookie, chat } = await chatterWithChat()
    const body = { id: crypto.randomUUID(), text: 'Invented ask' }
    const bridge = await connectBridge()
    open.push(bridge)
    const first = await sendMessage(cookie, chat.id, body)
    const turn = await bridge.next()
    if (turn.type !== 'turn') throw new Error(`Expected turn, got ${turn.type}`)
    bridge.send({ type: 'failed', turnId: turn.turnId, reason: 'model_error' })
    await readEvents(first)

    const retry = await sendMessage(cookie, chat.id, body)

    expect(await readEvents(retry)).toEqual([
      expect.objectContaining({
        type: 'error',
        code: 'assistant_failed',
        changed: false,
        message: expect.objectContaining({ status: 'failed' }),
      }),
    ])
  })

  it('refuses a reused message id carrying another text', async () => {
    const { cookie, chat } = await chatterWithChat()
    const id = crypto.randomUUID()
    await answeredSend(cookie, chat.id, { id, text: 'Invented ask' })

    const res = await sendMessage(cookie, chat.id, { id, text: 'Another ask' })

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('id_conflict')
  })

  it('refuses a message id already used in another chat', async () => {
    const { cookie, chat } = await chatterWithChat()
    const other = await addChat(cookie)
    const body = { id: crypto.randomUUID(), text: 'Invented ask' }
    await answeredSend(cookie, chat.id, body)

    const res = await sendMessage(cookie, other.id, body)

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('id_conflict')
  })

  it('refuses the next send once the admin turns chat off', async () => {
    const { cookie, chat, user } = await chatterWithChat()
    await answeredSend(cookie, chat.id, {
      id: crypto.randomUUID(),
      text: 'Invented ask',
    })
    await createDb(env.DB)
      .update(users)
      .set({ canChat: false })
      .where(eq(users.id, user.id))

    const res = await sendMessage(cookie, chat.id)

    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('forbidden')
  })

  it('answers not_found for a send to another account chat', async () => {
    const { chat } = await chatterWithChat()
    const other = await chatter()

    const res = await sendMessage(other.cookie, chat.id)

    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('not_found')
  })

  it('answers no_trip once the chat trip is deleted', async () => {
    const { cookie, chat } = await chatterWithChat()
    await createDb(env.DB)
      .update(trips)
      .set({ deletedAt: new Date() })
      .where(eq(trips.id, chat.tripId))

    const res = await sendMessage(cookie, chat.id)

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('no_trip')
  })

  it('refuses an empty message', async () => {
    const { cookie, chat } = await chatterWithChat()

    const res = await sendMessage(cookie, chat.id, { text: '   ' })

    expect(res.status).toBe(400)
  })
})

describe('a send whose text started as a clip', () => {
  const open: FakeBridge[] = []

  afterEach(async () => {
    await Promise.all(open.splice(0).map((bridge) => bridge.close()))
  })

  async function addClip(userId: string) {
    const at = new Date('2031-04-11T09:00:00Z')
    const id = crypto.randomUUID()
    await createDb(env.DB).insert(transcriptions).values({
      id,
      userId,
      model: 'qwen3-asr-1.7b',
      outcome: 'ok',
      audioMs: 1200,
      transcribeMs: 300,
      characters: 20,
      createdAt: at,
      updatedAt: at,
    })
    return id
  }

  function clipRow(id: string) {
    return createDb(env.DB)
      .select()
      .from(transcriptions)
      .where(eq(transcriptions.id, id))
      .get()
  }

  async function sendAndAnswer(
    cookie: string,
    chatId: string,
    body: Parameters<typeof sendMessage>[2],
  ) {
    const bridge = await connectBridge()
    open.push(bridge)
    const res = await sendMessage(cookie, chatId, body)
    const turn = await bridge.next()
    if (turn.type !== 'turn') throw new Error(`Expected turn, got ${turn.type}`)
    bridge.send({
      type: 'final',
      turnId: turn.turnId,
      text: 'Done.',
      heldRemoval: false,
    })
    return readEvents(res)
  }

  it('marks the clip sent as this message with its edit ratio', async () => {
    const { cookie, chat, user } = await chatterWithChat()
    const clipId = await addClip(user.id)
    const id = crypto.randomUUID()

    await sendAndAnswer(cookie, chat.id, {
      id,
      voice: { transcriptionId: clipId, editRatio: 0.25 },
    })

    expect(await clipRow(clipId)).toMatchObject({
      sentMessageId: id,
      editRatio: 0.25,
    })
  })

  it('writes the same values on a retried send', async () => {
    const { cookie, chat, user } = await chatterWithChat()
    const clipId = await addClip(user.id)
    const id = crypto.randomUUID()
    const voice = { transcriptionId: clipId, editRatio: 0.5 }
    await sendAndAnswer(cookie, chat.id, { id, voice })

    const retry = await sendMessage(cookie, chat.id, { id, voice })
    await readEvents(retry)

    expect(await clipRow(clipId)).toMatchObject({
      sentMessageId: id,
      editRatio: 0.5,
    })
  })

  it("sends with another account's clip id and leaves that clip alone", async () => {
    const other = await signedIn({ canChat: true })
    const clipId = await addClip(other.user.id)
    const { cookie, chat } = await chatterWithChat()

    const events = await sendAndAnswer(cookie, chat.id, {
      voice: { transcriptionId: clipId, editRatio: 1 },
    })

    expect(events.at(-1)?.type).toBe('done')
    expect(await clipRow(clipId)).toMatchObject({
      sentMessageId: null,
      editRatio: null,
    })
  })

  it('leaves the clip unsent when the workspace PC refuses the send', async () => {
    const { cookie, chat, user } = await chatterWithChat()
    const clipId = await addClip(user.id)

    const res = await sendMessage(cookie, chat.id, {
      voice: { transcriptionId: clipId, editRatio: 0.25 },
    })

    expect(res.status).toBe(503)
    expect(await clipRow(clipId)).toMatchObject({
      sentMessageId: null,
      editRatio: null,
    })
  })

  it('leaves the clip unsent when the chat has no trip to plan', async () => {
    const { cookie, chat, user } = await chatterWithChat()
    const clipId = await addClip(user.id)
    await createDb(env.DB)
      .update(trips)
      .set({ deletedAt: new Date() })
      .where(eq(trips.id, chat.tripId))

    const res = await sendMessage(cookie, chat.id, {
      voice: { transcriptionId: clipId, editRatio: 0.25 },
    })

    expect(res.status).toBe(409)
    expect((await clipRow(clipId))?.sentMessageId).toBeNull()
  })

  it('refuses an edit ratio outside 0 to 1', async () => {
    const { cookie, chat, user } = await chatterWithChat()
    const clipId = await addClip(user.id)

    const res = await sendMessage(cookie, chat.id, {
      voice: { transcriptionId: clipId, editRatio: 1.5 },
    })

    expect(res.status).toBe(400)
  })
})
