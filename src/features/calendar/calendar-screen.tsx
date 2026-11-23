import type { Entry } from '@shared/entries.ts'
import { localDate, nowInZone } from '@shared/trip-time.ts'
import type { Trip } from '@shared/trips.ts'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'

import { useEntries, useTrips } from '@/calendar-data/queries'
import { DayList } from '@/components/day-list'
import { dayRows } from '@/components/day-state'
import { LoadFailed } from '@/components/load-failed'
import { RefreshFailed } from '@/components/refresh-failed'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useNow } from '@/hooks/use-now'
import { formatDateSpan, formatLongDate, formatMonthTitle } from '@/i18n/format'
import { useLanguage } from '@/i18n/use-language'
import { cn } from '@/lib/utils'
import { ChevronIcon } from '@/shell/icons'
import { PageHeader } from '@/shell/page-header'

import {
  addDays,
  monthWeeks,
  shiftMonth,
  tripsOn,
  weekDays,
} from './calendar-range'
import { MonthGrid } from './month-grid'
import { TripFilter } from './trip-filter'
import { WeekRows } from './week-rows'

const calendarView = z.enum(['month', 'week', 'day'])
type CalendarView = z.infer<typeof calendarView>

interface CalendarAddress {
  view: CalendarView
  date: string
  trip: string | null
}

function hrefOf({ view, date, trip }: CalendarAddress) {
  const search = new URLSearchParams({ view, date })
  if (trip !== null) search.set('trip', trip)
  return `/calendar?${search}`
}

/** The device's own date, since All trips spans zones and none is the trip's. */
function deviceToday(now: Date) {
  return nowInZone(now, Intl.DateTimeFormat().resolvedOptions().timeZone).date
}

const navClass =
  'relative flex size-12 flex-none items-center justify-center rounded-full bg-muted outline-none after:absolute after:-inset-2 focus-visible:ring-3 focus-visible:ring-ring/50'

interface PeriodNavProps {
  title: string
  previous: { to: string; label: string }
  next: { to: string; label: string }
}

function PeriodNav({ title, previous, next }: PeriodNavProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <Link to={previous.to} aria-label={previous.label} className={navClass}>
        <ChevronLeftIcon aria-hidden="true" className="size-6" />
      </Link>
      <h2 className="text-center font-heading text-xl font-extrabold">
        {title}
      </h2>
      <Link to={next.to} aria-label={next.label} className={navClass}>
        <ChevronRightIcon aria-hidden="true" className="size-6" />
      </Link>
    </div>
  )
}

interface CalendarDayViewProps {
  date: string
  trips: Trip[]
  entries: Entry[]
  now: Date
  showAllHref?: string
}

/** Each trip on the date with its day list, or a way on when none falls there. */
function CalendarDayView({
  date,
  trips,
  entries,
  now,
  showAllHref,
}: CalendarDayViewProps) {
  const { t } = useTranslation()
  const onDay = tripsOn(date, trips)

  if (onDay.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border-[2.5px] border-dashed border-border p-6 text-center">
        <p className="text-base text-muted-foreground">
          {t('calendar.noTripDay')}
        </p>
        <Link
          to={showAllHref ?? '/trips/new'}
          className="inline-flex min-h-target items-center rounded-full text-base font-bold underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {showAllHref === undefined
            ? t('trips.newTrip')
            : t('calendar.showAll')}
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {onDay.map(({ trip }) => {
        const dayPath = `/trips/${encodeURIComponent(trip.id)}/days/${date}`
        return (
          <section key={trip.id} className="flex flex-col gap-2">
            <Link
              to={dayPath}
              aria-label={t('calendar.openDay', { trip: trip.name })}
              className="inline-flex min-h-target items-center gap-1 self-start rounded-full text-base font-bold underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {trip.name}
              <ChevronIcon className="size-5 shrink-0" />
            </Link>
            <DayList
              rows={dayRows(
                entries.filter((entry) => entry.tripId === trip.id),
                date,
                now,
              )}
              currency={trip.currency}
              addTo={`/entries/new?${new URLSearchParams({ trip: trip.id, date })}`}
            />
          </section>
        )
      })}
    </div>
  )
}

/**
 * The Calendar tab: every trip on one month, week, or day, narrowing to one
 * trip. The view, the date, and the trip live in the address, so a reload and
 * Back return to the same place.
 */
export function CalendarScreen() {
  const { t } = useTranslation()
  const language = useLanguage()
  const now = useNow()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const trips = useTrips()

  const allTrips = trips.data ?? []
  const selected =
    allTrips.find((trip) => trip.id === search.get('trip')) ?? null
  const shown = selected === null ? allTrips : [selected]
  const today =
    selected === null
      ? deviceToday(now)
      : nowInZone(now, selected.timeZone).date
  const view = calendarView.catch('month').parse(search.get('view'))
  const date = localDate.catch(today).parse(search.get('date'))
  const address: CalendarAddress = { view, date, trip: selected?.id ?? null }

  const weeks = monthWeeks(date, shown)
  const week = weekDays(date, shown)
  const range =
    view === 'month'
      ? { from: weeks[0][0].date, to: weeks.at(-1)?.[6].date ?? date }
      : view === 'week'
        ? { from: week[0].date, to: week[6].date }
        : { from: date, to: date }
  const entries = useEntries(
    trips.data === undefined
      ? undefined
      : selected === null
        ? range
        : { ...range, tripId: selected.id },
  )

  const go = (next: Partial<CalendarAddress>) => hrefOf({ ...address, ...next })
  const dayHref = (day: string) => go({ view: 'day', date: day })
  const showAllHref = selected === null ? undefined : go({ trip: null })

  function onSelectTrip(trip: Trip | null) {
    const next =
      trip === null
        ? { ...address, trip: null }
        : { ...address, trip: trip.id, date: trip.startsOn }
    void navigate(hrefOf(next))
  }

  function onSelectView(next: string | undefined) {
    const parsed = calendarView.safeParse(next)
    if (!parsed.success) return
    void navigate(go({ view: parsed.data }))
  }

  const failed =
    (trips.isError && trips.data === undefined) ||
    (entries.isError && entries.data === undefined)

  const period =
    view === 'month'
      ? {
          title: formatMonthTitle(
            Number(date.slice(0, 4)),
            Number(date.slice(5, 7)),
            language,
          ),
          previous: {
            to: go({ date: shiftMonth(date, -1) }),
            label: t('controls.previousMonth'),
          },
          next: {
            to: go({ date: shiftMonth(date, 1) }),
            label: t('controls.nextMonth'),
          },
        }
      : view === 'week'
        ? {
            title: formatDateSpan(week[0].date, week[6].date, language),
            previous: {
              to: go({ date: addDays(date, -7) }),
              label: t('calendar.previousWeek'),
            },
            next: {
              to: go({ date: addDays(date, 7) }),
              label: t('calendar.nextWeek'),
            },
          }
        : {
            title: formatLongDate(date, language),
            previous: {
              to: go({ date: addDays(date, -1) }),
              label: t('calendar.previousDay'),
            },
            next: {
              to: go({ date: addDays(date, 1) }),
              label: t('calendar.nextDay'),
            },
          }

  const counts = new Map<string, number>()
  for (const entry of entries.data ?? []) {
    counts.set(entry.startsOn, (counts.get(entry.startsOn) ?? 0) + 1)
  }

  return (
    <>
      <PageHeader title={t('nav.calendar')} />

      <div className="flex flex-col gap-3">
        <ToggleGroup
          aria-label={t('calendar.views')}
          value={[view]}
          onValueChange={([next]) => onSelectView(next)}
        >
          {calendarView.options.map((option) => (
            <ToggleGroupItem key={option} value={option}>
              {t(`calendar.${option}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <TripFilter
          trips={allTrips}
          selected={selected?.id ?? null}
          onSelect={onSelectTrip}
        />
      </div>

      <RefreshFailed show={trips.isError || entries.isError} />

      {failed ? (
        <LoadFailed
          message={t('calendar.loadFailed')}
          error={trips.error ?? entries.error}
          onRetry={() => {
            void trips.refetch()
            if (entries.isError) void entries.refetch()
          }}
        />
      ) : (
        <div
          className={cn(
            'flex flex-col gap-2 pt-2',
            view === 'month' &&
              'rounded-3xl border-[1.5px] border-border bg-card p-2 text-card-foreground sm:p-4',
          )}
        >
          <PeriodNav {...period} />
          {trips.isPending || entries.isPending ? (
            <p role="status" className="text-base text-muted-foreground">
              {t('shell.loading')}
            </p>
          ) : view === 'month' ? (
            <MonthGrid
              weeks={weeks}
              entryCounts={counts}
              today={today}
              dayHref={dayHref}
              showAllHref={showAllHref}
            />
          ) : view === 'week' ? (
            <WeekRows
              days={week}
              entries={entries.data}
              trips={shown}
              today={today}
              dayHref={dayHref}
            />
          ) : (
            <CalendarDayView
              date={date}
              trips={shown}
              entries={entries.data}
              now={now}
              showAllHref={showAllHref}
            />
          )}
        </div>
      )}
    </>
  )
}
