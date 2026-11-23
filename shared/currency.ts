import { z } from 'zod'

let known: Set<string> | undefined

/** Whether `code` is an ISO 4217 code this runtime's `Intl` formats. */
export function isCurrency(code: string): boolean {
  known ??= new Set(Intl.supportedValuesOf('currency'))
  return known.has(code)
}

/**
 * How many digits a currency's minor unit carries, so a cost stored as an
 * integer in minor units reads back as money: VND 0, USD 2, KWD 3. Throws a
 * `RangeError` for a code `isCurrency` refuses.
 */
export function minorDigits(code: string): number {
  if (!isCurrency(code)) throw new RangeError(`Not a currency: ${code}`)
  return (
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
    }).resolvedOptions().maximumFractionDigits ?? 0
  )
}

export const currency = z.string().refine(isCurrency, 'Not a currency code')
