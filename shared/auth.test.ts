import { languageUpdate, signInRequest } from './auth.ts'

describe('signInRequest', () => {
  it('lowercases and trims a username a phone keyboard capitalized', () => {
    const parsed = signInRequest.parse({
      username: ' Traveler ',
      password: 'abcd',
    })

    expect(parsed.username).toBe('traveler')
  })

  it('drops the grouping spaces typed inside a password', () => {
    const parsed = signInRequest.parse({
      username: 'traveler',
      password: 'abcd efgh jkmn',
    })

    expect(parsed.password).toBe('abcdefghjkmn')
  })

  it('refuses a password made only of spaces', () => {
    const result = signInRequest.safeParse({
      username: 'traveler',
      password: '   ',
    })

    expect(result.success).toBe(false)
  })
})

describe('languageUpdate', () => {
  it.each([['vi'], ['en']])('accepts %s', (value) => {
    expect(languageUpdate.parse({ language: value })).toEqual({
      language: value,
    })
  })

  it('refuses a language other than vi or en', () => {
    expect(languageUpdate.safeParse({ language: 'fr' }).success).toBe(false)
  })

  it('refuses a body naming another account', () => {
    const result = languageUpdate.safeParse({ language: 'en', id: 'other' })

    expect(result.success).toBe(false)
  })
})
