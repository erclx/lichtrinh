import { hashPassword } from '@shared/password-hash.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { verifyPassword } from './password.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('verifyPassword', () => {
  it('accepts the password the hash was made from', async () => {
    const stored = await hashPassword('abcdefghjkmn')

    expect(await verifyPassword('abcdefghjkmn', stored)).toBe(true)
  })

  it('refuses a password one character off', async () => {
    const stored = await hashPassword('abcdefghjkmn')

    expect(await verifyPassword('abcdefghjkmp', stored)).toBe(false)
  })

  it.each([
    ['no hash at all', null],
    ['an empty hash', ''],
    ['a malformed hash', 'pbkdf2-sha256$100000$not-base64$AAAA'],
    ['another scheme', '$2a$10$abcdefghijklmnopqrstuv'],
  ])('returns false rather than throwing for %s', async (_case, stored) => {
    expect(await verifyPassword('abcdefghjkmn', stored)).toBe(false)
  })

  // An unknown name has no hash, and skipping the derive would answer faster.
  it('still derives once when there is no hash to compare', async () => {
    const derive = vi.spyOn(crypto.subtle, 'deriveBits')

    await verifyPassword('abcdefghjkmn', null)

    expect(derive).toHaveBeenCalledTimes(1)
  })
})
