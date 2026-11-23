import type { ChangeStamp } from '@shared/entries.ts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'

import { useEntry, useTrip } from '@/calendar-data/queries'
import { DeleteSheet } from '@/components/delete-sheet'
import { KindGlyph } from '@/components/kind-icons'
import { kindTone } from '@/components/kinds'
import { LoadFailed } from '@/components/load-failed'
import { RefreshFailed } from '@/components/refresh-failed'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  formatLongDate,
  formatMoney,
  formatShortDate,
  formatTime,
} from '@/i18n/format'
import { useLanguage } from '@/i18n/use-language'
import { ApiFailure } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useOnline } from '@/offline/connection'
import { offlineReasonId, waitingClass } from '@/offline/offline-card'
import { PageHeader } from '@/shell/page-header'

/**
 * One entry on its kind's pastel: what, when, which day, and its cost, then
 * its notes and who added and last changed it, with Edit and Delete.
 */
export function EntryDetail() {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const { entryId = '' } = useParams()
  const entry = useEntry(entryId)
  const trip = useTrip(entry.data?.tripId)
  const [deleting, setDeleting] = useState(false)
  const online = useOnline()

  // A deleted entry is gone even while its last read is still cached.
  const missing =
    entry.error instanceof ApiFailure && entry.error.code === 'not_found'
  if (
    missing ||
    (entry.isError && entry.data === undefined) ||
    (trip.isError && trip.data === undefined)
  ) {
    return (
      <>
        <PageHeader title={t('entries.activity')} backTo="/" />
        {missing ? (
          <p className="text-base text-muted-foreground">
            {t('entries.notFound')}
          </p>
        ) : (
          <LoadFailed
            message={t('entries.loadFailed')}
            error={entry.error ?? trip.error}
            onRetry={() => {
              void entry.refetch()
              void trip.refetch()
            }}
          />
        )}
      </>
    )
  }

  if (entry.data === undefined || trip.data === undefined) {
    return (
      <>
        <PageHeader title={t('entries.activity')} backTo="/" />
        <p role="status" className="text-base text-muted-foreground">
          {t('shell.loading')}
        </p>
      </>
    )
  }

  const item = entry.data
  const { currency } = trip.data.trip
  const dayPath = `/trips/${encodeURIComponent(item.tripId)}/days/${item.startsOn}`

  function nameOf(stamp: ChangeStamp) {
    return stamp.source === 'assistant'
      ? t('entries.assistant')
      : stamp.displayName
  }

  function dayOf(stamp: ChangeStamp) {
    return formatShortDate(stamp.at.slice(0, 10), language)
  }

  const rows = [
    {
      label: t('entries.time'),
      value: `${formatTime(item.startTime, language)}–${formatTime(item.endTime, language)}`,
    },
    { label: t('entries.day'), value: formatLongDate(item.startsOn, language) },
    {
      label: t('entries.cost'),
      value:
        item.costMinor === null
          ? t('entries.noCost')
          : formatMoney(item.costMinor, currency, language),
    },
  ]
  const changed =
    item.changedBy.at !== item.addedBy.at ||
    item.changedBy.displayName !== item.addedBy.displayName

  return (
    <>
      <PageHeader title={t('entries.activity')} backTo={dayPath} />
      <RefreshFailed show={entry.isError || trip.isError} />
      <section
        className={cn(
          'flex flex-col gap-3 rounded-2xl p-5',
          kindTone[item.kind ?? 'none'],
        )}
      >
        <span className="flex size-16 items-center justify-center rounded-xl bg-card">
          <KindGlyph kind={item.kind} className="size-7" />
        </span>
        <h2 className="font-heading text-xl font-extrabold break-words text-foreground">
          {item.title}
        </h2>
        <dl className="flex flex-col gap-2 text-base text-foreground">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-foreground/75">{label}</dt>
              <dd className="text-right font-extrabold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {item.notes !== null && (
        <section className="flex flex-col gap-2 pt-5">
          <h3 className="text-sm font-extrabold">{t('entries.notes')}</h3>
          <p className="rounded-xl border-2 border-border bg-card px-4 py-3 text-base break-words whitespace-pre-line">
            {item.notes}
          </p>
        </section>
      )}

      <p className="pt-4 text-sm text-muted-foreground">
        {t('entries.addedBy', {
          name: nameOf(item.addedBy),
          date: dayOf(item.addedBy),
        })}
        {changed &&
          ` · ${t('entries.changedBy', {
            name: nameOf(item.changedBy),
            date: dayOf(item.changedBy),
          })}`}
      </p>

      {online ? (
        <div className="flex flex-col gap-3 pt-5">
          <Link
            to={`/entries/${encodeURIComponent(item.id)}/edit`}
            className={cn(buttonVariants())}
          >
            {t('entries.edit')}
          </Link>
          <Button
            variant="ghost"
            onClick={() => setDeleting(true)}
            className="bg-muted"
          >
            {t('entries.deleteThis')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pt-5">
          <Button
            disabled
            focusableWhenDisabled
            aria-describedby={offlineReasonId}
            className={waitingClass}
          >
            {t('entries.edit')}
          </Button>
          <Button
            disabled
            focusableWhenDisabled
            aria-describedby={offlineReasonId}
            className={waitingClass}
          >
            {t('entries.deleteThis')}
          </Button>
          <p className="text-sm text-muted-foreground">
            {t('offline.editsWait')}
          </p>
        </div>
      )}

      <DeleteSheet
        entry={deleting ? item : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => void navigate(dayPath, { replace: true })}
      />
    </>
  )
}
