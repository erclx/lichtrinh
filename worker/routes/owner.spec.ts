import { apiError } from '@shared/errors.ts'
import { ownerSummary } from '@shared/owner.ts'
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { app } from '../app.ts'
import { createDb } from '../db/client.ts'
import { chatMessages, chats } from '../db/schema.ts'
import type { FakeBridge } from '../test/bridge.ts'
import { connectBridge, TEST_BRIDGE_SECRET } from '../test/bridge.ts'
import { addTrip } from '../test/trips.ts'
import { signedIn } from '../test/users.ts'

const PANEL_SECRET = 'test-panel-secret'
const BEARER = `Bearer ${PANEL_SECRET}`

interface SummaryRequest {
  authorization?: string
  cookie?: string
  query?: string
}

function requestSummary(
  { authorization, cookie, query = '' }: SummaryRequest = {},
  bindings: Env = env,
) {
  const headers: Record<string, string> = {}
  if (authorization !== undefined) headers.authorization = authorization
  if (cookie !== undefined) headers.cookie = cookie
  return app.request(`/api/owner/summary${query}`, { headers }, bindings)
}

async function readSummary(query = '') {
  const res = await requestSummary({ authorization: BEARER, query })
  expect(res.status).toBe(200)
  return ownerSummary.parse(await res.json())
}

async function errorCode(res: Response) {
  return apiError.parse(await res.json()).error.code
}

/** A chat on an invented trip, owned by a fresh account. */
async function addChat() {
  const { cookie, user } = await signedIn({ canChat: true })
  const { trip } = await addTrip(cookie)
  const id = crypto.randomUUID()
  const at = new Date('2031-04-11T08:00:00Z')
  await createDb(env.DB).insert(chats).values({
    id,
    ownerId: user.id,
    tripId: trip.id,
    title: null,
    createdAt: at,
    updatedAt: at,
  })
  return id
}

interface MessageSeed {
  at: string
  role?: 'user' | 'assistant'
  text?: string
  status?: 'complete' | 'failed' | 'stopped'
}

async function addMessage(chatId: string, seed: MessageSeed) {
  const id = crypto.randomUUID()
  const role = seed.role ?? 'user'
  await createDb(env.DB)
    .insert(chatMessages)
    .values({
      id,
      chatId,
      role,
      text: seed.text ?? 'Invented ask',
      status: seed.status ?? 'complete',
      model: role === 'assistant' ? 'lichtrinh-assistant' : null,
      changeIds: '[]',
      replyTo: null,
      heldRemoval: false,
      createdAt: new Date(seed.at),
    })
  return id
}

afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(async () => {
  const db = createDb(env.DB)
  await db.delete(chatMessages)
  await db.delete(chats)
})

describe('GET /api/owner/summary refusals', () => {
  it.each([
    ['no bearer', {}],
    ['a wrong secret', { authorization: 'Bearer not-the-secret' }],
    ['the bridge secret', { authorization: `Bearer ${TEST_BRIDGE_SECRET}` }],
    ['the secret without the Bearer word', { authorization: PANEL_SECRET }],
    ['the secret in the query string', { query: `?secret=${PANEL_SECRET}` }],
    ['the secret as a token query', { query: `?token=${PANEL_SECRET}` }],
  ])('refuses %s with unauthenticated', async (_, request) => {
    const res = await requestSummary(request)

    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('unauthenticated')
  })

  it('refuses a signed-in session cookie with no bearer', async () => {
    const { cookie } = await signedIn({ role: 'admin' })

    const res = await requestSummary({ cookie })

    expect(res.status).toBe(401)
  })

  it('refuses every caller while the secret is unset', async () => {
    const res = await requestSummary(
      { authorization: BEARER },
      { ...env, PANEL_SECRET: undefined },
    )

    expect(res.status).toBe(401)
  })

  it('refuses an empty bearer while the secret is empty', async () => {
    const res = await requestSummary(
      { authorization: 'Bearer ' },
      { ...env, PANEL_SECRET: '' },
    )

    expect(res.status).toBe(401)
  })

  it('refuses a since that is not an ISO time with validation_failed', async () => {
    const res = await requestSummary({
      authorization: BEARER,
      query: '?since=yesterday',
    })

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })

  it('refuses a wrong secret before it reads a bad since', async () => {
    const res = await requestSummary({
      authorization: 'Bearer not-the-secret',
      query: '?since=yesterday',
    })

    expect(res.status).toBe(401)
  })

  it('refuses the secret in the query even beside a right bearer', async () => {
    const res = await requestSummary({
      authorization: BEARER,
      query: `?secret=${PANEL_SECRET}`,
    })

    expect(res.status).toBe(400)
  })

  it('marks a refusal no-store', async () => {
    const res = await requestSummary()

    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('GET /api/owner/summary messages', () => {
  it('answers messages newest first, a reply above the message it answers', async () => {
    const chatId = await addChat()
    const older = await addMessage(chatId, { at: '2031-04-11T09:00:00Z' })
    const ask = await addMessage(chatId, { at: '2031-04-11T10:00:00Z' })
    const reply = await addMessage(chatId, {
      at: '2031-04-11T10:00:00Z',
      role: 'assistant',
    })

    const { messages } = await readSummary()

    expect(messages.map(({ id }) => id)).toEqual([reply, ask, older])
  })

  it('names the model on a reply and none on a message', async () => {
    const chatId = await addChat()
    await addMessage(chatId, {
      at: '2031-04-11T10:00:00Z',
      text: 'thêm ăn sáng lúc 7 giờ',
    })
    await addMessage(chatId, {
      at: '2031-04-11T10:00:02Z',
      role: 'assistant',
      text: 'Xong, đã thêm ăn sáng.',
    })

    const { messages } = await readSummary()

    expect(messages).toMatchObject([
      {
        role: 'assistant',
        text: 'Xong, đã thêm ăn sáng.',
        model: 'lichtrinh-assistant',
        status: 'complete',
        at: '2031-04-11T10:00:02.000Z',
      },
      { role: 'user', text: 'thêm ăn sáng lúc 7 giờ', model: null },
    ])
  })

  it('carries a failed and a stopped reply with their status', async () => {
    const chatId = await addChat()
    await addMessage(chatId, {
      at: '2031-04-11T10:00:00Z',
      role: 'assistant',
      status: 'failed',
      text: '',
    })
    await addMessage(chatId, {
      at: '2031-04-11T11:00:00Z',
      role: 'assistant',
      status: 'stopped',
    })

    const { messages } = await readSummary()

    expect(messages.map(({ status }) => status)).toEqual(['stopped', 'failed'])
  })

  it('reads across every account', async () => {
    const first = await addChat()
    const second = await addChat()
    await addMessage(first, { at: '2031-04-11T10:00:00Z' })
    await addMessage(second, { at: '2031-04-11T11:00:00Z' })

    const { messages } = await readSummary()

    expect(messages).toHaveLength(2)
  })

  it('caps the list at the newest 50', async () => {
    const chatId = await addChat()
    const start = Date.parse('2031-04-11T00:00:00Z')
    const ids = await Promise.all(
      Array.from({ length: 52 }, (_, minute) =>
        addMessage(chatId, {
          at: new Date(start + minute * 60_000).toISOString(),
        }),
      ),
    )

    const { messages } = await readSummary()

    expect(messages).toHaveLength(50)
    expect(messages.at(-1)?.id).toBe(ids[2])
  })

  it('answers an empty list before any chat', async () => {
    const { messages } = await readSummary()

    expect(messages).toEqual([])
  })
})

describe('GET /api/owner/summary turns', () => {
  const since = '2031-04-11T00:00:00.000Z'

  it('counts the replies at or after since and the failed among them', async () => {
    const chatId = await addChat()
    await addMessage(chatId, {
      at: '2031-04-10T23:59:59.999Z',
      role: 'assistant',
      status: 'failed',
    })
    await addMessage(chatId, { at: since, role: 'assistant' })
    await addMessage(chatId, {
      at: '2031-04-11T01:00:00Z',
      role: 'assistant',
      status: 'failed',
    })
    await addMessage(chatId, {
      at: '2031-04-11T02:00:00Z',
      role: 'assistant',
      status: 'stopped',
    })
    await addMessage(chatId, { at: '2031-04-11T03:00:00Z' })

    const { turns } = await readSummary(`?since=${since}`)

    expect(turns).toEqual({
      since,
      count: 3,
      failed: 1,
      lastAt: '2031-04-11T02:00:00.000Z',
    })
  })

  it('reads a since with an offset as the same instant', async () => {
    const chatId = await addChat()
    await addMessage(chatId, { at: '2031-04-10T18:00:00Z', role: 'assistant' })

    const { turns } = await readSummary('?since=2031-04-11T01:00:00%2B07:00')

    expect(turns).toMatchObject({ since: '2031-04-10T18:00:00.000Z', count: 1 })
  })

  it('counts nothing for a since in the future and leaves the messages as they are', async () => {
    const chatId = await addChat()
    await addMessage(chatId, { at: '2031-04-11T10:00:00Z', role: 'assistant' })
    const before = await readSummary()

    const { turns, messages } = await readSummary('?since=2099-01-01T00:00:00Z')

    expect(turns).toMatchObject({
      count: 0,
      failed: 0,
      lastAt: '2031-04-11T10:00:00.000Z',
    })
    expect(messages).toEqual(before.messages)
  })

  it('reads the last 24 hours when since is absent', async () => {
    const chatId = await addChat()
    const hoursAgo = (hours: number) =>
      new Date(Date.now() - hours * 3_600_000).toISOString()
    await addMessage(chatId, { at: hoursAgo(25), role: 'assistant' })
    await addMessage(chatId, { at: hoursAgo(23), role: 'assistant' })

    const { turns } = await readSummary()

    expect(turns.count).toBe(1)
  })

  it('answers no last turn before the first reply', async () => {
    const { turns } = await readSummary()

    expect(turns).toMatchObject({ count: 0, failed: 0, lastAt: null })
  })
})

describe('GET /api/owner/summary assistant', () => {
  const open: FakeBridge[] = []

  afterEach(async () => {
    await Promise.all(open.splice(0).map((bridge) => bridge.close()))
  })

  it('reads the relay offline with no bridge socket', async () => {
    const { assistant } = await readSummary()

    expect(assistant).toMatchObject({
      online: false,
      model: 'lichtrinh-assistant',
    })
  })

  it('reads the relay online once the bridge says hello', async () => {
    open.push(await connectBridge())

    const { assistant } = await readSummary()

    expect(assistant.online).toBe(true)
  })
})

describe('GET /api/owner/summary response', () => {
  it('marks the answer no-store', async () => {
    const res = await requestSummary({ authorization: BEARER })

    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('logs the outcome, a count, and a duration, and no message text', async () => {
    const chatId = await addChat()
    await addMessage(chatId, {
      at: '2031-04-11T10:00:00Z',
      text: 'Invented private ask',
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await readSummary()

    const lines = log.mock.calls.map(([line]) => JSON.parse(String(line)))
    expect(lines).toEqual([
      { outcome: 'owner_summary_read', messages: 1, ms: expect.any(Number) },
    ])
  })
})
