import { pushWords } from '@shared/notice-text.ts'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDb } from '../db/client.ts'
import { authSessions, pushDevices } from '../db/schema.ts'
import { fakeDevice, fakeEndpoint } from '../test/push.ts'
import { addUser } from '../test/users.ts'
import { isPushEndpoint, sendPush, vapidKeys } from './push.ts'

const WORDS = pushWords(
  { kind: 'assistant', name: 'Invented Traveler', at: new Date() },
  'en',
)

function keys() {
  const vapid = vapidKeys(env, 'https://app.example.com')
  if (vapid === null) throw new Error('The test run holds no push keys')
  return vapid
}

/** A saved device on a live session, as the send reads it. */
async function savedDevice() {
  const db = createDb(env.DB)
  const user = await addUser({ role: 'admin', password: null })
  const sessionId = crypto.randomUUID()
  await db.insert(authSessions).values({
    id: sessionId,
    userId: user.id,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  })
  const { endpoint, keys: subscription } = await fakeDevice()
  const target = { sessionId, endpoint, ...subscription }
  await db.insert(pushDevices).values({ ...target, createdAt: new Date() })
  return target
}

async function savedEndpoints() {
  const rows = await createDb(env.DB).select().from(pushDevices)
  return rows.map(({ endpoint }) => endpoint)
}

function answerWith(status: number) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response(null, { status }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/invented',
    'https://updates.push.services.mozilla.com/wpush/v2/invented',
    'https://web.push.apple.com/invented',
    'https://wns2-by3p.notify.windows.com/w/?token=invented',
  ])('takes %s', (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(true)
  })

  it.each([
    'https://127.0.0.1/push',
    'http://fcm.googleapis.com/fcm/send/invented',
    'https://fcm.googleapis.com.example.com/invented',
    'https://notfcm.googleapis.com/invented',
    'https://evilpush.apple.com/invented',
    'https://push.apple.com.example.com/invented',
    'https://fcm.googleapis.com:8443/invented',
    'https://name:secret@fcm.googleapis.com/invented',
    'https://example.com/fcm.googleapis.com',
    'not a url',
  ])('refuses %s', (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(false)
  })
})

describe('vapidKeys', () => {
  it('answers null while either key is unset', () => {
    expect(
      vapidKeys({ ...env, VAPID_PRIVATE_KEY: undefined }, 'https://a.test'),
    ).toBeNull()
    expect(
      vapidKeys({ ...env, VAPID_PUBLIC_KEY: '' }, 'https://a.test'),
    ).toBeNull()
  })
})

describe('sendPush', () => {
  it('posts an encrypted push signed with the keys of this copy', async () => {
    const fetched = answerWith(201)
    const device = await savedDevice()

    const sent = await sendPush(createDb(env.DB), device, WORDS, keys())

    expect(sent).toBe(true)
    const [url, init] = fetched.mock.calls[0] ?? []
    expect(url).toBe(device.endpoint)
    const headers = new Headers(init?.headers)
    expect(headers.get('content-encoding')).toBe('aes128gcm')
    expect(headers.get('authorization')).toMatch(
      new RegExp(`^vapid t=.+, k=${env.VAPID_PUBLIC_KEY}$`),
    )
    expect(new TextDecoder().decode(init?.body as Uint8Array)).not.toContain(
      'Invented Traveler',
    )
  })

  it.each([404, 410])('removes the device on a %d', async (status) => {
    answerWith(status)
    const device = await savedDevice()

    const sent = await sendPush(createDb(env.DB), device, WORDS, keys())

    expect(sent).toBe(false)
    expect(await savedEndpoints()).not.toContain(device.endpoint)
  })

  it('keeps a device that subscribed again before the 410 came back', async () => {
    const device = await savedDevice()
    const again = fakeEndpoint('web.push.apple.com')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await createDb(env.DB).update(pushDevices).set({ endpoint: again })
      return new Response(null, { status: 410 })
    })
    await createDb(env.DB).delete(pushDevices)
    await createDb(env.DB)
      .insert(pushDevices)
      .values({ ...device, createdAt: new Date() })

    await sendPush(createDb(env.DB), device, WORDS, keys())

    expect(await savedEndpoints()).toEqual([again])
  })

  it('keeps the device when the service is failing', async () => {
    answerWith(503)
    const device = await savedDevice()

    const sent = await sendPush(createDb(env.DB), device, WORDS, keys())

    expect(sent).toBe(false)
    expect(await savedEndpoints()).toContain(device.endpoint)
  })

  it('reads a redirect as unsent and follows nothing', async () => {
    const fetched = answerWith(302)
    const device = await savedDevice()

    const sent = await sendPush(createDb(env.DB), device, WORDS, keys())

    expect(sent).toBe(false)
    expect(fetched.mock.calls[0]?.[1]?.redirect).toBe('manual')
  })

  it('gives up on a service that hangs', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          )
        }),
    )
    const device = await savedDevice()

    const sent = await sendPush(createDb(env.DB), device, WORDS, keys(), 20)

    expect(sent).toBe(false)
  })

  it('answers unsent on keys it cannot encrypt to', async () => {
    const fetched = answerWith(201)
    const device = { ...(await savedDevice()), p256dh: 'invented' }

    const sent = await sendPush(createDb(env.DB), device, WORDS, keys())

    expect(sent).toBe(false)
    expect(fetched).not.toHaveBeenCalled()
  })
})
