import { hashPassword } from '@shared/password-hash.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { verifyPassword } from './password.ts'

// Made at counts earlier than the one new hashes take, 100,000 and the 25,000
// staging rows hold. Each key is from Python's `hashlib.pbkdf2_hmac`, over a
// salt of sixteen 0x07 bytes.
const OLDER_HASH =
  'pbkdf2-sha256$100000$BwcHBwcHBwcHBwcHBwcHBw==$6RN8aBHbzAAyYJcF/vMbQ1W3I4x4aPQmBJOJa8VGvFA='
const STAGING_HASH =
  'pbkdf2-sha256$25000$BwcHBwcHBwcHBwcHBwcHBw==$RnltFYarYJyit1IaYRBzor4N+gfhqw4mjpFtmSxenk4='

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

  it('accepts a password whose hash was stored at an older count', async () => {
    expect(await verifyPassword('abcdefghjkmn', OLDER_HASH)).toBe(true)
  })

  it('accepts a password whose hash was stored at 25,000 rounds', async () => {
    expect(await verifyPassword('abcdefghjkmn', STAGING_HASH)).toBe(true)
  })

  it('refuses a wrong password against an older count', async () => {
    expect(await verifyPassword('abcdefghjkmp', OLDER_HASH)).toBe(false)
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
