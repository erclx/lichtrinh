import { apiError } from '@shared/errors.ts'
import { contactSettings } from '@shared/settings.ts'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { app } from '../app.ts'
import { bare, json } from '../test/requests.ts'
import { signedIn } from '../test/users.ts'

function putContact(cookie: string, contactName: unknown) {
  return app.request(
    '/api/admin/settings',
    json('PUT', { contactName }, cookie),
    env,
  )
}

async function readContact(cookie: string) {
  const res = await app.request('/api/settings', bare('GET', cookie), env)
  return contactSettings.parse(await res.json()).contactName
}

describe('GET /api/settings', () => {
  it('answers a null contact name before the admin sets one', async () => {
    const { cookie } = await signedIn()

    expect(await readContact(cookie)).toBeNull()
  })
})

describe('PUT /api/admin/settings', () => {
  it('sets the contact name a member then reads', async () => {
    const admin = await signedIn({ role: 'admin' })
    const member = await signedIn()

    const res = await putContact(admin.cookie, 'Invented Cousin')

    expect(res.status).toBe(200)
    expect(await readContact(member.cookie)).toBe('Invented Cousin')
  })

  it('clears the contact name when sent null', async () => {
    const admin = await signedIn({ role: 'admin' })
    await putContact(admin.cookie, 'Invented Cousin')

    await putContact(admin.cookie, null)

    expect(await readContact(admin.cookie)).toBeNull()
  })

  it('accepts a name of exactly 60 characters', async () => {
    const admin = await signedIn({ role: 'admin' })

    const res = await putContact(admin.cookie, 'x'.repeat(60))

    expect(res.status).toBe(200)
  })

  it('refuses a name past 60 characters with validation_failed', async () => {
    const admin = await signedIn({ role: 'admin' })

    const res = await putContact(admin.cookie, 'x'.repeat(61))

    expect(res.status).toBe(400)
    expect(apiError.parse(await res.json()).error.code).toBe(
      'validation_failed',
    )
  })

  it('refuses a member with forbidden and keeps the name', async () => {
    const admin = await signedIn({ role: 'admin' })
    await putContact(admin.cookie, 'Invented Cousin')
    const member = await signedIn()

    const res = await putContact(member.cookie, 'Someone Else')

    expect(res.status).toBe(403)
    expect(await readContact(admin.cookie)).toBe('Invented Cousin')
  })
})
