import type { Entry } from '@shared/entries.ts'
import type { Trip } from '@shared/trips.ts'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { kindTone } from '@/components/kinds'
import {
  formatDateSpan,
  formatLongDate,
  formatMoney,
  formatShortDate,
  formatWeekday,
} from '@/i18n/format'
import type { Language } from '@/i18n/resources'
import { useLanguage } from '@/i18n/use-language'
import { cn } from '@/lib/utils'
import { PlusIcon } from '@/shell/icons'

import { type CalendarDay, weekGroups } from './calendar-range'

interface WeekRowsProps {
  days: CalendarDay[]
  /** Every entry starting in the week, from any trip shown. */
  entries: Entry[]
  trips: Trip[]
  today: string
  dayHref: (date: string) => string
}

const focusRing =
  'outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background'

// A date two trips share can hold entries in two currencies, so each trip's
// total is formatted in its own and listed side by side.
function costsOf(dayEntries: Entry[], trips: Trip[], language: Language) {
  return trips.flatMap((trip) => {
    const costs = dayEntries.flatMap((entry) =>
      entry.tripId === trip.id && entry.costMinor !== null
        ? [entry.costMinor]
        : [],
    )
    if (costs.length === 0) return []
    const total = costs.reduce((sum, cost) => sum + cost, 0)
    return [formatMoney(total, trip.currency, language)]
  })
}

/** Seven rows from Monday, each trip's run of days on one neutral band. */
export function WeekRows({
  days,
  entries,
  trips,
  today,
  dayHref,
}: WeekRowsProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const lastDate = days.at(-1)?.date ?? ''

  function row(day: CalendarDay, trip: Trip | null) {
    const dayEntries = entries.filter((entry) => entry.startsOn === day.date)
    const costs = costsOf(dayEntries, trips, language)
    const longDate = formatLongDate(day.date, language)
    const isToday = day.date === today
    const label = [
      longDate,
      dayEntries.length > 0
        ? t('calendar.entries', { count: dayEntries.length })
        : t('calendar.free'),
      ...costs,
    ].join(', ')
    return (
      <li key={day.date} className="flex items-stretch gap-2">
        <Link
          to={dayHref(day.date)}
          aria-label={label}
          aria-current={isToday ? 'date' : undefined}
          className={cn(
            'flex min-h-target min-w-0 flex-1 items-center gap-3 rounded-[20px] border-[1.5px] border-border bg-card px-3.5 py-1.5 text-card-foreground',
            isToday && 'border-[3px] border-foreground',
            focusRing,
          )}
        >
          <span className="flex w-14 flex-none flex-col text-2xl leading-none font-extrabold">
            {Number(day.date.slice(8))}
            <small className="mt-0.5 text-[15px] font-bold text-muted-foreground">
              {formatWeekday(day.date, language)}
            </small>
          </span>
          <span className="flex min-w-0 flex-1 flex-col text-lg leading-snug text-muted-foreground">
            <span className="flex flex-wrap items-center gap-x-1.5 text-[19px] font-extrabold text-foreground">
              {dayEntries.length > 0
                ? t('calendar.entries', { count: dayEntries.length })
                : t('calendar.free')}
              {isToday && (
                <span className="rounded-full bg-primary px-2 text-sm text-primary-foreground">
                  {t('day.today')}
                </span>
              )}
            </span>
            {dayEntries.length === 0 ? (
              <span>{t('calendar.nothingPlanned')}</span>
            ) : (
              <span className="flex flex-wrap items-center gap-x-2.5">
                {costs.join(' · ')}
                <span aria-hidden="true" className="inline-flex gap-1.5">
                  {dayEntries.slice(0, 6).map((entry) => (
                    <span
                      key={entry.id}
                      className={cn(
                        'size-3.5 rounded-full border-[1.5px] border-foreground/40',
                        kindTone[entry.kind ?? 'none'],
                      )}
                    />
                  ))}
                </span>
              </span>
            )}
          </span>
        </Link>
        {trip !== null && (
          <Link
            to={`/entries/new?${new URLSearchParams({ trip: trip.id, date: day.date })}`}
            aria-label={t('day.addOn', { date: longDate })}
            className={cn(
              'flex w-16 flex-none items-center justify-center rounded-[20px] border-[1.5px] border-border bg-card text-card-foreground',
              focusRing,
            )}
          >
            <PlusIcon className="size-7" />
          </Link>
        )}
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {weekGroups(days).map((group) => {
        if (group.trip === null) {
          return (
            <ul key={group.days[0].date} className="flex flex-col gap-1.5">
              {group.days.map((day) => row(day, null))}
            </ul>
          )
        }
        const { trip } = group
        const groupEnd = group.days.at(-1)?.date ?? ''
        const continues = groupEnd === lastDate && trip.endsOn > lastDate
        const dates = formatDateSpan(trip.startsOn, trip.endsOn, language)
        return (
          <section
            key={group.days[0].date}
            aria-label={t('calendar.tripSpan', { trip: trip.name, dates })}
            className={cn(
              'flex flex-col gap-1.5 rounded-[26px] bg-muted px-2 pt-2 pb-1.5',
              continues && 'rounded-b-[8px]',
            )}
          >
            <div className="flex flex-wrap justify-between gap-x-2 px-2.5 pt-0.5 text-base font-bold text-muted-foreground">
              <b className="font-extrabold text-foreground">{trip.name}</b>
              <span>{dates}</span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {group.days.map((day) => row(day, trip))}
            </ul>
            {continues && (
              <p className="px-2.5 pb-0.5 text-[15px] font-bold text-muted-foreground">
                {t('calendar.continues', {
                  date: formatShortDate(trip.endsOn, language),
                })}
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}
