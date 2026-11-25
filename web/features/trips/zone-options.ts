import type { SheetListOption } from '@/components/sheet-list'
import type { Language } from '@/i18n/resources'
import { zoneLabel } from '@/lib/zone-label'

/** The zone this device sits in, which a new trip starts on. */
export function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
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
