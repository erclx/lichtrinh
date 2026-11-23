import type { Trip } from '@shared/trips.ts'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { formatDateSpan, formatLongDate, weekdayLabels } from '@/i18n/format'
import { useLanguage } from '@/i18n/use-language'
import { cn } from '@/lib/utils'

import type { CalendarDay, TripOnDay } from './calendar-range'

interface MonthGridProps {
  weeks: CalendarDay[][]
  /** How many entries start on each date, absent for a date with none. */
  entryCounts: Map<string, number>
  today: string
  dayHref: (date: string) => string
  /** Where the empty legend's way back leads, absent when nothing is filtered. */
  showAllHref?: string
}

// Rounded ends mark where a trip starts and stops, since every band shares one
// neutral fill and a pastel belongs to an entry's kind alone.
function bandClass({ starts, ends }: TripOnDay, half: 'left' | 'right' | null) {
  return cn(
    'absolute inset-y-1 bg-muted',
    half === null && 'inset-x-0',
    half === 'left' && 'right-1/2 left-0',
    half === 'right' && 'right-0 left-1/2',
    starts && 'ml-0.5 rounded-l-2xl',
    ends && 'mr-0.5 rounded-r-2xl',
  )
}

function tripsIn(weeks: CalendarDay[][]): Trip[] {
  const seen = new Map<string, Trip>()
  for (const day of weeks.flat()) {
    if (!day.inMonth) continue
    for (const { trip } of day.trips) seen.set(trip.id, trip)
  }
  return [...seen.values()]
}

/** A Monday-first month of day links, each trip's days on a neutral band. */
export function MonthGrid({
  weeks,
  entryCounts,
  today,
  dayHref,
  showAllHref,
}: MonthGridProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const legend = tripsIn(weeks)

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-hidden="true"
        className="grid grid-cols-7 text-center text-sm font-extrabold text-muted-foreground"
      >
        {weekdayLabels(language).map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      <div role="list" className="grid grid-cols-7">
        {weeks.flat().map((day) => {
          if (!day.inMonth) {
            return <span key={day.date} aria-hidden="true" />
          }
          const count = entryCounts.get(day.date) ?? 0
          const isToday = day.date === today
          const split = day.trips.length > 1
          const label = [
            formatLongDate(day.date, language),
            ...day.trips.map(({ trip }) => trip.name),
            count > 0 ? t('calendar.entries', { count }) : null,
          ]
            .filter((part) => part !== null)
            .join(', ')
          return (
            <div key={day.date} role="listitem" className="relative">
              {day.trips.slice(0, 2).map((onDay, index) => (
                <span
                  key={onDay.trip.id}
                  aria-hidden="true"
                  className={bandClass(
                    onDay,
                    split ? (index === 0 ? 'left' : 'right') : null,
                  )}
                />
              ))}
              <Link
                to={dayHref(day.date)}
                aria-label={label}
                aria-current={isToday ? 'date' : undefined}
                className={cn(
                  'relative flex h-16 flex-col items-center justify-center rounded-2xl text-lg font-extrabold outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  isToday && 'border-[3px] border-foreground',
                )}
              >
                {Number(day.date.slice(8))}
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-1.5 rounded-full',
                    count > 0 ? 'bg-current' : 'bg-transparent',
                  )}
                />
              </Link>
            </div>
          )
        })}
      </div>

      {legend.length > 0 ? (
        <div className="flex flex-col gap-1 px-1">
          <h3 className="text-sm font-extrabold text-muted-foreground">
            {t('calendar.legend')}
          </h3>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-base">
            {legend.map((trip) => (
              <li key={trip.id} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-5 rounded-full bg-muted"
                />
                <span>
                  <b className="font-extrabold">{trip.name}</b>{' '}
                  <span className="text-muted-foreground">
                    {formatDateSpan(trip.startsOn, trip.endsOn, language)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 px-1">
          <p className="text-base text-muted-foreground">
            {t('calendar.noTripMonth')}
          </p>
          {showAllHref !== undefined && (
            <Link
              to={showAllHref}
              className="inline-flex min-h-target items-center rounded-full text-base font-bold underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {t('calendar.showAll')}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
