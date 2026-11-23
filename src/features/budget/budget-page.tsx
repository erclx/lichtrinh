import { tripBudget } from '@shared/budget.ts'
import type { EntryKind } from '@shared/changes.ts'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { useTrip } from '@/calendar-data/queries'
import { HomeEstimate } from '@/components/home-estimate'
import { kindTone } from '@/components/kinds'
import { LoadFailed } from '@/components/load-failed'
import { RefreshFailed } from '@/components/refresh-failed'
import { buttonVariants } from '@/components/ui/button'
import { formatMoney, formatShortDate, formatWeekday } from '@/i18n/format'
import { useLanguage } from '@/i18n/use-language'
import { ApiFailure } from '@/lib/api'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/shell/page-header'

const kindLabel = {
  food: 'budget.food',
  sights: 'budget.sights',
  activity: 'budget.activity',
  transport: 'budget.transport',
  rest: 'budget.rest',
} as const satisfies Record<EntryKind, string>

// A pastel names a kind and nothing else, so an entry of no kind takes the
// muted ink rather than a pastel of its own.
function swatchOf(kind: EntryKind | null) {
  return kind === null ? 'bg-muted-foreground' : kindTone[kind]
}

/** A trip's estimated cost: the total with its home figure, each kind, and each day. */
export function BudgetPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const { tripId } = useParams()
  const query = useTrip(tripId)
  const tripPath = `/trips/${encodeURIComponent(tripId ?? '')}`

  if (query.isPending) {
    return (
      <>
        <PageHeader title={t('budget.title')} backTo={tripPath} />
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
        <PageHeader title={t('budget.title')} backTo="/trips" />
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
  const budget = tripBudget(trip, entries)
  const costed = budget.byKind.length > 0
  const busiest = Math.max(...budget.byDay.map(({ totalMinor }) => totalMinor))
  const money = (minor: number) => formatMoney(minor, trip.currency, language)

  return (
    <>
      <PageHeader title={t('budget.title')} backTo={tripPath} />
      <RefreshFailed show={query.isError} />

      <section className="flex flex-col gap-1 rounded-2xl border-[1.5px] border-border bg-card p-5 text-card-foreground">
        <p className="text-base text-muted-foreground">
          {t('budget.estimated', { trip: trip.name })}
        </p>
        {costed ? (
          <>
            <p className="font-heading text-2xl font-extrabold">
              {money(budget.totalMinor)}
            </p>
            <HomeEstimate
              amountMinor={budget.totalMinor}
              currency={trip.currency}
              homeCurrency={trip.homeCurrency}
              className="text-base text-muted-foreground"
            />
            {budget.totalMinor > 0 && (
              <div
                aria-hidden="true"
                className="mt-3 flex h-4 gap-0.5 overflow-hidden rounded-full"
              >
                {budget.byKind.map(({ kind, totalMinor }) => (
                  <span
                    key={kind ?? 'none'}
                    className={swatchOf(kind)}
                    style={{ flexGrow: totalMinor }}
                  />
                ))}
              </div>
            )}
            <ul
              aria-label={t('budget.byKind')}
              className="mt-3 flex flex-col gap-1.5 min-[480px]:flex-row min-[480px]:flex-wrap min-[480px]:gap-x-5"
            >
              {budget.byKind.map(({ kind, totalMinor }) => (
                <li
                  key={kind ?? 'none'}
                  className="flex items-center gap-2 text-base"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-3.5 shrink-0 rounded-sm',
                      swatchOf(kind),
                    )}
                  />
                  {kind === null
                    ? t('budget.uncategorized')
                    : t(kindLabel[kind])}{' '}
                  {money(totalMinor)}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="pt-1 text-base">{t('budget.noCosts')}</p>
        )}
        {budget.uncosted > 0 && (
          <p className="mt-2 text-base text-muted-foreground">
            {t('budget.uncosted', { count: budget.uncosted })}
          </p>
        )}
      </section>

      <h2 className="pt-6 pb-1 font-heading text-lg font-extrabold">
        {t('budget.byDay')}
      </h2>
      <ul>
        {budget.byDay.map(({ date, totalMinor }) => (
          <li
            key={date}
            className="flex min-h-target items-center gap-3 border-b-[1.5px] border-border py-2"
          >
            <span className="flex w-14 shrink-0 flex-col leading-tight">
              <span className="text-lg font-extrabold">
                {formatShortDate(date, language)}
              </span>
              <span className="text-sm font-bold text-muted-foreground">
                {formatWeekday(date, language)}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <span
                className="block h-full rounded-full bg-foreground"
                style={{
                  width: `${busiest > 0 ? (totalMinor / busiest) * 100 : 0}%`,
                }}
              />
            </span>
            <span
              className={cn(
                'shrink-0 text-base font-extrabold whitespace-nowrap',
                totalMinor === 0 && 'font-normal text-muted-foreground',
              )}
            >
              {money(totalMinor)}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
