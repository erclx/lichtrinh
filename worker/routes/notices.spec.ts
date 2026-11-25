import type { Language } from '@shared/auth.ts'
import { apiError } from '@shared/errors.ts'
import { noticeState, sentNotice } from '@shared/notices.ts'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { app } from '../app.ts'
import { createDb } from '../db/client.ts'
import {
  authSessions,
  notifyEmails,
  outageNotices,
  pushDevices,
  users,
} from '../db/schema.ts'
import type { FakeBridge } from '../test/bridge.ts'
import { connectBridge, sayVoice } from '../test/bridge.ts'
import { fakeDevice } from '../test/push.ts'
import { bare, json } from '../test/requests.ts'
import { signedIn } from '../test/users.ts'

interface SentEmail {
  to: string
  from: { email: string; name: string }
  subject: string
  text: string
}

const open: FakeBridge[] = []
let emails: SentEmail[] = []
let emailRefusal: { code: string } | null = null
let pushes: string[] = []
let pushStatus = 201

// Every send stops at these two stubs, so no real push or email goes out.
const testEnv: Env = {
  ...env,
  EMAIL: {
    send: async (message: unknown) => {
      if (emailRefusal !== null) throw emailRefusal
      emails.push(message as SentEmail)
      return { messageId: crypto.randomUUID() }
    },
  },
}

beforeEach(() => {
  emails = []
  emailRefusal = null
  pushes = []
  pushStatus = 201
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    pushes.push(String(input))
    return new Response(null, { status: pushStatus })
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(open.splice(0).map((bridge) => bridge.close()))
  const db = createDb(env.DB)
  await db.delete(outageNotices)
  await db.delete(pushDevices)
  await db.delete(notifyEmails)
  // So an admin an earlier case made is not whom this one's notice reaches.
  await db.update(users).set({ role: 'member' })
})

function request(path: string, init: RequestInit, withEnv: Env = testEnv) {
  return app.request(path, init, withEnv)
}

async function errorCode(res: Response) {
  return apiError.parse(await res.json()).error.code
}

function chatter(options: { language?: Language } = {}) {
  return signedIn({ canChat: true, ...options })
}

async function sessionOf(userId: string) {
  const row = await createDb(env.DB)
    .select({ id: authSessions.id })
    .from(authSessions)
    .where(eq(authSessions.userId, userId))
    .get()
  if (row === undefined) throw new Error('The account holds no session')
  return row.id
}

/** A signed-in admin with one way of hearing a notice, or both. */
async function adminWith(
  ways: { push?: boolean; email?: boolean },
  options: { language?: Language } = {},
) {
  const admin = await signedIn({ role: 'admin', ...options })
  const db = createDb(env.DB)
  const { endpoint, keys } = await fakeDevice()
  if (ways.push === true) {
    await db.insert(pushDevices).values({
      sessionId: await sessionOf(admin.user.id),
      endpoint,
      ...keys,
      createdAt: new Date(),
    })
  }
  const address = `${admin.user.username}@example.com`
  if (ways.email === true) {
    await db.insert(notifyEmails).values({
      userId: admin.user.id,
      address,
      timeZone: 'Asia/Ho_Chi_Minh',
      updatedAt: new Date(),
    })
  }
  return { ...admin, endpoint, address, keys }
}

function notify(cookie: string | undefined, kind: unknown = 'assistant') {
  return request('/api/notices', json('POST', { kind }, cookie))
}

async function readNotices(cookie: string, withEnv: Env = testEnv) {
  const res = await request('/api/notices', bare('GET', cookie), withEnv)
  expect(res.status).toBe(200)
  return noticeState.parse(await res.json())
}

function noticeRows() {
  return createDb(env.DB).select().from(outageNotices)
}

/** Brings the assistant up and takes it down again, which ends an outage. */
async function bounceAssistant() {
  const bridge = await connectBridge()
  await bridge.close()
}

describe('POST /api/notices', () => {
  it('sends one push and one email to the admin who chose both', async () => {
    const admin = await adminWith({ push: true, email: true })
    const { cookie, user } = await chatter()

    const res = await notify(cookie)

    expect(res.status).toBe(200)
    expect(sentNotice.parse(await res.json())).toMatchObject({
      byName: user.displayName,
      byMe: true,
    })
    expect(pushes).toEqual([admin.endpoint])
    expect(emails).toHaveLength(1)
    expect(emails[0]).toMatchObject({
      to: admin.address,
      from: { email: 'notices@example.com', name: 'Lịch trình' },
    })
  })

  it('reaches each admin by the way that admin chose', async () => {
    const byPush = await adminWith({ push: true })
    const byEmail = await adminWith({ email: true })
    const { cookie } = await chatter()

    await notify(cookie)

    expect(pushes).toEqual([byPush.endpoint])
    expect(emails.map(({ to }) => to)).toEqual([byEmail.address])
  })

  it("writes the email in its reader's language with the sender's name", async () => {
    await adminWith({ email: true }, { language: 'vi' })
    const { cookie, user } = await chatter({ language: 'en' })

    await notify(cookie, 'voice')

    expect(emails[0]?.subject).toBe('Lịch trình: giọng nói đang nghỉ')
    expect(emails[0]?.text).toMatch(
      new RegExp(
        `^${user.displayName} nhờ bật lại giọng nói lúc \\d\\d:\\d\\d\\. Mở cài đặt`,
      ),
    )
  })

  it('answers a second tap with the first notice and sends nothing', async () => {
    await adminWith({ push: true, email: true })
    const first = await chatter()
    const second = await chatter()
    const sent = sentNotice.parse(await (await notify(first.cookie)).json())

    const again = await notify(second.cookie)

    expect(again.status).toBe(200)
    expect(sentNotice.parse(await again.json())).toEqual({
      ...sent,
      byMe: false,
    })
    expect(pushes).toHaveLength(1)
    expect(emails).toHaveLength(1)
  })

  it('sends once for two accounts tapping at once', async () => {
    await adminWith({ push: true, email: true })
    const [first, second] = await Promise.all([chatter(), chatter()])

    const [one, two] = await Promise.all([
      notify(first.cookie),
      notify(second.cookie),
    ])

    const answers = [
      sentNotice.parse(await one.json()),
      sentNotice.parse(await two.json()),
    ]
    expect(answers.map(({ byMe }) => byMe).sort()).toEqual([false, true])
    expect(answers[0]?.sentAt).toBe(answers[1]?.sentAt)
    expect(pushes).toHaveLength(1)
    expect(emails).toHaveLength(1)
  })

  it('counts the assistant and voice apart', async () => {
    await adminWith({ push: true })
    const { cookie } = await chatter()
    await notify(cookie, 'assistant')

    await notify(cookie, 'voice')

    expect(pushes).toHaveLength(2)
  })

  it('keeps the notice when one of two ways fails', async () => {
    await adminWith({ push: true, email: true })
    emailRefusal = { code: 'E_SENDER_DOMAIN_NOT_CONFIGURED' }
    const { cookie } = await chatter()

    const res = await notify(cookie)

    expect(res.status).toBe(200)
    expect((await readNotices(cookie)).assistant?.byMe).toBe(true)
  })

  it('gives the notice back when every way fails, so a retry sends', async () => {
    const admin = await adminWith({ push: true, email: true })
    const { cookie } = await chatter()
    emailRefusal = { code: 'E_SENDER_DOMAIN_NOT_AVAILABLE' }
    pushStatus = 500

    const failed = await notify(cookie)

    expect(failed.status).toBe(502)
    expect(await errorCode(failed)).toBe('notice_failed')
    expect(await noticeRows()).toEqual([])

    emailRefusal = null
    expect((await notify(cookie)).status).toBe(200)
    expect(emails.map(({ to }) => to)).toEqual([admin.address])
  })

  it('answers notice_failed with no way set', async () => {
    await adminWith({})
    const { cookie } = await chatter()

    expect(await errorCode(await notify(cookie))).toBe('notice_failed')
    expect(await noticeRows()).toEqual([])
  })

  it('takes over a claim that crashed more than 30 seconds ago', async () => {
    const admin = await adminWith({ push: true })
    const { cookie, user } = await chatter()
    await createDb(env.DB)
      .insert(outageNotices)
      .values({
        kind: 'assistant',
        claimId: 'crashed',
        userId: user.id,
        claimedAt: new Date(Date.now() - 30_001),
        sentAt: null,
      })

    const res = await notify(cookie)

    expect(res.status).toBe(200)
    expect(pushes).toEqual([admin.endpoint])
  })

  it('opens a new outage once the assistant has come back', async () => {
    await adminWith({ push: true })
    const { cookie } = await chatter()
    await notify(cookie)
    await bounceAssistant()

    await notify(cookie)

    expect(pushes).toHaveLength(2)
  })

  it('opens a new voice outage once voice has come back', async () => {
    await adminWith({ push: true })
    const { cookie } = await chatter()
    const bridge = await connectBridge({ voice: true })
    open.push(bridge)
    await notify(cookie, 'voice')
    await sayVoice(bridge, true)
    await sayVoice(bridge, false)

    await notify(cookie, 'voice')

    expect(pushes).toHaveLength(2)
  })

  it('answers not_down while the assistant is up and writes nothing', async () => {
    await adminWith({ push: true })
    const { cookie } = await chatter()
    open.push(await connectBridge())

    const res = await notify(cookie)

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('not_down')
    expect(await noticeRows()).toEqual([])
    expect(pushes).toEqual([])
  })

  it('answers not_down while voice is up', async () => {
    const { cookie } = await chatter()
    const bridge = await connectBridge({ voice: true })
    open.push(bridge)
    await sayVoice(bridge, true)

    expect(await errorCode(await notify(cookie, 'voice'))).toBe('not_down')
  })

  it('refuses a kind it does not know', async () => {
    const { cookie } = await chatter()

    expect(await errorCode(await notify(cookie, 'printer'))).toBe(
      'validation_failed',
    )
  })

  it('refuses an admin', async () => {
    await adminWith({ push: true })
    const { cookie } = await signedIn({ role: 'admin', canChat: true })

    const res = await notify(cookie)

    expect(res.status).toBe(403)
    expect(pushes).toEqual([])
  })

  it('refuses an account without chat', async () => {
    const { cookie } = await signedIn({ canChat: false })

    expect((await notify(cookie)).status).toBe(403)
  })

  it('refuses a caller who is not signed in', async () => {
    expect((await notify(undefined)).status).toBe(401)
  })
})

describe('who a notice reaches', () => {
  it('skips a device whose session signed out', async () => {
    const admin = await adminWith({ push: true })
    const { cookie } = await chatter()
    await request('/api/auth/sign-out', bare('POST', admin.cookie))

    expect(await errorCode(await notify(cookie))).toBe('notice_failed')
    expect(pushes).toEqual([])
  })

  it('skips a device whose session expired', async () => {
    const admin = await adminWith({ push: true })
    const { cookie } = await chatter()
    await createDb(env.DB)
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(authSessions.userId, admin.user.id))

    await notify(cookie)

    expect(pushes).toEqual([])
  })

  it('skips an admin who was demoted', async () => {
    const admin = await adminWith({ push: true, email: true })
    const { cookie } = await chatter()
    await createDb(env.DB)
      .update(users)
      .set({ role: 'member' })
      .where(eq(users.id, admin.user.id))

    await notify(cookie)

    expect(pushes).toEqual([])
    expect(emails).toEqual([])
  })

  it('removes a device its push service no longer knows', async () => {
    await adminWith({ push: true })
    const { cookie } = await chatter()
    pushStatus = 410

    await notify(cookie)

    expect(await createDb(env.DB).select().from(pushDevices)).toEqual([])
  })
})

describe('GET /api/notices', () => {
  it('reads reachable only with a way set', async () => {
    const { cookie } = await chatter()
    expect((await readNotices(cookie)).reachable).toBe(false)

    await adminWith({ email: true })

    expect((await readNotices(cookie)).reachable).toBe(true)
  })

  it('reads unreachable while this copy holds no keys and no sender', async () => {
    await adminWith({ push: true, email: true })
    const { cookie } = await chatter()

    const state = await readNotices(cookie, {
      ...testEnv,
      VAPID_PRIVATE_KEY: undefined,
      NOTICE_FROM: undefined,
    })

    expect(state.reachable).toBe(false)
  })

  it('names the sender to another account after a reload', async () => {
    await adminWith({ push: true })
    const sender = await chatter()
    const reader = await chatter()
    await notify(sender.cookie)

    const { assistant, voice } = await readNotices(reader.cookie)

    expect(assistant).toMatchObject({
      byName: sender.user.displayName,
      byMe: false,
    })
    expect(voice).toBeNull()
  })

  it('reads no notice while a send is still under way', async () => {
    const { cookie, user } = await chatter()
    await createDb(env.DB).insert(outageNotices).values({
      kind: 'assistant',
      claimId: 'under-way',
      userId: user.id,
      claimedAt: new Date(),
      sentAt: null,
    })

    expect((await readNotices(cookie)).assistant).toBeNull()
  })

  it('reads no notice once the assistant is back, or down again', async () => {
    await adminWith({ push: true })
    const { cookie } = await chatter()
    await notify(cookie)

    const bridge = await connectBridge()
    expect((await readNotices(cookie)).assistant).toBeNull()
    await bridge.close()

    expect((await readNotices(cookie)).assistant).toBeNull()
  })

  it('answers no endpoint, key, or address', async () => {
    const admin = await adminWith({ push: true, email: true })
    const { cookie } = await chatter()
    await notify(cookie)

    const res = await request('/api/notices', bare('GET', cookie))

    const body = await res.text()
    expect(body).not.toContain(admin.endpoint)
    expect(body).not.toContain(admin.keys.auth)
    expect(body).not.toContain(admin.address)
  })

  it('refuses an account without chat', async () => {
    const { cookie } = await signedIn({ canChat: false })

    const res = await request('/api/notices', bare('GET', cookie))

    expect(res.status).toBe(403)
  })
})
