import {
  deriveKey,
  hashPassword,
  parsePasswordHash,
  PBKDF2_ITERATIONS,
} from './password-hash.ts'

const SALT = new Uint8Array(16).fill(7)

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

describe('deriveKey', () => {
  it('matches the RFC 7914 PBKDF2-HMAC-SHA256 vector', async () => {
    const key = await deriveKey('passwd', new TextEncoder().encode('salt'), 1)

    expect(hex(key)).toBe(
      '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc',
    )
  })
})

describe('hashPassword', () => {
  it('writes the scheme and the iteration count into the string', async () => {
    const stored = await hashPassword('abcdefghjkmn', SALT)

    expect(stored.startsWith(`pbkdf2-sha256$${PBKDF2_ITERATIONS}$`)).toBe(true)
  })

  it('writes 10,000 rounds, the count the free CPU cap was sized for', async () => {
    const stored = await hashPassword('abcdefghjkmn', SALT)

    expect(stored.startsWith('pbkdf2-sha256$10000$')).toBe(true)
  })

  it('round-trips through parse to the key the password derives', async () => {
    const stored = await hashPassword('abcdefghjkmn', SALT)

    const parsed = parsePasswordHash(stored)

    expect(parsed?.iterations).toBe(PBKDF2_ITERATIONS)
    expect(parsed?.key).toEqual(
      await deriveKey('abcdefghjkmn', SALT, PBKDF2_ITERATIONS),
    )
  })

  it('derives a different key for a wrong password', async () => {
    const parsed = parsePasswordHash(await hashPassword('abcdefghjkmn', SALT))

    const wrong = await deriveKey('abcdefghjkmm', SALT, PBKDF2_ITERATIONS)

    expect(parsed?.key).not.toEqual(wrong)
  })

  it('salts each hash afresh when no salt is passed', async () => {
    const first = await hashPassword('abcdefghjkmn')
    const second = await hashPassword('abcdefghjkmn')

    expect(first).not.toBe(second)
  })
})

describe('parsePasswordHash', () => {
  const salt = 'BwcHBwcHBwcHBwcHBwcHBw=='
  const key = 'A'.repeat(43) + '='

  it('reads a well-formed string', () => {
    const parsed = parsePasswordHash(`pbkdf2-sha256$100000$${salt}$${key}`)

    expect(parsed?.salt).toEqual(SALT)
    expect(parsed?.key).toHaveLength(32)
  })

  it.each([
    ['an empty string', ''],
    ['another scheme', `bcrypt$100000$${salt}$${key}`],
    ['a missing part', `pbkdf2-sha256$100000$${salt}`],
    ['an extra part', `pbkdf2-sha256$100000$${salt}$${key}$x`],
    ['zero iterations', `pbkdf2-sha256$0$${salt}$${key}`],
    ['a non-numeric count', `pbkdf2-sha256$lots$${salt}$${key}`],
    ['a count past the cap', `pbkdf2-sha256$99999999$${salt}$${key}`],
    ['an empty salt', `pbkdf2-sha256$100000$$${key}`],
    ['salt that is not base64', `pbkdf2-sha256$100000$!!!!$${key}`],
    ['a short key', `pbkdf2-sha256$100000$${salt}$AAAA`],
  ])('returns null for %s', (_case, stored) => {
    expect(parsePasswordHash(stored)).toBeNull()
  })
})
