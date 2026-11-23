import { z } from 'zod'

import { ApiFailure, apiFetch, onUnauthenticated } from '@/lib/api'

const thing = z.strictObject({ name: z.string() })

function respondWith(response: Response | Error) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function envelope(code: string, status: number, headers?: HeadersInit) {
  return Response.json(
    { error: { code, message: 'English text for developers' } },
    { status, headers },
  )
}

async function failureOf(promise: Promise<unknown>): Promise<ApiFailure> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ApiFailure) return error
    throw error
  }
  throw new Error('expected the call to fail')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('returns the body parsed through the schema', async () => {
    respondWith(Response.json({ name: 'Sông Mây' }))

    const result = await apiFetch('/things/1', { schema: thing })

    expect(result).toEqual({ name: 'Sông Mây' })
  })

  it('sends a body as same-origin JSON under /api', async () => {
    const fetch = respondWith(Response.json({ name: 'a' }))

    await apiFetch('/things', {
      method: 'POST',
      body: { name: 'a' },
      schema: thing,
    })

    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/things')
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('same-origin')
    expect(new Headers(init?.headers).get('content-type')).toBe(
      'application/json',
    )
    expect(init?.body).toBe('{"name":"a"}')
  })

  it('declares JSON on a POST with no body', async () => {
    const fetch = respondWith(new Response(null, { status: 204 }))

    await apiFetch('/auth/sign-out', { method: 'POST' })

    const [, init] = fetch.mock.calls[0]
    expect(new Headers(init?.headers).get('content-type')).toBe(
      'application/json',
    )
  })

  it('sends a blob raw under its own type', async () => {
    const fetch = respondWith(Response.json({ name: 'a' }))
    const clip = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' })

    await apiFetch('/clips/1', { method: 'PUT', blob: clip, schema: thing })

    const [, init] = fetch.mock.calls[0]
    expect(new Headers(init?.headers).get('content-type')).toBe('audio/mp4')
    expect(init?.body).toBe(clip)
  })

  it('maps a refused blob send to ApiFailure', async () => {
    respondWith(envelope('voice_unavailable', 503))
    const clip = new Blob([new Uint8Array([1])], { type: 'audio/webm' })

    const failure = await failureOf(
      apiFetch('/clips/1', { method: 'PUT', blob: clip, schema: thing }),
    )

    expect(failure.code).toBe('voice_unavailable')
    expect(failure.status).toBe(503)
  })

  it('resolves with nothing for an empty success when no schema is given', async () => {
    respondWith(new Response(null, { status: 204 }))

    await expect(
      apiFetch('/auth/sign-out', { method: 'POST' }),
    ).resolves.toBeUndefined()
  })

  it('throws the envelope code and status on a failure', async () => {
    respondWith(envelope('username_taken', 409))

    const failure = await failureOf(apiFetch('/admin/users', { schema: thing }))

    expect(failure.code).toBe('username_taken')
    expect(failure.status).toBe(409)
    expect(failure.retryAfter).toBeNull()
  })

  it('reads Retry-After in seconds on a 429', async () => {
    respondWith(envelope('rate_limited', 429, { 'Retry-After': '540' }))

    const failure = await failureOf(
      apiFetch('/auth/sign-in', { method: 'POST', schema: thing }),
    )

    expect(failure.code).toBe('rate_limited')
    expect(failure.retryAfter).toBe(540)
  })

  it('throws unexpected_response for a failure body outside the envelope', async () => {
    respondWith(new Response('<html>Bad gateway</html>', { status: 502 }))

    const failure = await failureOf(apiFetch('/things/1', { schema: thing }))

    expect(failure.code).toBe('unexpected_response')
    expect(failure.status).toBe(502)
  })

  it('throws unexpected_response for a success body the schema refuses', async () => {
    respondWith(Response.json({ title: 'wrong shape' }))

    const failure = await failureOf(apiFetch('/things/1', { schema: thing }))

    expect(failure.code).toBe('unexpected_response')
  })

  it('throws network with status 0 when the request never answers', async () => {
    respondWith(new TypeError('Failed to fetch'))

    const failure = await failureOf(apiFetch('/things/1', { schema: thing }))

    expect(failure.code).toBe('network')
    expect(failure.status).toBe(0)
  })

  it('tells the unauthenticated listener about a 401 unauthenticated', async () => {
    respondWith(envelope('unauthenticated', 401))
    const heard = vi.fn()
    const stop = onUnauthenticated(heard)

    await failureOf(apiFetch('/admin/users', { schema: thing }))
    stop()

    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('leaves the listener alone for a wrong password', async () => {
    respondWith(envelope('invalid_credentials', 401))
    const heard = vi.fn()
    const stop = onUnauthenticated(heard)

    await failureOf(apiFetch('/auth/sign-in', { method: 'POST' }))
    stop()

    expect(heard).not.toHaveBeenCalled()
  })
})
