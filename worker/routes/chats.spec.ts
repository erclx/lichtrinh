import { chatList, chatRead, chatThread } from '@shared/chats.ts'
import { apiError } from '@shared/errors.ts'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'

import { app } from '../app.ts'
import { createDb } from '../db/client.ts'
import { trips, users } from '../db/schema.ts'
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
