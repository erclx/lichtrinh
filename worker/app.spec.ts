import { apiError } from '@shared/errors.ts'
import { health } from '@shared/health.ts'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { app, MAX_BODY_BYTES } from './app.ts'
import { bare, TEST_ORIGIN } from './test/requests.ts'
import { signedIn } from './test/users.ts'

// A database whose every call fails with SQL and private text in the
// message, so a test can prove none of it leaves the Worker.
const LEAKY_MESSAGE = 'D1_ERROR: select secret_note from trips where id = 7'

function brokenDatabase(): D1Database {
  const fail = () => {
    throw new Error(LEAKY_MESSAGE)
  }
  return {
    prepare: fail,
    batch: fail,
    exec: fail,
    dump: fail,
    withSession: fail,
  } as unknown as D1Database
}

function postBody(bytes: number) {
  return { method: 'POST', body: 'x'.repeat(bytes) }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/health', () => {
  it('answers 200 with the shared health shape', async () => {
    const res = await app.request('/api/health', {}, env)

    expect(res.status).toBe(200)
    expect(health.parse(await res.json())).toEqual({ status: 'ok' })
  })
})

describe('unknown API paths', () => {
  it('answers a signed-in caller 404 with the not_found envelope', async () => {
    const { cookie } = await signedIn()

    const res = await app.request('/api/nope', bare('GET', cookie), env)

    expect(res.status).toBe(404)
    expect(apiError.parse(await res.json()).error.code).toBe('not_found')
  })

  it('answers JSON, never the app shell', async () => {
    const { cookie } = await signedIn()

    const res = await app.request('/api/trips/abc', bare('GET', cookie), env)

    expect(res.headers.get('content-type')).toMatch(/^application\/json/)
  })
})

describe('request body limit', () => {
  it('refuses a body one byte past the limit with body_too_large', async () => {
    const res = await app.request(
      '/api/health',
      postBody(MAX_BODY_BYTES + 1),
      env,
    )

    expect(res.status).toBe(413)
    expect(apiError.parse(await res.json()).error.code).toBe('body_too_large')
  })

  it('lets a body exactly at the limit through to routing', async () => {
    const { cookie } = await signedIn()

    const res = await app.request(
      '/api/health',
      {
        ...postBody(MAX_BODY_BYTES),
        headers: { 'content-type': 'application/json', cookie },
      },
      env,
    )

    expect(res.status).toBe(404)
  })
})

describe('an unsafe request with a body', () => {
  it('refuses a form post from another origin with forbidden', async () => {
    const res = await app.request(
      '/api/auth/sign-in',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'https://elsewhere.example',
        },
        body: 'username=someone&password=guess',
      },
      env,
    )

    expect(res.status).toBe(403)
    expect(apiError.parse(await res.json()).error.code).toBe('forbidden')
  })

  it('refuses a same-origin body that is not JSON with unsupported_media_type', async () => {
    const res = await app.request(
      '/api/auth/sign-in',
      {
        method: 'POST',
        headers: { 'content-type': 'text/xml', origin: TEST_ORIGIN },
        body: '<username>someone</username>',
      },
      env,
    )

    expect(res.status).toBe(415)
    expect(apiError.parse(await res.json()).error.code).toBe(
      'unsupported_media_type',
    )
  })
})

describe('an unsafe request with an empty body', () => {
  const emptyStream = () =>
    new ReadableStream({ start: (controller) => controller.close() })

  // A browser sends a bodiless POST this way through some servers and edges.
  it.each([
    ['an empty string', () => ''],
    ['a stream that ends at once', emptyStream],
  ])('lets %s through to the route as absent', async (_case, body) => {
    const { cookie } = await signedIn()

    const res = await app.request(
      '/api/auth/sign-out',
      { ...bare('POST', cookie), body: body() },
      env,
    )

    expect(res.status).toBe(204)
  })

  it('answers a route that needs a body as it answers an absent one', async () => {
    const absent = await app.request('/api/auth/sign-in', bare('POST'), env)

    const empty = await app.request(
      '/api/auth/sign-in',
      { ...bare('POST'), body: '' },
      env,
    )

    expect(empty.status).toBe(absent.status)
    expect(await empty.json()).toEqual(await absent.json())
  })

  it('refuses a one-byte plain body whose length header says zero', async () => {
    const { cookie } = await signedIn()

    const res = await app.request(
      '/api/auth/sign-out',
      {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          'content-length': '0',
          origin: TEST_ORIGIN,
          cookie,
        },
        body: 'x',
      },
      env,
    )

    expect(res.status).toBe(415)
    expect(apiError.parse(await res.json()).error.code).toBe(
      'unsupported_media_type',
    )
  })
})

describe('a thrown error in a route', () => {
  it('answers 500 with the internal_error envelope', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await app.request(
      '/api/health',
      {},
      { ...env, DB: brokenDatabase() },
    )

    expect(res.status).toBe(500)
    expect(apiError.parse(await res.json()).error.code).toBe('internal_error')
  })

  it('keeps the error message out of the body', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await app.request(
      '/api/health',
      {},
      { ...env, DB: brokenDatabase() },
    )

    expect(await res.text()).not.toContain('secret_note')
  })

  it('logs the route and outcome but not the error message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    await app.request('/api/health', {}, { ...env, DB: brokenDatabase() })

    const logged = log.mock.calls.flat().join(' ')
    expect(logged).toContain('internal_error')
    expect(logged).toContain('/api/health')
    expect(logged).not.toContain('secret_note')
  })
})
