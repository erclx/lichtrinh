import type { Entry } from '@shared/entries.ts'
import { nowInZone } from '@shared/trip-time.ts'
import type { Trip } from '@shared/trips.ts'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useEntries, useTrips } from '@/calendar-data/queries'
import { LoadFailed } from '@/components/load-failed'
import { NoTrips } from '@/components/no-trips'
import { RefreshFailed } from '@/components/refresh-failed'
import { ViewSwitch } from '@/components/view-switch'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useNow } from '@/hooks/use-now'
import { formatDateSpan, formatMoney } from '@/i18n/format'
import { useLanguage } from '@/i18n/use-language'
import { useDeviceChoice } from '@/lib/device-choice'
import { daysIn, daysUntil } from '@/lib/trip-days'
import { cn } from '@/lib/utils'
import { GridIcon, ListIcon, PlusIcon } from '@/shell/icons'
import { PageHeader } from '@/shell/page-header'

type Status =
  | { kind: 'under-way' }
  | { kind: 'coming'; inDays: number }
  | { kind: 'past' }

function statusOf(trip: Trip, at: Date): Status {
  const today = nowInZone(at, trip.timeZone).date
  if (trip.endsOn < today) return { kind: 'past' }
  if (trip.startsOn > today) {
    return { kind: 'coming', inDays: daysUntil(today, trip.startsOn) }
  }
  return { kind: 'under-way' }
}

const layouts = ['grid', 'list'] as const

const rank = { 'under-way': 0, coming: 1, past: 2 } as const

// Under way first, then the soonest to come, then the most recent past trip.
function inListOrder(trips: Trip[], at: Date) {
  return trips
    .map((trip) => ({ trip, status: statusOf(trip, at) }))
    .sort((a, b) => {
      const byRank = rank[a.status.kind] - rank[b.status.kind]
      if (byRank !== 0) return byRank
      const byStart = a.trip.startsOn.localeCompare(b.trip.startsOn)
      return a.status.kind === 'past' ? -byStart : byStart
    })
}

function spanOf(trips: Trip[]) {
  const [first, ...rest] = trips
  if (first === undefined) return undefined
  return rest.reduce(
    (span, trip) => ({
      from: trip.startsOn < span.from ? trip.startsOn : span.from,
      to: trip.endsOn > span.to ? trip.endsOn : span.to,
    }),
    { from: first.startsOn, to: first.endsOn },
  )
}

function totalsByTrip(entries: Entry[]) {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    if (entry.costMinor === null) continue
    totals.set(entry.tripId, (totals.get(entry.tripId) ?? 0) + entry.costMinor)
  }
  return totals
}

export function TripList() {
  const { t } = useTranslation()
  const language = useLanguage()
  const now = useNow()
  const trips = useTrips()
  // One range read across every trip gives each card its total.
  const entries = useEntries(spanOf(trips.data ?? []))
  const totals = totalsByTrip(entries.data ?? [])
  // A phone opens on the list and a wider screen on the grid, until the
  // traveler picks one on this device.
  const wide = useMediaQuery('(min-width: 480px)')
  const [layout, chooseLayout] = useDeviceChoice(
    'trips-layout',
    layouts,
    wide ? 'grid' : 'list',
  )

  return (
    <>
      <PageHeader
        title={t('nav.trips')}
        action={
          <Link
            to="/trips/new"
            aria-label={t('trips.newTrip')}
            className="inline-flex size-target items-center justify-center rounded-full bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <PlusIcon className="size-6" />
          </Link>
        }
      />

      {trips.isPending && (
        <p role="status" className="text-base text-muted-foreground">
          {t('trips.loading')}
        </p>
      )}

      <RefreshFailed show={trips.isError && trips.data !== undefined} />

      {trips.isError && trips.data === undefined && (
        <LoadFailed
          message={t('trips.loadFailed')}
          error={trips.error}
          onRetry={() => void trips.refetch()}
        />
      )}

      {trips.data?.length === 0 && (
        <NoTrips title={t('trips.emptyTitle')} body={t('trips.emptyBody')} />
      )}

      {trips.data !== undefined && trips.data.length > 0 && (
        <>
          <div className="mb-3 flex justify-end">
            <ViewSwitch
              label={t('trips.layout')}
              options={[
                { value: 'grid', label: t('trips.grid'), icon: GridIcon },
                { value: 'list', label: t('trips.list'), icon: ListIcon },
              ]}
              value={layout}
              onChange={chooseLayout}
            />
          </div>
          <ul
            aria-label={t('nav.trips')}
            data-layout={layout}
            className={cn(
              'gap-3',
              layout === 'grid'
                ? 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,calc(var(--spacing-target)*3.5)),1fr))]'
                : 'flex flex-col',
            )}
          >
            {inListOrder(trips.data, now).map(({ trip, status }) => {
              const total = totals.get(trip.id)
              return (
                <li key={trip.id}>
                  <Link
                    to={`/trips/${encodeURIComponent(trip.id)}`}
                    className="flex h-full min-w-0 flex-col gap-2 rounded-xl border-[1.5px] border-border bg-card p-4 text-card-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [@media(hover:hover)]:hover:border-foreground"
                  >
                    <span className="text-lg font-extrabold break-words">
                      {trip.name}
                    </span>
                    <span className="text-base text-muted-foreground">
                      {t('trips.span', {
                        dates: formatDateSpan(
                          trip.startsOn,
                          trip.endsOn,
                          language,
                        ),
                        days: t('controls.dayCount', {
                          count: daysIn(trip.startsOn, trip.endsOn),
                        }),
                      })}
                    </span>
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-xs bg-muted px-3 py-0.5 text-sm font-extrabold">
                        {status.kind === 'under-way'
                          ? t('trips.underWay')
                          : status.kind === 'coming'
                            ? t('trips.inDays', { count: status.inDays })
                            : t('trips.past')}
                      </span>
                      {total !== undefined && (
                        <span className="text-base font-extrabold">
                          {formatMoney(total, trip.currency, language)}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}
