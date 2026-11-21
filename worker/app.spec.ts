import { apiError } from '@shared/errors.ts'
import { health } from '@shared/health.ts'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { app, MAX_BODY_BYTES } from './app.ts'

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
  it('answers 404 with the not_found envelope', async () => {
    const res = await app.request('/api/nope', {}, env)

    expect(res.status).toBe(404)
    expect(apiError.parse(await res.json()).error.code).toBe('not_found')
  })

  it('answers JSON, never the app shell', async () => {
    const res = await app.request('/api/trips/abc', {}, env)

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
    const res = await app.request('/api/health', postBody(MAX_BODY_BYTES), env)

    expect(res.status).toBe(404)
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
