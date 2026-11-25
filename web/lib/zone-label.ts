import type { Language } from '@/i18n/resources'

function offsetOf(zone: string, language: Language, at: Date) {
  const part = new Intl.DateTimeFormat(language, {
    timeZone: zone,
    timeZoneName: 'shortOffset',
  })
    .formatToParts(at)
    .find(({ type }) => type === 'timeZoneName')
  return part?.value ?? ''
}

function cityOf(zone: string) {
  return (zone.split('/').at(-1) ?? zone).replaceAll('_', ' ')
}

// Some runtimes still list a zone under a city's old name, as Chromium lists
// Asia/Saigon, so its current name joins the label and a search finds either.
const renamed: Record<string, string> = {
  'Asia/Saigon': 'Ho Chi Minh',
  'Asia/Calcutta': 'Kolkata',
  'Asia/Katmandu': 'Kathmandu',
  'Asia/Rangoon': 'Yangon',
  'Europe/Kiev': 'Kyiv',
}

/** A zone by its city and its offset at `at`, such as `Ho Chi Minh (GMT+7)`. */
export function zoneLabel(zone: string, language: Language, at: Date) {
  const city = cityOf(zone)
  const current = renamed[zone]
  const name = current === undefined ? city : `${current}, ${city}`
  return `${name} (${offsetOf(zone, language, at)})`
}
