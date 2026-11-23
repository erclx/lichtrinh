import { z } from 'zod'

import { currency, minorDigits } from './currency.ts'

const MAX_SIGNIFICANT = 12

// A decimal string rather than a number, so a rate the admin typed reads back
// digit for digit and conversion never passes money through a float.
const DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/

function significantDigits(decimal: string) {
  return decimal.replace('.', '').replace(/^0+/, '').length
}

/** How many of one currency a unit of another buys, such as `25500`. */
export const rateValue = z
  .string()
  .trim()
  .max(32)
  .regex(DECIMAL, 'A rate is a plain decimal number')
  .refine((value) => /[1-9]/.test(value), 'A rate is above zero')
  .refine(
    (value) => significantDigits(value) <= MAX_SIGNIFICANT,
    `A rate carries at most ${MAX_SIGNIFICANT} significant digits`,
  )

/** One stored rate: a unit of `from` buys `rate` of `to`. */
export const rate = z.strictObject({
  from: currency,
  to: currency,
  rate: rateValue,
  updatedAt: z.iso.datetime(),
})
export type Rate = z.infer<typeof rate>

/** Every stored rate, ordered by pair. */
export const rateList = z.strictObject({ rates: z.array(rate) })
export type RateList = z.infer<typeof rateList>

/** What the admin sends to set one pair's rate. */
export const setRateRequest = z.strictObject({ rate: rateValue })
export type SetRateRequest = z.input<typeof setRateRequest>

/** A rate as an exact fraction, so a unit of `from` buys `numerator / denominator` of `to`. */
export interface Ratio {
  numerator: bigint
  denominator: bigint
}

function ratioOf(decimal: string): Ratio {
  const [whole, fraction = ''] = decimal.split('.')
  return {
    numerator: BigInt(whole + fraction),
    denominator: 10n ** BigInt(fraction.length),
  }
}

/**
 * The rate from one currency to another, taken from the stored pair or by
 * inverting its reverse, and null when neither is stored. The same currency
 * on both sides is always one.
 */
export function findRate(
  rates: readonly Pick<Rate, 'from' | 'to' | 'rate'>[],
  from: string,
  to: string,
): Ratio | null {
  if (from === to) return { numerator: 1n, denominator: 1n }
  const stored = rates.find((each) => each.from === from && each.to === to)
  if (stored !== undefined) return ratioOf(stored.rate)
  const reverse = rates.find((each) => each.from === to && each.to === from)
  if (reverse === undefined) return null
  const { numerator, denominator } = ratioOf(reverse.rate)
  return { numerator: denominator, denominator: numerator }
}

/** `numerator / denominator` for non-negative operands, with a half rounding up. */
export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator)
}

/**
 * An amount in `from`'s minor unit converted to `to`'s minor unit at `ratio`,
 * rounding a half up. The math runs on `BigInt`, so a large amount times a
 * twelve-digit rate stays exact.
 */
export function convertMinor(
  amountMinor: number | bigint,
  from: string,
  to: string,
  ratio: Ratio,
): bigint {
  const amount = BigInt(amountMinor)
  const toScale = 10n ** BigInt(minorDigits(to))
  const fromScale = 10n ** BigInt(minorDigits(from))
  return divideHalfUp(
    amount * ratio.numerator * toScale,
    ratio.denominator * fromScale,
  )
}
