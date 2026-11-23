import { convertMinor, findRate, type Rate, rateValue } from './rates.ts'

function stored(from: string, to: string, rate: string): Rate {
  return { from, to, rate, updatedAt: '2031-05-01T00:00:00.000Z' }
}

describe('rateValue', () => {
  it.each([
    ['a whole number', '25500'],
    ['a decimal', '25500.75'],
    ['a small decimal', '0.0000392'],
    ['twelve significant digits', '123456.789012'],
  ])('accepts %s', (_case, value) => {
    expect(rateValue.safeParse(value).success).toBe(true)
  })

  it.each([
    ['zero', '0'],
    ['zero with decimals', '0.000'],
    ['a negative', '-25500'],
    ['a grouping mark', '25,500'],
    ['an exponent', '2.55e4'],
    ['a leading zero', '025500'],
    ['a trailing point', '25500.'],
    ['thirteen significant digits', '1234567.890123'],
    ['an empty string', ''],
  ])('refuses %s', (_case, value) => {
    expect(rateValue.safeParse(value).success).toBe(false)
  })
})

describe('findRate', () => {
  it('reads a stored pair as typed', () => {
    const rates = [stored('USD', 'VND', '25500')]

    expect(findRate(rates, 'USD', 'VND')).toEqual({
      numerator: 25500n,
      denominator: 1n,
    })
  })

  it('inverts the reverse pair when only that is stored', () => {
    const rates = [stored('USD', 'VND', '25500.5')]

    expect(findRate(rates, 'VND', 'USD')).toEqual({
      numerator: 10n,
      denominator: 255005n,
    })
  })

  it('prefers the stored pair over its reverse', () => {
    const rates = [
      stored('VND', 'USD', '0.00004'),
      stored('USD', 'VND', '26000'),
    ]

    expect(findRate(rates, 'VND', 'USD')).toEqual({
      numerator: 4n,
      denominator: 100000n,
    })
  })

  it('answers null for a pair stored neither way', () => {
    const rates = [stored('USD', 'VND', '25500')]

    expect(findRate(rates, 'EUR', 'VND')).toBeNull()
  })

  it('answers one for the same currency on both sides', () => {
    expect(findRate([], 'VND', 'VND')).toEqual({
      numerator: 1n,
      denominator: 1n,
    })
  })
})

describe('convertMinor', () => {
  const usdToVnd = [stored('USD', 'VND', '25500')]

  it('converts VND to USD cents through the inverted rate', () => {
    const ratio = findRate(usdToVnd, 'VND', 'USD')
    if (ratio === null) throw new Error('No rate')

    expect(convertMinor(6_840_000, 'VND', 'USD', ratio)).toBe(26824n)
  })

  it('converts USD cents to VND through the stored rate', () => {
    const ratio = findRate(usdToVnd, 'USD', 'VND')
    if (ratio === null) throw new Error('No rate')

    expect(convertMinor(1_050, 'USD', 'VND', ratio)).toBe(267750n)
  })

  it('rounds a half up at the target minor unit', () => {
    const ratio = findRate([stored('USD', 'VND', '25550')], 'USD', 'VND')
    if (ratio === null) throw new Error('No rate')

    expect(convertMinor(1, 'USD', 'VND', ratio)).toBe(256n)
  })

  it('rounds just under a half down', () => {
    const ratio = findRate([stored('USD', 'VND', '25549.9')], 'USD', 'VND')
    if (ratio === null) throw new Error('No rate')

    expect(convertMinor(1, 'USD', 'VND', ratio)).toBe(255n)
    expect(convertMinor(2, 'USD', 'VND', ratio)).toBe(511n)
  })

  it('stays exact for the largest cost times a twelve-digit rate', () => {
    const ratio = findRate(
      [stored('VND', 'USD', '999999.999999')],
      'VND',
      'USD',
    )
    if (ratio === null) throw new Error('No rate')

    expect(convertMinor(Number.MAX_SAFE_INTEGER, 'VND', 'USD', ratio)).toBe(
      900719925473198380074526n,
    )
  })

  it('converts zero to zero', () => {
    const ratio = findRate(usdToVnd, 'VND', 'USD')
    if (ratio === null) throw new Error('No rate')

    expect(convertMinor(0, 'VND', 'USD', ratio)).toBe(0n)
  })
})
