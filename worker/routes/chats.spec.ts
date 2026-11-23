import { chatList, chatRead, chatThread } from '@shared/chats.ts'
import { apiError } from '@shared/errors.ts'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { app } from '../app.ts'
import { createDb } from '../db/client.ts'
import { trips } from '../db/schema.ts'
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
