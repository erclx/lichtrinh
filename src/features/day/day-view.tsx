import { sumCosts } from '@shared/budget.ts'
import type { Entry } from '@shared/entries.ts'
import { localDate, nowInZone } from '@shared/trip-time.ts'
import type { Trip } from '@shared/trips.ts'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { useTrip } from '@/calendar-data/queries'
import { DayList } from '@/components/day-list'
import { dayRows } from '@/components/day-state'
import { HomeEstimate } from '@/components/home-estimate'
import { LoadFailed } from '@/components/load-failed'
import { RefreshFailed } from '@/components/refresh-failed'
import { Button, buttonVariants } from '@/components/ui/button'
import { useNow } from '@/hooks/use-now'
import { formatLongDate, formatMoney, formatWeekday } from '@/i18n/format'
import { useLanguage } from '@/i18n/use-language'
import { ApiFailure } from '@/lib/api'
import { datesBetween } from '@/lib/trip-days'
import { cn } from '@/lib/utils'
import { useOnline } from '@/offline/connection'
import { offlineReasonId, waitingClass } from '@/offline/offline-card'
import { ChevronIcon, PlusIcon } from '@/shell/icons'
import { PageHeader } from '@/shell/page-header'

interface DayViewProps {
  trip: Trip
  entries: Entry[]
  date: string
  /** Whether the page is Today, which has no Back since it is a top place. */
  isHome?: boolean
  /** Whether the last refresh failed, so the day shown may be out of date. */
  stale?: boolean
}

function tripPathOf(trip: Trip) {
  return `/trips/${encodeURIComponent(trip.id)}`
}

/**
 * One day of a trip: its date with Add, the trip and day number, the day's
 * estimated cost, the strip of the trip's days, and the day's one list.
 */
export function DayView({
  trip,
  entries,
  date,
  isHome = false,
  stale = false,
}: DayViewProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const now = useNow()
  const online = useOnline()
  const selectedRef = useRef<HTMLAnchorElement>(null)
  const days = datesBetween(trip.startsOn, trip.endsOn)
  const today = nowInZone(now, trip.timeZone).date
  const rows = dayRows(entries, date, now)
  const dayCost = sumCosts(rows.map(({ entry }) => entry))
  const tripPath = tripPathOf(trip)
  const addTo = `/entries/new?${new URLSearchParams({ trip: trip.id, date })}`
  const longDate = formatLongDate(date, language)
  const addClass = 'size-target px-0 min-[480px]:w-auto min-[480px]:px-6'
  const addLabel = (
    <>
      <PlusIcon className="size-7" />
      <span className="hidden min-[480px]:inline">{t('day.add')}</span>
    </>
  )

  // The strip scrolls sideways on phone, so the open day starts in view.
  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({
      block: 'nearest',
      inline: 'center',
    })
  }, [date])

  return (
    <>
      <PageHeader
        title={longDate}
        backTo={isHome ? undefined : tripPath}
        action={
          online ? (
            <Link
              to={addTo}
              aria-label={t('day.addOn', { date: longDate })}
              className={cn(buttonVariants(), addClass)}
            >
              {addLabel}
            </Link>
          ) : (
            // Offline the press waits for the connection, and the card's
            // sentence says why.
            <Button
              disabled
              focusableWhenDisabled
              aria-label={t('day.addOn', { date: longDate })}
              aria-describedby={offlineReasonId}
              className={cn(addClass, waitingClass)}
            >
              {addLabel}
            </Button>
          )
        }
      />

      <RefreshFailed show={stale} />

      <div className="flex flex-col gap-1 pb-4">
        <Link
          to={tripPath}
          className="inline-flex min-h-target items-center gap-1 self-start rounded-full text-base font-bold underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t('day.tripDay', {
            trip: trip.name,
            number: days.indexOf(date) + 1,
            total: days.length,
          })}
          <ChevronIcon className="size-5 shrink-0" />
        </Link>
        {dayCost !== null && (
          <p className="text-base text-muted-foreground">
            {t('day.estimated')}:{' '}
            <b className="text-foreground">
              {formatMoney(dayCost, trip.currency, language)}
            </b>
            <HomeEstimate
              amountMinor={dayCost}
              currency={trip.currency}
              homeCurrency={trip.homeCurrency}
              className="before:content-['_·_']"
            />
          </p>
        )}
      </div>

      <nav aria-label={t('day.daysLabel')} className="-mx-4 pb-4">
        <ul className="flex gap-2 scroll-px-4 overflow-x-auto px-4 py-1 [scrollbar-width:none]">
          {days.map((day) => {
            const selected = day === date
            return (
              <li key={day} className="shrink-0">
                <Link
                  ref={selected ? selectedRef : undefined}
                  to={`${tripPath}/days/${day}`}
                  aria-current={selected ? 'date' : undefined}
                  // Focus alone stops at the edge, so honor the scroll padding.
                  onFocus={(event) =>
                    event.currentTarget.scrollIntoView?.({
                      block: 'nearest',
                      inline: 'nearest',
                    })
                  }
                  aria-label={formatLongDate(day, language)}
                  className={cn(
                    'relative flex h-[72px] w-16 flex-col items-center justify-center rounded-lg border-[1.5px] border-border bg-secondary text-secondary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    selected &&
                      'border-primary bg-primary text-primary-foreground',
                  )}
                >
                  <span className="text-sm font-bold">
                    {formatWeekday(day, language)}
                  </span>
                  <span className="text-lg font-extrabold">
                    {Number(day.slice(8))}
                  </span>
                  {day === today && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-1.5 size-1.5 rounded-full bg-current"
                    />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <DayList rows={rows} currency={trip.currency} addTo={addTo} />
    </>
  )
}

/** The day route, `/trips/:tripId/days/:date`, which a reload returns to. */
export function DayPage() {
  const { t } = useTranslation()
  const { tripId, date } = useParams()
  const query = useTrip(tripId)
  const day = localDate.safeParse(date)

  if (query.isPending) {
    return (
      <>
        <PageHeader title={t('nav.trips')} backTo="/trips" />
        <p role="status" className="text-base text-muted-foreground">
          {t('shell.loading')}
        </p>
      </>
    )
  }

  if (query.isError && query.data === undefined) {
    const missing =
      query.error instanceof ApiFailure && query.error.code === 'not_found'
    return (
      <>
        <PageHeader title={t('nav.trips')} backTo="/trips" />
        {missing ? (
          <p className="text-base text-muted-foreground">
            {t('trips.notFound')}
          </p>
        ) : (
          <LoadFailed
            message={t('day.loadFailed')}
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
      </>
    )
  }

  const { trip, entries } = query.data
  if (!day.success || day.data < trip.startsOn || day.data > trip.endsOn) {
    return (
      <>
        <PageHeader title={trip.name} backTo={tripPathOf(trip)} />
        <p className="text-base text-muted-foreground">{t('day.notInTrip')}</p>
      </>
    )
  }

  return (
    <DayView
      trip={trip}
      entries={entries}
      date={day.data}
      stale={query.isError}
    />
  )
}
