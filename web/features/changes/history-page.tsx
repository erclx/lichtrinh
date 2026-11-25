import type { Change } from '@shared/changes.ts'
import { nowInZone, shiftClock } from '@shared/trip-time.ts'
import type { Trip } from '@shared/trips.ts'
import { SparkleIcon } from 'lucide-react'
import { useCallback, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { useChanges, useTrip } from '@/calendar-data/queries'
import { type UndoOutcome, useChangeUndo } from '@/components/change-undo'
import { LoadFailed } from '@/components/load-failed'
import { RefreshFailed } from '@/components/refresh-failed'
import { Button, buttonVariants } from '@/components/ui/button'
import { useOfferUndo } from '@/components/undo-context'
import { describeChange } from '@/features/changes/describe-change'
import { useNow } from '@/hooks/use-now'
import { formatLongDate, formatTime } from '@/i18n/format'
import { useLanguage } from '@/i18n/use-language'
import { ApiFailure } from '@/lib/api'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/shell/page-header'

/** A trip's changes newest first, by day in trip time, each with Undo. */
export function HistoryPage() {
  const { t } = useTranslation()
  const { tripId } = useParams()
  const trip = useTrip(tripId)
  const changes = useChanges(tripId)
  const emptyId = useId()
  const tripPath = `/trips/${encodeURIComponent(tripId ?? '')}`
  const error = trip.error ?? changes.error

  // An undo can remove the loaded trip, so the refusal decides, not the cache.
  if (error instanceof ApiFailure && error.code === 'not_found') {
    return (
      <>
        <PageHeader title={t('history.title')} backTo="/trips" />
        <div className="flex flex-col items-start gap-5">
          <p className="text-base text-muted-foreground">
            {t('trips.notFound')}
          </p>
          <Link to="/trips" className={cn(buttonVariants())}>
            {t('trips.allTrips')}
          </Link>
        </div>
      </>
    )
  }

  if (trip.data === undefined || changes.data === undefined) {
    return (
      <>
        <PageHeader title={t('history.title')} backTo={tripPath} />
        {error === null ? (
          <p role="status" className="text-base text-muted-foreground">
            {t('shell.loading')}
          </p>
        ) : (
          <LoadFailed
            message={t('history.loadFailed')}
            error={error}
            onRetry={() => {
              if (trip.isError) void trip.refetch()
              if (changes.isError) void changes.refetch()
            }}
          />
        )}
      </>
    )
  }

  const shown = changes.data.pages.flatMap((page) => page.changes)

  if (shown.length === 0) {
    return (
      <>
        <PageHeader title={t('history.title')} backTo={tripPath} />
        <section
          aria-labelledby={emptyId}
          className="flex flex-col items-start gap-3 rounded-xl border-[1.5px] border-border bg-card p-5 text-card-foreground"
        >
          <h2 id={emptyId} className="text-lg font-extrabold">
            {t('history.emptyTitle')}
          </h2>
          <p className="text-base text-muted-foreground">
            {t('history.emptyBody')}
          </p>
          <Link to={tripPath} className={cn(buttonVariants())}>
            {t('history.openTrip')}
          </Link>
        </section>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('history.title')} backTo={tripPath} />
      <RefreshFailed show={trip.isError || changes.isRefetchError} />
      <ChangeDays trip={trip.data.trip} changes={shown} />
      <div className="flex flex-col items-start gap-4 pt-4">
        {changes.isFetchNextPageError && (
          <p
            role="alert"
            className="w-full rounded-xl bg-muted px-4 py-3 text-base"
          >
            {t('history.olderFailed')}
          </p>
        )}
        {changes.hasNextPage && (
          <Button
            variant="secondary"
            aria-disabled={changes.isFetchingNextPage}
            onClick={() => {
              if (!changes.isFetchingNextPage) void changes.fetchNextPage()
            }}
          >
            {changes.isFetchingNextPage
              ? t('history.loadingOlder')
              : t('history.showOlder')}
          </Button>
        )}
        <p className="text-sm text-muted-foreground">{t('history.footer')}</p>
      </div>
    </>
  )
}

interface Row {
  change: Change
  /** The wall clock in the trip's zone, `HH:MM`. */
  time: string
  /** The currency the trip was in when the change was made. */
  currency: string
  /** The entity's newest change, when it left the state this one did. */
  restoredBy?: string
}

interface Day {
  date: string
  rows: Row[]
}

function leftSameState(a: Change, b: Change) {
  return JSON.stringify(a.after) === JSON.stringify(b.after)
}

function daysOf(trip: Trip, changes: readonly Change[]): Day[] {
  const days: Day[] = []
  // Walking back past a change of currency, older costs read in the old one.
  let currency = trip.currency
  const newest = new Map<string, Change>()
  for (const change of changes) {
    const latest = newest.get(change.entityId) ?? change
    newest.set(change.entityId, latest)
    const restoredBy = leftSameState(latest, change) ? latest.id : undefined
    const { date, minute } = nowInZone(new Date(change.at), trip.timeZone)
    const { time } = shiftClock({ date, time: '00:00' }, minute)
    const row = { change, time, currency, restoredBy }
    const day = days.at(-1)
    if (day?.date === date) day.rows.push(row)
    else days.push({ date, rows: [row] })
    if (change.entity === 'trip' && change.before !== null) {
      currency = change.before.currency
    }
  }
  return days
}

interface ChangeDaysProps {
  trip: Trip
  changes: readonly Change[]
}

function ChangeDays({ trip, changes }: ChangeDaysProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const today = nowInZone(useNow(), trip.timeZone).date

  return daysOf(trip, changes).map(({ date, rows }) => (
    <section key={date} className="pt-2">
      <h2 className="text-sm font-extrabold text-muted-foreground">
        {date === today ? t('day.today') : formatLongDate(date, language)}
      </h2>
      <ul>
        {rows.map((row) => (
          <ChangeRow key={row.change.id} {...row} />
        ))}
      </ul>
    </section>
  ))
}

const messageKey = {
  conflict: 'undo.conflict',
  outsideDates: 'undo.outsideDates',
  otherCurrency: 'undo.otherCurrency',
  alreadyUndone: 'undo.alreadyUndone',
  network: 'errors.network',
  failed: 'errors.generic',
} as const

function messageOf(outcome: UndoOutcome) {
  return outcome === 'ready' || outcome === 'undone'
    ? null
    : messageKey[outcome]
}

function ChangeRow({ change, time, currency, restoredBy }: Row) {
  const { t } = useTranslation()
  const language = useLanguage()
  const offerUndo = useOfferUndo()
  const row = useRef<HTMLLIElement>(null)
  const { outcome, isPending, run } = useChangeUndo(change, {
    onUndone,
    restoredBy,
  })

  const sentence = describeChange(change, currency, t, language)
  const byAssistant = change.source === 'assistant'
  const person = change.actor.displayName
  const gone = outcome === 'undone' || outcome === 'alreadyUndone'
  const message = messageOf(outcome)

  // Stable, since a new callback would run its cleanup on every render.
  const keepFocus = useCallback((button: HTMLButtonElement) => {
    return () => {
      if (document.activeElement === button) row.current?.focus()
    }
  }, [])

  function onUndone(undo: Change) {
    // A removed trip takes this list with it, so the way back is offered here.
    if (undo.entity === 'trip' && undo.after === null) {
      offerUndo(t('undo.deleted', { title: undo.before?.name ?? '' }), undo.id)
    }
  }

  return (
    <li
      ref={row}
      tabIndex={-1}
      className="border-b-[1.5px] border-border py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-extrabold"
        >
          {byAssistant ? (
            <SparkleIcon className="size-6" fill="currentColor" />
          ) : (
            Array.from(person)[0]?.toLocaleUpperCase(language)
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 font-extrabold">
            <span className="min-w-0 break-words">
              {byAssistant ? t('history.assistant') : person}
            </span>
            {change.op === 'undo' && (
              <span className="rounded-full border-[1.5px] border-border px-2.5 text-sm text-muted-foreground">
                {t('history.undoTag')}
              </span>
            )}
          </p>
          <p className="text-sm break-words text-muted-foreground">
            <span>{sentence}</span> ·{' '}
            <time dateTime={change.at}>{formatTime(time, language)}</time>
            {byAssistant && ` · ${t('history.onBehalf', { name: person })}`}
          </p>
        </div>
        {gone ? (
          <span className="shrink-0 text-sm font-extrabold">
            {t('undo.undone')}
          </span>
        ) : (
          <button
            ref={keepFocus}
            type="button"
            onClick={run}
            aria-disabled={isPending}
            aria-label={t('history.undoLabel', { change: sentence })}
            className="inline-flex min-h-target shrink-0 items-center rounded-lg bg-muted px-4 text-sm font-extrabold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:opacity-70"
          >
            {t('undo.undo')}
          </button>
        )}
      </div>
      <p role="status" className="pl-16 text-sm empty:hidden">
        {isPending ? t('undo.undoing') : message === null ? null : t(message)}
      </p>
    </li>
  )
}
