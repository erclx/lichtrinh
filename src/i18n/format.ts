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
