import { assistantStatus } from '@shared/assistant.ts'
import { PROTOCOL_MISMATCH, REPLACED } from '@shared/bridge-frames.ts'
import { apiError } from '@shared/errors.ts'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'

import { app } from '../app.ts'
import { createDb } from '../db/client.ts'
import { settings } from '../db/schema.ts'
import type { FakeBridge } from '../test/bridge.ts'
import {
  connectBridge,
  requestBridgeSocket,
  TEST_BRIDGE_SECRET,
} from '../test/bridge.ts'
import { chatterWithChat, sendMessage } from '../test/chats.ts'
import { bare } from '../test/requests.ts'
import { signedIn } from '../test/users.ts'

const open: FakeBridge[] = []

async function bridgeOnline() {
  const bridge = await connectBridge()
  open.push(bridge)
  return bridge
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((bridge) => bridge.close()))
})

async function readStatus(cookie: string) {
  const res = await app.request(
    '/api/assistant/status',
    bare('GET', cookie),
    env,
  )
  expect(res.status).toBe(200)
  return assistantStatus.parse(await res.json())
}

async function errorCode(res: Response) {
  return apiError.parse(await res.json()).error.code
}

describe('GET /api/assistant/status', () => {
  it('reads offline with no bridge socket', async () => {
    const { cookie } = await signedIn()

    expect(await readStatus(cookie)).toEqual({
      online: false,
      lastAnsweredAt: null,
      model: 'lichtrinh-assistant',
    })
  })

  it('reads online once the bridge says hello', async () => {
    const { cookie } = await signedIn()
    await bridgeOnline()

    expect((await readStatus(cookie)).online).toBe(true)
  })

  it('reads offline again once the bridge closes', async () => {
    const { cookie } = await signedIn()
    const bridge = await connectBridge()

    await bridge.close()

    expect((await readStatus(cookie)).online).toBe(false)
  })

  it('names the model the admin set', async () => {
    const { cookie, user } = await signedIn({ role: 'admin' })
    await createDb(env.DB).insert(settings).values({
      key: 'assistant_model',
      value: 'lichtrinh-assistant-gemma',
      updatedAt: new Date(),
      updatedBy: user.id,
    })

    expect((await readStatus(cookie)).model).toBe('lichtrinh-assistant-gemma')

    await createDb(env.DB).delete(settings)
  })

  it('falls back to the default model on a stored name it does not know', async () => {
    const { cookie, user } = await signedIn({ role: 'admin' })
    await createDb(env.DB).insert(settings).values({
      key: 'assistant_model',
      value: 'some-cloud-model',
      updatedAt: new Date(),
      updatedBy: user.id,
    })

    expect((await readStatus(cookie)).model).toBe('lichtrinh-assistant')

    await createDb(env.DB).delete(settings)
  })

  it('refuses a caller who is not signed in', async () => {
    const res = await app.request('/api/assistant/status', bare('GET'), env)

    expect(res.status).toBe(401)
  })
})

describe('GET /api/bridge/connect', () => {
  it('refuses a wrong secret and opens no socket', async () => {
    const res = await requestBridgeSocket('Bearer not-the-secret')

    expect(res.status).toBe(401)
    expect(res.webSocket).toBeNull()
  })

  it('refuses a missing secret and opens no socket', async () => {
    const res = await requestBridgeSocket()

    expect(res.status).toBe(401)
    expect(res.webSocket).toBeNull()
  })

  it('refuses the secret sent without the bearer scheme', async () => {
    const res = await requestBridgeSocket(TEST_BRIDGE_SECRET)

    expect(res.status).toBe(401)
  })

  it('refuses a request that is not a socket upgrade', async () => {
    const res = await app.request(
      '/api/bridge/connect',
      { headers: { authorization: `Bearer ${TEST_BRIDGE_SECRET}` } },
      env,
    )

    expect(res.status).toBe(426)
  })

  it('closes a bridge speaking another protocol and stays offline', async () => {
    const { cookie } = await signedIn()
    const bridge = await connectBridge({ protocol: 99, awaitReady: false })

    expect((await bridge.closed).code).toBe(PROTOCOL_MISMATCH)
    expect((await readStatus(cookie)).online).toBe(false)
  })

  it('closes the older socket when a second bridge connects', async () => {
    const { cookie } = await signedIn()
    const older = await connectBridge()

    await bridgeOnline()

    expect((await older.closed).code).toBe(REPLACED)
    expect((await readStatus(cookie)).online).toBe(true)
  })
})

describe('POST /api/assistant/warm', () => {
  it('asks the bridge to load the current model', async () => {
    const { cookie } = await signedIn({ canChat: true })
    const bridge = await bridgeOnline()

    const res = await app.request(
      '/api/assistant/warm',
      bare('POST', cookie),
      env,
    )

    expect(res.status).toBe(202)
    expect(await bridge.next()).toEqual({
      type: 'warm',
      model: 'lichtrinh-assistant',
    })
  })

  it('answers assistant_unavailable with no bridge socket', async () => {
    const { cookie } = await signedIn({ canChat: true })

    const res = await app.request(
      '/api/assistant/warm',
      bare('POST', cookie),
      env,
    )

    expect(res.status).toBe(503)
    expect(await errorCode(res)).toBe('assistant_unavailable')
  })

  it('refuses an account that cannot chat', async () => {
    const { cookie } = await signedIn({ canChat: false })

    const res = await app.request(
      '/api/assistant/warm',
      bare('POST', cookie),
      env,
    )

    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('forbidden')
  })
})

describe('a send with the workspace PC off', () => {
  it('answers 503 assistant_unavailable with no bridge socket', async () => {
    const { cookie, chat } = await chatterWithChat()

    const res = await sendMessage(cookie, chat.id)

    expect(res.status).toBe(503)
    expect(await errorCode(res)).toBe('assistant_unavailable')
  })
})
