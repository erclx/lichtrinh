import { user } from '@shared/auth.ts'
import { apiError } from '@shared/errors.ts'
import {
  createdUser,
  oneTimePassword,
  updatedUser,
  userList,
} from '@shared/users.ts'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { app } from '../app.ts'
import { createDb } from '../db/client.ts'
import { users } from '../db/schema.ts'
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

describe('PATCH /api/admin/users/:id', () => {
  function edit(cookie: string, id: string, body: unknown) {
    return app.request(
      `/api/admin/users/${id}`,
      json('PATCH', body, cookie),
      env,
    )
  }

  // Storage outlives each test in a file, so earlier admins are demoted first.
  async function onlyAdmins(count: number) {
    await createDb(env.DB)
      .update(users)
      .set({ role: 'member' })
      .where(eq(users.role, 'admin'))
    const admins = []
    for (let i = 0; i < count; i += 1) {
      admins.push(await signedIn({ role: 'admin' }))
    }
    return admins
  }

  async function roleOf(id: string) {
    const row = await createDb(env.DB)
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .get()
    return row?.role
  }

  async function adminCount() {
    const rows = await createDb(env.DB)
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'))
    return rows.length
  }

  it('changes the display name, role, chat flag, and language', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    const account = await addUser({ language: 'vi' })
    const changes = {
      displayName: 'Invented Aunt',
      role: 'admin',
      canChat: true,
      language: 'en',
    }

    const res = await edit(cookie, account.id, changes)

    expect(res.status).toBe(200)
    expect(updatedUser.parse(await res.json()).user).toMatchObject(changes)
  })

  it('shows the change on the next list', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    const account = await addUser()

    await edit(cookie, account.id, { canChat: true })

    const list = await app.request('/api/admin/users', bare('GET', cookie), env)
    const { users: listed } = userList.parse(await list.json())
    expect(listed.find((u) => u.id === account.id)?.canChat).toBe(true)
  })

  it('leaves the fields a body omits as they were', async () => {
    const { cookie } = await signedIn({ role: 'admin' })
    const account = await addUser({ canChat: true, language: 'en' })

    const res = await edit(cookie, account.id, { displayName: 'Renamed' })

    expect(updatedUser.parse(await res.json()).user).toMatchObject({
      displayName: 'Renamed',
      role: 'member',
      canChat: true,
      language: 'en',
    })
  })

  it('refuses to demote the only admin with last_admin', async () => {
    const [admin] = await onlyAdmins(1)

    const res = await edit(admin.cookie, admin.user.id, { role: 'member' })

    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('last_admin')
    expect(await roleOf(admin.user.id)).toBe('admin')
  })

  it('lets the only admin send their own role unchanged', async () => {
    const [admin] = await onlyAdmins(1)

    const res = await edit(admin.cookie, admin.user.id, {
      displayName: admin.user.displayName,
      role: 'admin',
      canChat: false,
      language: 'vi',
    })

    expect(res.status).toBe(200)
  })

  it('demotes one of two admins, then refuses the other', async () => {
    const [first, second] = await onlyAdmins(2)

    const demoted = await edit(first.cookie, second.user.id, {
      role: 'member',
    })
    const refused = await edit(first.cookie, first.user.id, {
      role: 'member',
    })

    expect(demoted.status).toBe(200)
    expect(refused.status).toBe(409)
    expect(await errorCode(refused)).toBe('last_admin')
  })

  it('keeps one admin when the last two are demoted together', async () => {
    const [first, second] = await onlyAdmins(2)

    await Promise.all([
      edit(first.cookie, first.user.id, { role: 'member' }),
      edit(first.cookie, second.user.id, { role: 'member' }),
    ])

    expect(await adminCount()).toBe(1)
  })

  it.each([
    ['an empty body', {}],
    ['a username', { username: 'renamed' }],
    ['an id', { id: 'another' }],
    ['a password hash', { passwordHash: 'x' }],
    ['a null language', { language: null }],
    ['an empty display name', { displayName: '  ' }],
  ])('refuses %s with validation_failed', async (_, body) => {
    const { cookie } = await signedIn({ role: 'admin' })
    const account = await addUser()

    const res = await edit(cookie, account.id, body)

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })

  it('answers not_found for an id no account holds', async () => {
    const { cookie } = await signedIn({ role: 'admin' })

    const res = await edit(cookie, 'no-such-account', { canChat: true })

    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('not_found')
  })

  it('refuses a member with forbidden', async () => {
    const { cookie } = await signedIn({ role: 'member' })
    const account = await addUser()

    const res = await edit(cookie, account.id, { canChat: true })

    expect(res.status).toBe(403)
  })

  it('applies to the edited account on its next me', async () => {
    const admin = await signedIn({ role: 'admin' })
    const member = await signedIn()

    await edit(admin.cookie, member.user.id, { role: 'admin', canChat: true })

    const me = await app.request(
      '/api/auth/me',
      bare('GET', member.cookie),
      env,
    )
    expect(user.parse(await me.json())).toMatchObject({
      role: 'admin',
      canChat: true,
    })
  })

  it('stops a demoted admin reaching the admin routes', async () => {
    const [first, second] = await onlyAdmins(2)

    await edit(first.cookie, second.user.id, { role: 'member' })

    const res = await app.request(
      '/api/admin/users',
      bare('GET', second.cookie),
      env,
    )
    expect(res.status).toBe(403)
  })
})
