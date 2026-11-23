import { costText, parseCost } from './cost'

describe('parseCost', () => {
  it.each([
    ['200.000', 'VND', 'vi', 200_000],
    ['200,000', 'VND', 'en', 200_000],
    ['200000', 'VND', 'en', 200_000],
    ['8,50', 'USD', 'vi', 850],
    ['8.50', 'USD', 'en', 850],
    ['12', 'USD', 'en', 1_200],
  ] as const)(
    'reads %s %s in %s as minor units',
    (text, currency, language, minor) => {
      expect(parseCost(text, currency, language)).toEqual({
        ok: true,
        minor,
      })
    },
  )

  it('reads an empty field as no cost', () => {
    expect(parseCost('  ', 'VND', 'vi')).toEqual({ ok: true, minor: null })
  })

  it.each([
    ['abc', 'VND', 'en'],
    ['-5', 'USD', 'en'],
    ['8.505', 'USD', 'en'],
  ] as const)('refuses %s', (text, currency, language) => {
    expect(parseCost(text, currency, language)).toEqual({ ok: false })
  })
})

describe('costText', () => {
  it.each([
    [200_000, 'VND', 'vi', '200.000'],
    [850, 'USD', 'en', '8.50'],
  ] as const)(
    'writes %s %s back as the field shows it in %s',
    (minor, currency, language, text) => {
      expect(costText(minor, currency, language)).toBe(text)
    },
  )
})
