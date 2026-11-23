import { user } from '@shared/auth.ts'
import { apiError } from '@shared/errors.ts'
import { createdUser, oneTimePassword, userList } from '@shared/users.ts'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { app } from '../app.ts'
import { bare, cookieFrom, json } from '../test/requests.ts'
import { addUser, signedIn, signIn, TEST_PASSWORD } from '../test/users.ts'

// Plain, so the screens group it for reading and copy it whole.
const PLAIN_PASSWORD = /^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/

let created = 0
function newUsername() {
  created += 1
  return `invented-${created}`
}

function createAccount(cookie: string, body: Record<string, unknown>) {
  return app.request('/api/admin/users', json('POST', body, cookie), env)
}

async function errorCode(res: Response) {
  return apiError.parse(await res.json()).error.code
}

describe('POST /api/admin/users', () => {
  it('creates a member and returns a generated password once', async () => {
    const { cookie } = await signedIn({ role: 'admin' })

    const res = await createAccount(cookie, {
      username: newUsername(),
      displayName: 'Invented Cousin',
    })

    expect(res.status).toBe(201)
    const body = createdUser.parse(await res.json())
    expect(body.password).toMatch(PLAIN_PASSWORD)
    expect(body.user).toMatchObject({ role: 'member', canChat: false })
  })

  it('makes an account that signs in with the returned password', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    const username = newUsername()
    const res = await createAccount(cookie, {
      username,
      displayName: 'Invented Cousin',
    })
    const { password } = createdUser.parse(await res.json())

    const signedInRes = await signIn(username, password)

    expect(signedInRes.status).toBe(200)
  })

  it('gives an account created with no language vi on me', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    const username = newUsername()
    const res = await createAccount(cookie, {
      username,
      displayName: 'Invented Cousin',
    })
    const { password } = createdUser.parse(await res.json())
    const session = cookieFrom(await signIn(username, password))

    const me = await app.request('/api/auth/me', bare('GET', session), env)

    expect(user.parse(await me.json()).language).toBe('vi')
  })

  it('keeps the language the admin names', async () => {
    const { cookie } = await signedIn({ role: 'admin' })

    const res = await createAccount(cookie, {
      username: newUsername(),
      displayName: 'Invented Cousin',
      language: 'en',
    })

    expect(createdUser.parse(await res.json()).user.language).toBe('en')
  })

  it('keeps the role and chat flag the admin names', async () => {
    const { cookie } = await signedIn({ role: 'admin' })

    const res = await createAccount(cookie, {
      username: newUsername(),
      displayName: 'Invented Traveler',
      canChat: true,
    })

    expect(createdUser.parse(await res.json()).user.canChat).toBe(true)
  })

  it('refuses a username already taken with username_taken', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    const username = newUsername()
    await createAccount(cookie, { username, displayName: 'First' })

    const res = await createAccount(cookie, {
      username,
      displayName: 'Second',
    })

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('username_taken')
  })

  it('refuses a username with a space with validation_failed', async () => {
    const { cookie } = await signedIn({ role: 'admin' })

    const res = await createAccount(cookie, {
      username: 'two words',
      displayName: 'Invented Cousin',
    })

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })

  it('refuses a member with forbidden', async () => {
    const { cookie } = await signedIn({ role: 'member' })

    const res = await createAccount(cookie, {
      username: newUsername(),
      displayName: 'Invented Cousin',
    })

    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('forbidden')
  })
})

describe('GET /api/admin/users', () => {
  it('lists accounts by username without any password hash', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    await createAccount(cookie, { username: 'zz-last', displayName: 'Z' })
    await createAccount(cookie, { username: 'aa-first', displayName: 'A' })

    const res = await app.request('/api/admin/users', bare('GET', cookie), env)

    const { users } = userList.parse(await res.json())
    const names = users.map((u) => u.username)
    expect(names).toEqual([...names].sort())
    expect(names).toContain('aa-first')
  })

  it('refuses a member with forbidden', async () => {
    const { cookie } = await signedIn({ role: 'member' })

    const res = await app.request('/api/admin/users', bare('GET', cookie), env)

    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('forbidden')
  })
})

describe('POST /api/admin/users/:id/password', () => {
  function reset(cookie: string, id: string) {
    return app.request(
      `/api/admin/users/${id}/password`,
      bare('POST', cookie),
      env,
    )
  }

  it('returns a new password the account then signs in with', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    const account = await addUser()

    const res = await reset(cookie, account.id)

    expect(res.status).toBe(200)
    const { password } = oneTimePassword.parse(await res.json())
    expect(password).toMatch(PLAIN_PASSWORD)
    expect((await signIn(account.username, password)).status).toBe(200)
  })

  it('stops the old password working', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    const account = await addUser()

    await reset(cookie, account.id)

    expect((await signIn(account.username, TEST_PASSWORD)).status).toBe(401)
  })

  it('ends every session the account held', async () => {
    const admin = await signedIn({ role: 'admin' })
    const member = await signedIn()

    await reset(admin.cookie, member.user.id)

    const me = await app.request(
      '/api/auth/me',
      bare('GET', member.cookie),
      env,
    )
    expect(me.status).toBe(401)
  })

  it('answers not_found for an id no account holds', async () => {
    const { cookie } = await signedIn({ role: 'admin' })

    const res = await reset(cookie, 'no-such-account')

    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('not_found')
  })

  it('refuses a member with forbidden', async () => {
    const { cookie } = await signedIn({ role: 'member' })
    const account = await addUser()

    const res = await reset(cookie, account.id)

    expect(res.status).toBe(403)
  })
})
