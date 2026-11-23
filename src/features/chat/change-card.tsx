import type { Change, EntryKind } from '@shared/changes.ts'
import { useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useUndo } from '@/calendar-data/mutations'
import { KindGlyph } from '@/components/kind-icons'
import { kindTone } from '@/components/kinds'
import { chatKeys } from '@/features/chat/chat-api'
import { formatCardDate, formatTime } from '@/i18n/format'
import type { Language } from '@/i18n/resources'
import { useLanguage } from '@/i18n/use-language'
import { ApiFailure } from '@/lib/api'
import { cn } from '@/lib/utils'

type Outcome = 'ready' | 'undone' | 'conflict' | 'network' | 'failed'

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

function outcomeOf(error: unknown): Outcome {
  if (!(error instanceof ApiFailure)) return 'failed'
  if (error.code === 'already_undone') return 'undone'
  if (error.code === 'undo_conflict') return 'conflict'
  if (error.code === 'network') return 'network'
  return 'failed'
}

const messageKey = {
  conflict: 'chat.undoConflict',
  network: 'errors.network',
  failed: 'errors.generic',
} as const

/**
 * One change a reply made, tinted by the entry's kind, with Undo. The undo
 * id is made once per card, so a press retried after a lost answer reaches
 * the undo the first press stored rather than undoing twice.
 */
export function ChangeCard({ change }: { change: Change }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const client = useQueryClient()
  const undo = useUndo()
  const [undoId] = useState(() => crypto.randomUUID())
  const [outcome, setOutcome] = useState<Outcome>(
    change.undoneBy === null ? 'ready' : 'undone',
  )
  const shown = shownOf(change, t, language)
  const canUndo =
    outcome === 'ready' || outcome === 'network' || outcome === 'failed'

  function runUndo() {
    if (undo.isPending || !canUndo) return
    undo.mutate(
      { changeId: change.id, undoId },
      {
        onSuccess: () => {
          setOutcome('undone')
          void client.invalidateQueries({ queryKey: chatKeys.all })
        },
        onError: (error) => setOutcome(outcomeOf(error)),
      },
    )
  }

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
        <div className="flex min-w-0 grow basis-48 items-center gap-3">
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
            onClick={runUndo}
            aria-disabled={undo.isPending}
            aria-label={t('chat.undoLabel', { title: shown.title })}
            className="inline-flex min-h-target shrink-0 items-center rounded-lg bg-primary px-4 text-sm font-extrabold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 aria-disabled:opacity-70"
          >
            {undo.isPending ? t('chat.undoing') : t('chat.undo')}
          </button>
        ) : outcome === 'undone' ? (
          <span className="shrink-0 px-2 text-sm font-extrabold">
            {t('chat.undone')}
          </span>
        ) : null}
      </div>
      <p role="status" className="text-sm empty:hidden">
        {outcome === 'conflict' || outcome === 'network' || outcome === 'failed'
          ? t(messageKey[outcome])
          : null}
      </p>
    </div>
  )
}
