import { tripBudget } from '@shared/budget.ts'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { useTrip } from '@/calendar-data/queries'
import { HomeEstimate } from '@/components/home-estimate'
import { LoadFailed } from '@/components/load-failed'
import { RefreshFailed } from '@/components/refresh-failed'
import { buttonVariants } from '@/components/ui/button'
import { ViewSwitch } from '@/components/view-switch'
import { formatMoney, formatShortDate, formatWeekday } from '@/i18n/format'
import { useLanguage } from '@/i18n/use-language'
import { ApiFailure } from '@/lib/api'
import { useDeviceChoice } from '@/lib/device-choice'
import { cn } from '@/lib/utils'
import { BarsIcon, RingIcon } from '@/shell/icons'
import { PageHeader } from '@/shell/page-header'

import { KindSplit } from './kind-split'

const chartViews = ['ring', 'bars'] as const

/** A trip's estimated cost: the total with its home figure, each kind, and each day. */
export function BudgetPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const { tripId } = useParams()
  const query = useTrip(tripId)
  const [chart, chooseChart] = useDeviceChoice(
    'budget-chart',
    chartViews,
    'ring',
  )
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
              <ViewSwitch
                label={t('budget.view')}
                options={[
                  { value: 'ring', label: t('budget.ring'), icon: RingIcon },
                  { value: 'bars', label: t('budget.bars'), icon: BarsIcon },
                ]}
                value={chart}
                onChange={chooseChart}
                className="mt-3 self-start"
              />
            )}
            <KindSplit
              byKind={budget.byKind}
              totalMinor={budget.totalMinor}
              view={chart}
              money={money}
            />
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
      {/* One grid for every row, so each column sizes to its widest cell and
          every track starts and ends at the same place. */}
      <ul className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3">
        {budget.byDay.map(({ date, totalMinor }) => (
          <li
            key={date}
            className="col-span-full grid min-h-target grid-cols-subgrid items-center border-b-[1.5px] border-border py-2"
          >
            <span className="flex flex-col leading-tight">
              <span className="text-lg font-extrabold">
                {formatShortDate(date, language)}
              </span>
              <span className="text-sm font-bold text-muted-foreground">
                {formatWeekday(date, language)}
              </span>
            </span>
            <span
              aria-hidden="true"
              data-testid="day-track"
              className="h-3 overflow-hidden rounded-full bg-muted"
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
                'text-right text-base font-extrabold whitespace-nowrap',
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
