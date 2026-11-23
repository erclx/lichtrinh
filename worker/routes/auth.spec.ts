import { user } from '@shared/auth.ts'
import { apiError } from '@shared/errors.ts'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { app } from '../app.ts'
import { bare, cookieFrom } from '../test/requests.ts'
import { addUser, signedIn, signIn, TEST_PASSWORD } from '../test/users.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const SESSION_DAYS = 180

async function sessionExpiry(userId: string) {
  const row = await env.DB.prepare(
    'select expires_at from auth_sessions where user_id = ?',
  )
    .bind(userId)
    .first<{ expires_at: number }>()
  return row?.expires_at
}

async function setSessionExpiry(userId: string, expiresAt: number) {
  await env.DB.prepare(
    'update auth_sessions set expires_at = ? where user_id = ?',
  )
    .bind(expiresAt, userId)
    .run()
}

async function errorCode(res: Response) {
  return apiError.parse(await res.json()).error.code
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/auth/sign-in', () => {
  it('answers the signed-in user for a valid username and password', async () => {
    const account = await addUser({ language: 'en' })

    const res = await signIn(account.username, TEST_PASSWORD)

    expect(res.status).toBe(200)
    expect(user.parse(await res.json())).toMatchObject({
      id: account.id,
      username: account.username,
      language: 'en',
    })
  })

  it('accepts a username typed with a capital and surrounding spaces', async () => {
    const account = await addUser()

    const res = await signIn(
      ` ${account.username.toUpperCase()} `,
      TEST_PASSWORD,
    )

    expect(res.status).toBe(200)
  })

  it('sets an HttpOnly, Secure, SameSite=Lax session cookie', async () => {
    const account = await addUser()

    const res = await signIn(account.username, TEST_PASSWORD)

    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/^__Host-session=/)
    expect(cookie).toMatch(/; HttpOnly/)
    expect(cookie).toMatch(/; Secure/)
    expect(cookie).toMatch(/; SameSite=Lax/)
    expect(cookie).toMatch(/; Path=\//)
  })

  it('makes the cookie and the stored session last 180 days', async () => {
    const account = await addUser()
    const before = Date.now()

    const res = await signIn(account.username, TEST_PASSWORD)

    expect(res.headers.get('set-cookie')).toContain(
      `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
    )
    const expiry = await sessionExpiry(account.id)
    expect(expiry).toBeGreaterThanOrEqual(before + SESSION_DAYS * DAY_MS)
    expect(expiry).toBeLessThanOrEqual(Date.now() + SESSION_DAYS * DAY_MS)
  })

  it('stores a hash of the token rather than the token itself', async () => {
    const account = await addUser()

    const res = await signIn(account.username, TEST_PASSWORD)

    const token = cookieFrom(res).split('=')[1]
    const stored = await env.DB.prepare('select id from auth_sessions').all<{
      id: string
    }>()
    expect(stored.results.map((row) => row.id)).not.toContain(token)
  })

  it('refuses a wrong password with invalid_credentials', async () => {
    const account = await addUser()

    const res = await signIn(account.username, 'not-the-password')

    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('invalid_credentials')
  })

  it('answers an unknown username with the same body as a wrong password', async () => {
    const account = await addUser()

    const wrongPassword = await signIn(account.username, 'not-the-password')
    const unknownName = await signIn('nobody-by-this-name', 'not-the-password')

    expect(unknownName.status).toBe(wrongPassword.status)
    expect(await unknownName.text()).toBe(await wrongPassword.text())
  })

  it('refuses an account with no password as invalid_credentials', async () => {
    const account = await addUser({ password: null })

    const res = await signIn(account.username, TEST_PASSWORD)

    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('invalid_credentials')
  })

  it('refuses an account whose stored hash is malformed', async () => {
    const account = await addUser()
    await env.DB.prepare('update users set password_hash = ? where id = ?')
      .bind('pbkdf2-sha256$oops', account.id)
      .run()

    const res = await signIn(account.username, TEST_PASSWORD)

    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('invalid_credentials')
  })

  it('refuses a body missing the password with validation_failed', async () => {
    const res = await app.request(
      '/api/auth/sign-in',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'someone' }),
      },
      env,
    )

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })

  it('refuses a body that is not JSON with validation_failed', async () => {
    const res = await app.request(
      '/api/auth/sign-in',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"username":',
      },
      env,
    )

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })

  it('logs the user id and outcome but never the password', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const account = await addUser()

    const res = await signIn(account.username, TEST_PASSWORD)

    const logged = log.mock.calls.flat().join(' ')
    expect(logged).toContain(account.id)
    expect(logged).not.toContain(TEST_PASSWORD)
    expect(logged).not.toContain(cookieFrom(res).split('=')[1])
  })
})

describe('GET /api/auth/me', () => {
  it('answers the signed-in user', async () => {
    const { user: account, cookie } = await signedIn({ canChat: true })

    const res = await app.request('/api/auth/me', bare('GET', cookie), env)

    expect(res.status).toBe(200)
    expect(user.parse(await res.json())).toEqual({
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      role: 'member',
      canChat: true,
      language: 'vi',
    })
  })

  it('answers a null language for an account holding none', async () => {
    const { cookie } = await signedIn({ language: null })

    const res = await app.request('/api/auth/me', bare('GET', cookie), env)

    expect(user.parse(await res.json()).language).toBeNull()
  })

  it('refuses a signed-out caller with unauthenticated', async () => {
    const res = await app.request('/api/auth/me', {}, env)

    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('unauthenticated')
  })

  it('refuses a cookie that names no session', async () => {
    const res = await app.request(
      '/api/auth/me',
      bare('GET', '__Host-session=made-up-token'),
      env,
    )

    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('unauthenticated')
  })

  it('refuses a session past its expiry as if it were absent', async () => {
    const { user: account, cookie } = await signedIn()
    await setSessionExpiry(account.id, Date.now() - 1000)

    const res = await app.request('/api/auth/me', bare('GET', cookie), env)

    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('unauthenticated')
  })

  it('slides a session last renewed more than a day ago', async () => {
    const { user: account, cookie } = await signedIn()
    await setSessionExpiry(account.id, Date.now() + (SESSION_DAYS - 2) * DAY_MS)
    const before = Date.now()

    const res = await app.request('/api/auth/me', bare('GET', cookie), env)

    expect(res.headers.get('set-cookie')).toContain(
      `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
    )
    expect(await sessionExpiry(account.id)).toBeGreaterThanOrEqual(
      before + SESSION_DAYS * DAY_MS,
    )
  })

  it('leaves a session renewed within the day as it was', async () => {
    const { user: account, cookie } = await signedIn()
    const expiry = await sessionExpiry(account.id)

    const res = await app.request('/api/auth/me', bare('GET', cookie), env)

    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await sessionExpiry(account.id)).toBe(expiry)
  })
})

describe('POST /api/auth/sign-out', () => {
  it('deletes the session row and clears the cookie', async () => {
    const { user: account, cookie } = await signedIn()

    const res = await app.request(
      '/api/auth/sign-out',
      bare('POST', cookie),
      env,
    )

    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(await sessionExpiry(account.id)).toBeUndefined()
  })

  it('leaves the old cookie unauthenticated afterwards', async () => {
    const { cookie } = await signedIn()
    await app.request('/api/auth/sign-out', bare('POST', cookie), env)

    const res = await app.request('/api/auth/me', bare('GET', cookie), env)

    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('unauthenticated')
  })
})

describe('a signed-out caller', () => {
  it.each([
    ['GET', '/api/auth/me'],
    ['POST', '/api/auth/sign-out'],
    ['GET', '/api/settings'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/trips'],
  ])('gets unauthenticated from %s %s', async (method, path) => {
    const res = await app.request(path, bare(method), env)

    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('unauthenticated')
  })

  it('still reaches the health check', async () => {
    const res = await app.request('/api/health', {}, env)

    expect(res.status).toBe(200)
  })
})

describe('sign-in rate limit', () => {
  const FIFTEEN_MINUTES_S = 15 * 60
  let addressCount = 0

  // A documentation-range address per case, since the per-address count
  // persists across the cases in this file.
  function freshAddress() {
    addressCount += 1
    return `203.0.113.${addressCount}`
  }

  async function failTimes(username: string, times: number, address: string) {
    for (let i = 0; i < times; i++) {
      await signIn(username, 'not-the-password', address)
    }
  }

  async function failFromNewAddresses(username: string, times: number) {
    for (let i = 0; i < times; i++) {
      await signIn(username, 'not-the-password', freshAddress())
    }
  }

  async function failAsUnknownNames(times: number, address: string) {
    for (let i = 0; i < times; i++) {
      await signIn(`nobody-${i}`, 'not-the-password', address)
    }
  }

  it('still answers invalid_credentials on the tenth failure', async () => {
    const account = await addUser()
    const address = freshAddress()
    await failTimes(account.username, 9, address)

    const res = await signIn(account.username, 'not-the-password', address)

    expect(res.status).toBe(401)
  })

  it('refuses the eleventh attempt for a username with rate_limited', async () => {
    const account = await addUser()
    const address = freshAddress()
    await failTimes(account.username, 10, address)

    const res = await signIn(account.username, TEST_PASSWORD, address)

    expect(res.status).toBe(429)
    expect(await errorCode(res)).toBe('rate_limited')
  })

  it('names the seconds left in the window in Retry-After', async () => {
    const account = await addUser()
    const address = freshAddress()
    await failTimes(account.username, 10, address)

    const res = await signIn(account.username, TEST_PASSWORD, address)

    const retryAfter = Number(res.headers.get('retry-after'))
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(FIFTEEN_MINUTES_S)
  })

  it('counts the username whichever address the attempts come from', async () => {
    const account = await addUser()
    await failFromNewAddresses(account.username, 10)

    const res = await signIn(account.username, TEST_PASSWORD, freshAddress())

    expect(res.status).toBe(429)
  })

  it('counts every failure in a concurrent burst', async () => {
    const account = await addUser()
    const address = freshAddress()
    await Promise.all(
      Array.from({ length: 10 }, () =>
        signIn(account.username, 'not-the-password', address),
      ),
    )

    const res = await signIn(account.username, TEST_PASSWORD, address)

    expect(res.status).toBe(429)
  })

  it('starts the count over once the window has passed', async () => {
    const account = await addUser()
    const address = freshAddress()
    await failTimes(account.username, 10, address)
    await env.DB.prepare(
      'update sign_in_attempts set window_started_at = window_started_at - ?',
    )
      .bind(16 * 60 * 1000)
      .run()

    const res = await signIn(account.username, TEST_PASSWORD, address)

    expect(res.status).toBe(200)
  })

  it('clears the username count on a successful sign-in', async () => {
    const account = await addUser()
    const address = freshAddress()
    await failTimes(account.username, 9, address)
    await signIn(account.username, TEST_PASSWORD, address)
    await failTimes(account.username, 9, address)

    const res = await signIn(account.username, 'not-the-password', address)

    expect(res.status).toBe(401)
  })

  it('refuses the fifty-first failure from one address across usernames', async () => {
    const address = freshAddress()
    await failAsUnknownNames(50, address)
    const account = await addUser()

    const res = await signIn(account.username, TEST_PASSWORD, address)

    expect(res.status).toBe(429)
    expect(await errorCode(res)).toBe('rate_limited')
  })
})
