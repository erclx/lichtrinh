import {
  generatePassword,
  groupInFours,
  PASSWORD_ALPHABET,
} from './generated-password.ts'

// Hands out the given bytes in order, as many as each call asks for.
function byteSource(bytes: number[]) {
  let next = 0
  return (count: number) => {
    const chunk = bytes.slice(next, next + count)
    next += count
    return Uint8Array.from(chunk)
  }
}

describe('generatePassword', () => {
  it('makes 12 characters from the alphabet', () => {
    const password = generatePassword()

    expect(password).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/)
  })

  it('leaves out the characters a reader mistakes for another', () => {
    expect(PASSWORD_ALPHABET).not.toMatch(/[01ilo]/)
  })

  it('maps each byte onto the alphabet by its remainder', () => {
    const password = generatePassword(
      byteSource([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 31]),
    )

    expect(password).toBe('abcdefghjkma')
  })

  it('skips a byte past the last whole run of the alphabet', () => {
    const password = generatePassword(
      byteSource([248, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 30]),
    )

    expect(password).toBe('aaaaaaaaaaa9')
  })
})

describe('groupInFours', () => {
  it('spaces a password into groups of four', () => {
    expect(groupInFours('abcdefghjkmn')).toBe('abcd efgh jkmn')
  })
})
