import type { Entry } from '@shared/entries.ts'
import { nowInZone } from '@shared/trip-time.ts'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { useTrip } from '@/calendar-data/queries'
import { kindTone } from '@/components/kinds'
import { LoadFailed } from '@/components/load-failed'
import { buttonVariants } from '@/components/ui/button'
import { useNow } from '@/hooks/use-now'
import { formatDateSpan, formatLongDate, formatMoney } from '@/i18n/format'
import { useLanguage } from '@/i18n/use-language'
import { ApiFailure } from '@/lib/api'
import { datesBetween, daysIn } from '@/lib/trip-days'
import { cn } from '@/lib/utils'
import { ChevronIcon } from '@/shell/icons'
import { PageHeader } from '@/shell/page-header'

function costOf(entries: Entry[]) {
  const costs = entries.flatMap(({ costMinor }) =>
    costMinor === null ? [] : [costMinor],
  )
  return costs.length === 0 ? null : costs.reduce((sum, cost) => sum + cost, 0)
}

/** One trip's card with its total, then each of its days opening that day. */
export function TripOverview() {
  const { t } = useTranslation()
  const language = useLanguage()
  const now = useNow()
  const { tripId } = useParams()
  const query = useTrip(tripId)

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

  if (query.isError) {
    const missing =
      query.error instanceof ApiFailure && query.error.code === 'not_found'
    return (
      <>
        <PageHeader title={t('nav.trips')} backTo="/trips" />
        {missing ? (
          <div className="flex flex-col items-start gap-5">
            <p className="text-base text-muted-foreground">
              {t('trips.notFound')}
            </p>
            <Link to="/trips" className={cn(buttonVariants())}>
              {t('trips.allTrips')}
            </Link>
          </div>
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
  const total = costOf(entries)
  const today = nowInZone(now, trip.timeZone).date
  const tripPath = `/trips/${encodeURIComponent(trip.id)}`

  return (
    <>
      <PageHeader title={trip.name} backTo="/trips" />
      <section className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-card p-5 text-card-foreground">
        <p className="text-base text-muted-foreground">
          {[
            formatDateSpan(trip.startsOn, trip.endsOn, language),
            t('controls.dayCount', {
              count: daysIn(trip.startsOn, trip.endsOn),
            }),
            t('trips.activities', { count: entries.length }),
          ].join(' · ')}
        </p>
        {total !== null && (
          <p className="font-heading text-xl font-extrabold">
            {formatMoney(total, trip.currency, language)}
          </p>
        )}
      </section>

      <h2 className="pt-6 pb-1 font-heading text-lg font-extrabold">
        {t('trips.days')}
      </h2>
      <ul>
        {datesBetween(trip.startsOn, trip.endsOn).map((date, index) => {
          const onDay = entries.filter((entry) => entry.startsOn === date)
          const cost = costOf(onDay)
          return (
            <li key={date} className="border-b-[1.5px] border-border">
              <Link
                to={`${tripPath}/days/${date}`}
                className="flex min-h-target items-center gap-3 rounded-lg px-1 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
                    {t('trips.dayNumber', { number: index + 1 })}
                    {date === today && (
                      <span className="rounded-full bg-primary px-2.5 text-sm text-primary-foreground">
                        {t('day.today')}
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatLongDate(date, language)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    {onDay.length > 0 && (
                      <span aria-hidden="true" className="flex gap-1">
                        {onDay.slice(0, 6).map((entry) => (
                          <span
                            key={entry.id}
                            className={cn(
                              'size-3.5 rounded-full border border-foreground/40',
                              kindTone[entry.kind ?? 'none'],
                            )}
                          />
                        ))}
                      </span>
                    )}
                    {onDay.length > 0
                      ? t('trips.activities', { count: onDay.length })
                      : t('trips.nothingYet')}
                  </span>
                  {cost !== null && (
                    <span className="text-base font-extrabold">
                      {formatMoney(cost, trip.currency, language)}
                    </span>
                  )}
                </span>
                <ChevronIcon className="size-6 shrink-0" />
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
