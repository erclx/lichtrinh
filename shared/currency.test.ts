import { isCurrency, minorDigits } from './currency.ts'

describe('isCurrency', () => {
  it.each(['VND', 'USD', 'JPY', 'EUR'])('accepts %s', (code) => {
    expect(isCurrency(code)).toBe(true)
  })

  it.each([
    ['an unknown code', 'XYZ'],
    ['a lowercase code', 'usd'],
    ['a symbol', '$'],
    ['an empty string', ''],
  ])('refuses %s', (_case, code) => {
    expect(isCurrency(code)).toBe(false)
  })
})

describe('minorDigits', () => {
  it('gives VND no minor digits', () => {
    expect(minorDigits('VND')).toBe(0)
  })

  it('gives USD two minor digits', () => {
    expect(minorDigits('USD')).toBe(2)
  })

  it('gives a three-digit currency three', () => {
    expect(minorDigits('KWD')).toBe(3)
  })

  it('refuses a code that is not a currency', () => {
    expect(() => minorDigits('XYZ')).toThrow(RangeError)
  })
})
