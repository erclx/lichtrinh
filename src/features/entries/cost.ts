import { minorDigits } from '@shared/currency.ts'

import type { Language } from '@/i18n/resources'

export type ParsedCost = { ok: true; minor: number | null } | { ok: false }

function separators(language: Language) {
  const parts = new Intl.NumberFormat(language).formatToParts(12_345.6)
  return {
    group: parts.find(({ type }) => type === 'group')?.value ?? ',',
    decimal: parts.find(({ type }) => type === 'decimal')?.value ?? '.',
  }
}

/**
 * Reads a typed cost as an integer in the currency's minor unit, taking the
 * active language's own group and decimal marks, so `200.000` is two hundred
 * thousand dong in Vietnamese. An empty field is no cost.
 */
export function parseCost(
  text: string,
  currency: string,
  language: Language,
): ParsedCost {
  const trimmed = text.replace(/\s/g, '')
  if (trimmed === '') return { ok: true, minor: null }
  const digits = minorDigits(currency)
  const { group, decimal } = separators(language)
  const plain = trimmed.split(group).join('')
  const [whole, fraction = '', ...extra] = plain.split(decimal)
  // A currency with no minor unit reads every mark as grouping.
  if (digits === 0 && fraction !== '') {
    return /^\d+$/.test(whole + fraction) && extra.length === 0
      ? { ok: true, minor: Number(whole + fraction) }
      : { ok: false }
  }
  if (
    extra.length > 0 ||
    !/^\d+$/.test(whole) ||
    !/^\d*$/.test(fraction) ||
    fraction.length > digits
  ) {
    return { ok: false }
  }
  return {
    ok: true,
    minor: Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0')),
  }
}

/** A stored cost written back the way the field takes it, with no currency sign. */
export function costText(
  minor: number,
  currency: string,
  language: Language,
): string {
  const digits = minorDigits(currency)
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits)
}
