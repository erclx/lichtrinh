import { minorDigits } from '@shared/currency.ts'

import type { Language } from './resources'

// A calendar day carries no zone, so each is placed at UTC midnight and
// formatted in UTC, keeping the day whatever zone the device sits in.
const zone = { timeZone: 'UTC' } as const

function utcDay(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

/** The month and year above a month grid, such as `September 2031`. `month` runs 1 to 12. */
export function formatMonthTitle(
  year: number,
  month: number,
  language: Language,
): string {
  const title = new Intl.DateTimeFormat(language, {
    ...zone,
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
  // Vietnamese opens on a lowercase `tháng`, which reads wrong as a heading.
  return title.charAt(0).toLocaleUpperCase(language) + title.slice(1)
}

// English narrow repeats T and S, and Vietnamese short is too wide for a phone.
const weekdayWidth = {
  vi: 'narrow',
  en: 'short',
} as const satisfies Record<Language, Intl.DateTimeFormatOptions['weekday']>

/** The seven weekday heads of a month grid, Monday first. */
export function weekdayLabels(language: Language): string[] {
  const format = new Intl.DateTimeFormat(language, {
    ...zone,
    weekday: weekdayWidth[language],
  })
  const aMonday = Date.UTC(2031, 8, 1)
  return Array.from({ length: 7 }, (_, offset) =>
    format.format(new Date(aMonday + offset * 86_400_000)),
  )
}

/** A day and month with no year, such as `20/9`, from a `YYYY-MM-DD` date. */
export function formatShortDate(date: string, language: Language): string {
  return new Intl.DateTimeFormat(language, {
    ...zone,
    day: 'numeric',
    month: 'numeric',
  }).format(utcDay(date))
}

/** A full date in digits, such as `20/9/2031`, from a `YYYY-MM-DD` date. */
export function formatNumericDate(date: string, language: Language): string {
  return new Intl.DateTimeFormat(language, {
    ...zone,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(utcDay(date))
}

/** A day heading, such as `Thursday, May 15`, from a `YYYY-MM-DD` date. */
export function formatLongDate(date: string, language: Language): string {
  return new Intl.DateTimeFormat(language, {
    ...zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(utcDay(date))
}

/** The short weekday, such as `Thu`, from a `YYYY-MM-DD` date. */
export function formatWeekday(date: string, language: Language): string {
  return new Intl.DateTimeFormat(language, {
    ...zone,
    weekday: 'short',
  }).format(utcDay(date))
}

/** A day on a chat card or step, such as `Fri, May 16`, from a `YYYY-MM-DD` date. */
export function formatCardDate(date: string, language: Language): string {
  return new Intl.DateTimeFormat(language, {
    ...zone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(utcDay(date))
}

/** A trip's span, such as `May 13 – 20, 2031`, from two `YYYY-MM-DD` dates. */
export function formatDateSpan(
  from: string,
  to: string,
  language: Language,
): string {
  return new Intl.DateTimeFormat(language, {
    ...zone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatRange(utcDay(from), utcDay(to))
}

/** A wall clock `HH:MM` on the 24-hour clock both languages read. */
export function formatTime(time: string, language: Language): string {
  return new Intl.DateTimeFormat(language, {
    ...zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(`1970-01-01T${time}:00Z`))
}

function unit(value: number, name: 'hour' | 'minute', language: Language) {
  return new Intl.NumberFormat(language, {
    style: 'unit',
    unit: name,
    unitDisplay: 'short',
  }).format(value)
}

/** A length in minutes as hours and minutes, such as `1 hr 15 min`. */
export function formatDuration(minutes: number, language: Language): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const parts = []
  if (hours > 0) parts.push(unit(hours, 'hour', language))
  if (rest > 0 || hours === 0) parts.push(unit(rest, 'minute', language))
  return parts.join(' ')
}

/** A cost stored in a currency's minor unit, read by that currency's digits. */
export function formatMoney(
  minor: number,
  currency: string,
  language: Language,
): string {
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency,
  }).format(minor / 10 ** minorDigits(currency))
}
