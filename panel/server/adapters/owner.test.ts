import type { OwnerSummary } from '@shared/owner.ts'
import { describe, expect, it } from 'vitest'

import { createOwnerReader } from './owner.ts'

const LINK = {
  url: 'https://lichtrinh.example.com',
  secret: 'invented-panel-secret',
}

const SUMMARY: OwnerSummary = {
  assistant: {
    online: true,
    lastAnsweredAt: '2031-11-22T14:21:00.000Z',
    model: 'lichtrinh-assistant',
  },
  turns: {
    since: '2031-11-22T00:00:00.000Z',
    count: 12,
    failed: 1,
    lastAt: '2031-11-22T14:21:00.000Z',
  },
  messages: [
    {
      id: 'm2',
      at: '2031-11-22T14:21:00.000Z',
      role: 'assistant',
      text: 'Xong, đã thêm ăn sáng.',
      status: 'complete',
      model: 'lichtrinh-assistant',
    },
  ],
}

/** An app that answers, refuses, or fails as a test sets it. */
function reader() {
  const clock = { now: new Date('2031-11-22T14:24:00Z') }
  const app = {
    respond: (): Promise<Response> => Promise.resolve(Response.json(SUMMARY)),
  }
  const requests: { url: URL; init?: RequestInit }[] = []
  const read = createOwnerReader(
    ((input: string, init?: RequestInit) => {
      requests.push({ url: new URL(input), init })
      return app.respond()
    }) as typeof fetch,
    LINK,
    () => clock.now,
  )
  return {
    read,
    app,
    requests,
    wait: (ms: number) => {
      clock.now = new Date(clock.now.getTime() + ms)
    },
  }
}

describe('createOwnerReader', () => {
  it('reads the summary with the secret as a bearer', async () => {
    const owner = reader()

    const read = await owner.read()

    expect(read).toEqual({
      reach: 'read',
      summary: SUMMARY,
      at: new Date('2031-11-22T14:24:00Z'),
    })
    const [request] = owner.requests
    expect(request?.url.origin + request?.url.pathname).toBe(
      'https://lichtrinh.example.com/api/owner/summary',
    )
    expect(new Headers(request?.init?.headers).get('authorization')).toBe(
      'Bearer invented-panel-secret',
    )
  })

  it('keeps the secret out of the address', async () => {
    const owner = reader()

    await owner.read()

    expect(owner.requests[0]?.url.href).not.toContain(LINK.secret)
  })

  it('counts turns from this machine’s midnight', async () => {
    const owner = reader()

    await owner.read()

    const since = new Date(
      owner.requests[0]?.url.searchParams.get('since') ?? '',
    )
    expect(since.toDateString()).toBe(
      new Date('2031-11-22T14:24:00Z').toDateString(),
    )
    expect([since.getHours(), since.getMinutes(), since.getSeconds()]).toEqual([
      0, 0, 0,
    ])
  })

  it('ends a read it cannot finish in time', async () => {
    const owner = reader()

    await owner.read()

    expect(owner.requests[0]?.init?.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    [
      'a refused secret',
      () => Promise.resolve(new Response('', { status: 401 })),
    ],
    [
      'a timeout',
      () => Promise.reject(new DOMException('timed out', 'TimeoutError')),
    ],
    ['a refused connection', () => Promise.reject(new TypeError('refused'))],
    [
      'a body that does not parse',
      () => Promise.resolve(Response.json({ messages: 'none' })),
    ],
  ])('reads %s as unreachable', async (_, respond) => {
    const owner = reader()
    owner.app.respond = respond

    expect(await owner.read()).toEqual({ reach: 'unreachable' })
  })

  it('keeps no rows from a good read once a later one fails', async () => {
    const owner = reader()
    await owner.read()
    owner.wait(30_000)
    owner.app.respond = () => Promise.reject(new TypeError('refused'))

    expect(await owner.read()).toEqual({ reach: 'unreachable' })
  })

  it('reads nothing until asked, and at most every thirty seconds', async () => {
    const owner = reader()
    owner.wait(10 * 60_000)
    const whileHidden = owner.requests.length

    await owner.read()
    owner.wait(29_999)
    await owner.read()
    const within = owner.requests.length
    owner.wait(1)
    await owner.read()

    expect(whileHidden).toBe(0)
    expect(within).toBe(1)
    expect(owner.requests).toHaveLength(2)
  })

  it('waits thirty seconds after a failed read too', async () => {
    const owner = reader()
    owner.app.respond = () => Promise.reject(new TypeError('refused'))

    await owner.read()
    owner.wait(10_000)
    await owner.read()

    expect(owner.requests).toHaveLength(1)
  })

  it('shares one request between reads that overlap', async () => {
    const owner = reader()

    await Promise.all([owner.read(), owner.read()])

    expect(owner.requests).toHaveLength(1)
  })
})
