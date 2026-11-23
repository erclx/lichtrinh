import type { SheetListOption } from '@/components/sheet-list'
import type { Language } from '@/i18n/resources'

/** The zone this device sits in, which a new trip starts on. */
export function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

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

export function zoneLabel(zone: string, language: Language, at: Date) {
  const city = cityOf(zone)
  const current = renamed[zone]
  const name = current === undefined ? city : `${current}, ${city}`
  return `${name} (${offsetOf(zone, language, at)})`
}

/**
 * Every zone `Intl` knows, labeled with its city and its offset at `at`, such
 * as `Ho Chi Minh (GMT+7)`, in alphabetical order of the label. The device's
 * own zone joins the list when the runtime leaves it out, as some do for UTC.
 */
export function zoneOptions(language: Language, at: Date): SheetListOption[] {
  const zones = new Set(Intl.supportedValuesOf('timeZone'))
  zones.add(deviceZone())
  const collator = new Intl.Collator(language)
  return [...zones]
    .map((zone) => ({ value: zone, label: zoneLabel(zone, language, at) }))
    .sort((a, b) => collator.compare(a.label, b.label))
}

/**
 * Every currency `Intl` formats, labeled with its code and its name in the
 * active language, such as `VND · Vietnamese Dong`, in code order.
 */
export function currencyOptions(language: Language): SheetListOption[] {
  const names = new Intl.DisplayNames(language, { type: 'currency' })
  return Intl.supportedValuesOf('currency').map((code) => ({
    value: code,
    label: `${code} · ${names.of(code) ?? code}`,
  }))
}
