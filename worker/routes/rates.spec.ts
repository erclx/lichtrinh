import { apiError } from '@shared/errors.ts'
import { rate, rateList } from '@shared/rates.ts'
import { contactSettings } from '@shared/settings.ts'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { app } from '../app.ts'
import { bare, json } from '../test/requests.ts'
import { signedIn } from '../test/users.ts'

// Storage persists across this file's cases, so each case names its own pair.

function putRate(cookie: string, path: string, body: unknown) {
  return app.request(`/api/admin/rates/${path}`, json('PUT', body, cookie), env)
}

function clearRate(cookie: string, path: string) {
  return app.request(`/api/admin/rates/${path}`, bare('DELETE', cookie), env)
}

async function readRates(cookie: string) {
  const res = await app.request('/api/rates', bare('GET', cookie), env)
  return rateList.parse(await res.json()).rates
}

async function errorCode(res: Response) {
  return apiError.parse(await res.json()).error.code
}

describe('PUT /api/admin/rates/:from/:to', () => {
  it('sets a rate a member then reads', async () => {
    const admin = await signedIn({ role: 'admin' })
    const member = await signedIn()

    const res = await putRate(admin.cookie, 'USD/VND', { rate: '25500' })

    expect(res.status).toBe(200)
    expect(rate.parse(await res.json())).toMatchObject({
      from: 'USD',
      to: 'VND',
      rate: '25500',
    })
    expect(await readRates(member.cookie)).toContainEqual(
      expect.objectContaining({ from: 'USD', to: 'VND', rate: '25500' }),
    )
  })

  it('replaces the rate on a repeat set', async () => {
    const admin = await signedIn({ role: 'admin' })
    await putRate(admin.cookie, 'EUR/VND', { rate: '27000' })

    await putRate(admin.cookie, 'EUR/VND', { rate: '27400.5' })

    const eur = (await readRates(admin.cookie)).filter(
      ({ from }) => from === 'EUR',
    )
    expect(eur).toEqual([expect.objectContaining({ rate: '27400.5' })])
  })

  it('clears the reverse pair, so one rate answers both ways', async () => {
    const admin = await signedIn({ role: 'admin' })
    await putRate(admin.cookie, 'JPY/THB', { rate: '0.23' })

    await putRate(admin.cookie, 'THB/JPY', { rate: '4.3' })

    const pairs = (await readRates(admin.cookie))
      .filter(({ from, to }) => [from, to].includes('JPY'))
      .map(({ from, to }) => `${from}:${to}`)
    expect(pairs).toEqual(['THB:JPY'])
  })

  it.each([
    ['an unknown currency', 'USD/XYZ', { rate: '1' }],
    ['a lowercase code', 'usd/VND', { rate: '1' }],
    ['a pair of one currency', 'VND/VND', { rate: '1' }],
    ['a zero rate', 'GBP/VND', { rate: '0' }],
    ['a negative rate', 'GBP/VND', { rate: '-3' }],
    ['a rate sent as a number', 'GBP/VND', { rate: 32000 }],
  ])('refuses %s with validation_failed', async (_case, path, body) => {
    const admin = await signedIn({ role: 'admin' })

    const res = await putRate(admin.cookie, path, body)

    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })

  it('refuses a member with forbidden and stores nothing', async () => {
    const member = await signedIn()

    const res = await putRate(member.cookie, 'AUD/VND', { rate: '16000' })

    expect(res.status).toBe(403)
    const aud = (await readRates(member.cookie)).filter(
      ({ from }) => from === 'AUD',
    )
    expect(aud).toEqual([])
  })

  it('leaves the contact name read answering its one field', async () => {
    const admin = await signedIn({ role: 'admin' })
    await putRate(admin.cookie, 'SGD/VND', { rate: '19000' })

    const res = await app.request(
      '/api/settings',
      bare('GET', admin.cookie),
      env,
    )

    expect(contactSettings.parse(await res.json())).toEqual({
      contactName: null,
    })
  })
})

describe('DELETE /api/admin/rates/:from/:to', () => {
  it('clears a stored rate', async () => {
    const admin = await signedIn({ role: 'admin' })
    await putRate(admin.cookie, 'CAD/VND', { rate: '18500' })

    const res = await clearRate(admin.cookie, 'CAD/VND')

    expect(res.status).toBe(204)
    const cad = (await readRates(admin.cookie)).filter(
      ({ from }) => from === 'CAD',
    )
    expect(cad).toEqual([])
  })

  it('clears the pair when named in reverse', async () => {
    const admin = await signedIn({ role: 'admin' })
    await putRate(admin.cookie, 'KRW/VND', { rate: '18.4' })

    await clearRate(admin.cookie, 'VND/KRW')

    const krw = (await readRates(admin.cookie)).filter(
      ({ from }) => from === 'KRW',
    )
    expect(krw).toEqual([])
  })

  it('refuses a member with forbidden', async () => {
    const member = await signedIn()

    const res = await clearRate(member.cookie, 'USD/VND')

    expect(res.status).toBe(403)
  })
})

describe('GET /api/rates', () => {
  it('refuses a signed-out caller', async () => {
    const res = await app.request('/api/rates', bare('GET'), env)

    expect(res.status).toBe(401)
  })
})
