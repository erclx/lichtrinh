import type { Change, EntryKind } from '@shared/changes.ts'
import { useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { useChangeUndo } from '@/components/change-undo'
import { KindGlyph } from '@/components/kind-icons'
import { kindTone } from '@/components/kinds'
import { chatKeys } from '@/features/chat/chat-api'
import { formatCardDate, formatTime } from '@/i18n/format'
import type { Language } from '@/i18n/resources'
import { useLanguage } from '@/i18n/use-language'
import { cn } from '@/lib/utils'
import { useOnline } from '@/offline/connection'
import { offlineReasonId, waitingClass } from '@/offline/offline-card'

interface Shown {
  title: string
  kind: EntryKind | null
  detail: string
}

function shownOf(change: Change, t: TFunction, language: Language): Shown {
  if (change.entity === 'trip') {
    const trip = change.after ?? change.before
    return { title: trip?.name ?? '', kind: null, detail: t('chat.cardTrip') }
  }
  const { before, after } = change
  const entry = after ?? before
  if (entry === null) return { title: '', kind: null, detail: '' }
  const base = { title: entry.title, kind: entry.kind }
  const date = (day: string) => formatCardDate(day, language)
  const time = (clock: string) => formatTime(clock, language)
  if (after === null) {
    return {
      ...base,
      detail: t('chat.cardRemoved', { date: date(entry.startsOn) }),
    }
  }
  if (
    before !== null &&
    (before.startsOn !== after.startsOn || before.startTime !== after.startTime)
  ) {
    const sameDay = before.startsOn === after.startsOn
    const at = (day: string, clock: string) =>
      sameDay ? time(clock) : `${time(clock)} · ${date(day)}`
    return {
      ...base,
      detail: t('chat.cardMoved', {
        from: at(before.startsOn, before.startTime),
        to: at(after.startsOn, after.startTime),
      }),
    }
  }
  return {
    ...base,
    detail: t('chat.cardSpan', {
      start: time(after.startTime),
      end: time(after.endTime),
      date: date(after.startsOn),
    }),
  }
}

const messageKey = {
  conflict: 'chat.undoConflict',
  outsideDates: 'undo.outsideDates',
  otherCurrency: 'undo.otherCurrency',
  network: 'errors.network',
  failed: 'errors.generic',
} as const

/**
 * One change a reply made, tinted by the entry's kind, with Undo, which waits
 * with no connection.
 */
export function ChangeCard({ change }: { change: Change }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const client = useQueryClient()
  const online = useOnline()
  const { outcome, isPending, run } = useChangeUndo(change, {
    onUndone: () => void client.invalidateQueries({ queryKey: chatKeys.all }),
  })
  const shown = shownOf(change, t, language)
  const isUndone = outcome === 'undone' || outcome === 'alreadyUndone'
  const canUndo = !isUndone && outcome !== 'conflict'

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md p-3',
        kindTone[shown.kind ?? 'none'],
      )}
    >
      {/* Undo drops under the entry when the bubble is too narrow for both,
          rather than squeezing the time into a column of fragments. */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex min-w-0 grow basis-40 items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-background text-foreground">
            <KindGlyph kind={shown.kind} className="size-7" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-extrabold break-words">
              {shown.title}
            </span>
            <span className="text-sm">{shown.detail}</span>
          </div>
        </div>
        {canUndo ? (
          <button
            type="button"
            onClick={online ? run : undefined}
            aria-disabled={isPending || !online}
            aria-describedby={online ? undefined : offlineReasonId}
            aria-label={t('chat.undoLabel', { title: shown.title })}
            className={cn(
              'inline-flex min-h-target shrink-0 items-center rounded-lg bg-primary px-4 text-sm font-extrabold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2',
              online ? 'aria-disabled:opacity-70' : waitingClass,
            )}
          >
            {isPending ? t('chat.undoing') : t('chat.undo')}
          </button>
        ) : isUndone ? (
          <span className="shrink-0 px-2 text-sm font-extrabold">
            {t('chat.undone')}
          </span>
        ) : null}
      </div>
      <p role="status" className="text-sm empty:hidden">
        {outcome === 'ready' ||
        outcome === 'undone' ||
        outcome === 'alreadyUndone'
          ? null
          : t(messageKey[outcome])}
      </p>
    </div>
  )
}
