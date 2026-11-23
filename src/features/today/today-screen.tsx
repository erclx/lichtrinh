import { nowInZone } from '@shared/trip-time.ts'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useTrip, useTrips } from '@/calendar-data/queries'
import { LoadFailed } from '@/components/load-failed'
import { NoTrips } from '@/components/no-trips'
import { buttonVariants } from '@/components/ui/button'
import { DayView } from '@/features/day/day-view'
import { pickToday } from '@/features/today/pick-today'
import { useNow } from '@/hooks/use-now'
import { formatDateSpan } from '@/i18n/format'
import { useLanguage } from '@/i18n/use-language'
import { daysIn, daysUntil } from '@/lib/trip-days'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/shell/page-header'

/**
 * The home screen: the day under way in its trip's own zone, else the next
 * trip's card, else the empty calendar.
 */
export function TodayScreen() {
  const { t } = useTranslation()
  const language = useLanguage()
  const now = useNow()
  const trips = useTrips()
  const pick = trips.data === undefined ? null : pickToday(trips.data, now)
  const day = useTrip(pick?.kind === 'under-way' ? pick.trip.id : undefined)

  if (
    (trips.isError && trips.data === undefined) ||
    (day.isError && day.data === undefined)
  ) {
    return (
      <>
        <PageHeader title={t('nav.today')} />
        <LoadFailed
          message={t('day.loadFailed')}
          error={trips.error ?? day.error}
          onRetry={() => {
            void trips.refetch()
            if (day.isError) void day.refetch()
          }}
        />
      </>
    )
  }

  if (pick === null || (pick.kind === 'under-way' && day.data === undefined)) {
    return (
      <>
        <PageHeader title={t('nav.today')} />
        <p role="status" className="text-base text-muted-foreground">
          {t('shell.loading')}
        </p>
      </>
    )
  }

  if (pick.kind === 'under-way' && day.data !== undefined) {
    return (
      <DayView
        trip={day.data.trip}
        entries={day.data.entries}
        date={pick.date}
        isHome
        stale={trips.isError || day.isError}
      />
    )
  }

  if (pick.kind === 'next') {
    const { trip } = pick
    const today = nowInZone(now, trip.timeZone).date
    return (
      <>
        <PageHeader title={t('nav.today')} />
        <section className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-card p-5 text-card-foreground">
          <p className="text-sm font-extrabold text-muted-foreground">
            {t('today.nextTrip')} ·{' '}
            {t('trips.inDays', { count: daysUntil(today, trip.startsOn) })}
          </p>
          <h2 className="font-heading text-xl font-extrabold break-words">
            {trip.name}
          </h2>
          <p className="text-base text-muted-foreground">
            {t('trips.span', {
              dates: formatDateSpan(trip.startsOn, trip.endsOn, language),
              days: t('controls.dayCount', {
                count: daysIn(trip.startsOn, trip.endsOn),
              }),
            })}
          </p>
          <Link
            to={`/trips/${encodeURIComponent(trip.id)}`}
            className={cn(buttonVariants(), 'mt-2 w-full')}
          >
            {t('today.openTrip')}
          </Link>
        </section>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('nav.today')} />
      {trips.data?.length === 0 ? (
        <NoTrips title={t('trips.emptyTitle')} body={t('trips.emptyBody')} />
      ) : (
        <NoTrips title={t('today.noneTitle')} body={t('today.noneBody')} />
      )}
    </>
  )
}
