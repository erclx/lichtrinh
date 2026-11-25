import type { Change, EntryFields, TripFields } from '@shared/changes.ts'
import { minutesBetween } from '@shared/trip-time.ts'
import type { TFunction } from 'i18next'

import { kindLabelKey } from '@/components/kinds'
import {
  formatCardDate,
  formatDateSpan,
  formatMoney,
  formatTime,
} from '@/i18n/format'
import type { Language } from '@/i18n/resources'

interface Reading {
  /** The currency the trip was in when the change was made. */
  currency: string
  t: TFunction
  language: Language
}

function zoneName(zone: string, language: Language) {
  const part = new Intl.DateTimeFormat(language, {
    timeZone: zone,
    timeZoneName: 'longGeneric',
  })
    .formatToParts(new Date(0))
    .find(({ type }) => type === 'timeZoneName')
  return part?.value ?? zone
}

const startOf = (entry: EntryFields) => ({
  date: entry.startsOn,
  time: entry.startTime,
})

const endOf = (entry: EntryFields) => ({
  date: entry.endsOn,
  time: entry.endTime,
})

const sameClock = (
  a: { date: string; time: string },
  b: { date: string; time: string },
) => a.date === b.date && a.time === b.time

function timeSentence(
  before: EntryFields,
  after: EntryFields,
  { t, language }: Reading,
): string {
  const edited = t('history.edited', { title: after.title })
  const startMoved = !sameClock(startOf(before), startOf(after))
  const endMoved = !sameClock(endOf(before), endOf(after))
  const sameLength =
    minutesBetween(startOf(before), endOf(before)) ===
    minutesBetween(startOf(after), endOf(after))
  if (startMoved && endMoved && !sameLength) return edited

  const side = startMoved ? startOf : endOf
  const [was, is] = [side(before), side(after)]
  const read = (clock: { date: string; time: string }) =>
    was.date === is.date
      ? formatTime(clock.time, language)
      : `${formatTime(clock.time, language)} · ${formatCardDate(clock.date, language)}`
  const values = { title: after.title, from: read(was), to: read(is) }
  if (startMoved && endMoved) return t('history.moved', values)
  return startMoved
    ? t('history.changedStart', values)
    : t('history.changedEnd', values)
}

function entrySentence(
  before: EntryFields,
  after: EntryFields,
  reading: Reading,
): string {
  const { currency, t, language } = reading
  const { title } = after
  const kind = (entry: EntryFields) =>
    entry.kind === null ? t('history.noKind') : t(kindLabelKey[entry.kind])
  const cost = (entry: EntryFields) =>
    entry.costMinor === null
      ? t('history.noCost')
      : formatMoney(entry.costMinor, currency, language)

  const moved: (() => string)[] = []
  if (before.title !== after.title) {
    moved.push(() => t('history.renamed', { from: before.title, to: title }))
  }
  if (before.notes !== after.notes) {
    moved.push(() => t('history.changedNotes', { title }))
  }
  if (before.kind !== after.kind) {
    moved.push(() =>
      t('history.changedKind', { title, from: kind(before), to: kind(after) }),
    )
  }
  if (before.costMinor !== after.costMinor) {
    moved.push(() =>
      t('history.changedCost', { title, from: cost(before), to: cost(after) }),
    )
  }
  if (before.timeZone !== after.timeZone) {
    moved.push(() =>
      t('history.changedZone', {
        title,
        from: zoneName(before.timeZone, language),
        to: zoneName(after.timeZone, language),
      }),
    )
  }
  if (
    !sameClock(startOf(before), startOf(after)) ||
    !sameClock(endOf(before), endOf(after))
  ) {
    moved.push(() => timeSentence(before, after, reading))
  }
  return moved.length === 1 ? moved[0]() : t('history.edited', { title })
}

function tripSentence(
  before: TripFields,
  after: TripFields,
  { t, language }: Reading,
): string {
  const span = (trip: TripFields) =>
    formatDateSpan(trip.startsOn, trip.endsOn, language)

  const moved: (() => string)[] = []
  if (before.name !== after.name) {
    moved.push(() =>
      t('history.renamedTrip', { from: before.name, to: after.name }),
    )
  }
  if (before.startsOn !== after.startsOn || before.endsOn !== after.endsOn) {
    moved.push(() =>
      t('history.changedDates', { from: span(before), to: span(after) }),
    )
  }
  if (before.timeZone !== after.timeZone) {
    moved.push(() =>
      t('history.changedTripZone', {
        from: zoneName(before.timeZone, language),
        to: zoneName(after.timeZone, language),
      }),
    )
  }
  if (before.currency !== after.currency) {
    moved.push(() =>
      t('history.changedCurrency', {
        from: before.currency,
        to: after.currency,
      }),
    )
  }
  if (before.homeCurrency !== after.homeCurrency) {
    moved.push(() =>
      t('history.changedHomeCurrency', {
        from: before.homeCurrency,
        to: after.homeCurrency,
      }),
    )
  }
  return moved.length === 1
    ? moved[0]()
    : t('history.editedTrip', { title: after.name })
}

/**
 * The one sentence a change reads as, from its snapshots alone, so an undo
 * reads like any other change. One field moved is named with its values,
 * notes aside since they run long, and several read as an edit.
 */
export function describeChange(
  change: Change,
  currency: string,
  t: TFunction,
  language: Language,
): string {
  const reading = { currency, t, language }
  if (change.entity === 'trip') {
    const { before, after } = change
    if (before !== null && after !== null) {
      return tripSentence(before, after, reading)
    }
    const title = (after ?? before)?.name ?? ''
    return after === null
      ? t('history.removedTrip', { title })
      : t('history.addedTrip', { title })
  }
  const { before, after } = change
  if (before !== null && after !== null) {
    return entrySentence(before, after, reading)
  }
  const title = (after ?? before)?.title ?? ''
  return after === null
    ? t('history.removed', { title })
    : t('history.added', { title })
}
