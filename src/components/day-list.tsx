import type { Entry } from '@shared/entries.ts'
import { CheckIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import type { DayRow } from '@/components/day-state'
import { KindGlyph } from '@/components/kind-icons'
import { kindTone } from '@/components/kinds'
import { buttonVariants } from '@/components/ui/button'
import { SwipeRow } from '@/features/day/swipe-row'
import { DeleteSheet } from '@/features/entries/delete-sheet'
import { formatDuration, formatMoney, formatTime } from '@/i18n/format'
import { useLanguage } from '@/i18n/use-language'
import { cn } from '@/lib/utils'
import { PlusIcon } from '@/shell/icons'

interface DayListProps {
  rows: DayRow[]
  /** The trip currency every cost is in. */
  currency: string
  /** Where the empty state's Add leads. */
  addTo: string
}

// Each row link sets draggable false, since a mouse drag on a link starts
// the browser's own link drag, which cancels the swipe before it claims.
const rowLink =
  'outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function minutesOf(entry: Entry) {
  const start = Date.parse(`${entry.startsOn}T${entry.startTime}:00Z`)
  const end = Date.parse(`${entry.endsOn}T${entry.endTime}:00Z`)
  return Math.round((end - start) / 60_000)
}

/**
 * The day as one list in start order. A done entry collapses, an entry
 * happening now expands with its time left, and each row reveals Delete on
 * a left swipe beside the entry screen's own Delete, never in its place.
 */
export function DayList({ rows, currency, addTo }: DayListProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [deleting, setDeleting] = useState<Entry | null>(null)

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border-[2.5px] border-dashed border-border p-6 text-center">
        <p className="text-base text-muted-foreground">{t('day.empty')}</p>
        <Link to={addTo} className={cn(buttonVariants())}>
          <PlusIcon />
          {t('day.add')}
        </Link>
      </div>
    )
  }

  function costText(entry: Entry) {
    return entry.costMinor === null
      ? null
      : formatMoney(entry.costMinor, currency, language)
  }

  return (
    <>
      <ol className="flex flex-col gap-2">
        {rows.map(({ entry, state, minutesLeft, progress }) => {
          const to = `/entries/${encodeURIComponent(entry.id)}`
          const tone = kindTone[entry.kind ?? 'none']
          const cost = costText(entry)
          return (
            <li key={entry.id}>
              <SwipeRow onDelete={() => setDeleting(entry)}>
                {state === 'done' && (
                  <Link
                    to={to}
                    draggable={false}
                    className={cn(
                      'grid min-h-target grid-cols-[40px_1fr_auto] items-center gap-3 rounded-xl px-2 py-1.5 text-muted-foreground',
                      rowLink,
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-10 items-center justify-center rounded-lg opacity-60',
                        tone,
                      )}
                    >
                      <KindGlyph kind={entry.kind} className="size-5" />
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 text-base font-semibold">
                      <CheckIcon
                        aria-hidden="true"
                        className="size-5 shrink-0"
                        strokeWidth={2.6}
                      />
                      <span className="sr-only">{t('day.done')}, </span>
                      <span className="min-w-0 break-words">{entry.title}</span>
                    </span>
                    <span className="text-base font-extrabold">
                      {formatTime(entry.startTime, language)}
                    </span>
                  </Link>
                )}

                {state === 'now' && (
                  <Link
                    to={to}
                    draggable={false}
                    className={cn(
                      'flex flex-col gap-1.5 rounded-2xl p-5',
                      entry.kind === null
                        ? 'bg-now text-foreground'
                        : kindTone[entry.kind],
                      rowLink,
                    )}
                  >
                    <span className="text-sm font-extrabold">
                      {t('day.happeningNow')} ·{' '}
                      {t('day.timeLeft', {
                        duration: formatDuration(minutesLeft ?? 0, language),
                      })}
                    </span>
                    <span className="font-heading text-xl font-extrabold break-words text-foreground">
                      {entry.title}
                    </span>
                    <span className="text-base text-foreground/80">
                      {formatTime(entry.startTime, language)}–
                      {formatTime(entry.endTime, language)}
                      {cost !== null && ` · ${cost}`}
                    </span>
                    <span
                      aria-hidden="true"
                      className="mt-1 h-2.5 overflow-hidden rounded-full bg-card"
                    >
                      <span
                        className="block h-full rounded-full bg-current"
                        style={{
                          width: `${Math.round((progress ?? 0) * 100)}%`,
                        }}
                      />
                    </span>
                  </Link>
                )}

                {state === 'upcoming' && (
                  <Link
                    to={to}
                    draggable={false}
                    className={cn(
                      'grid min-h-target grid-cols-[48px_1fr_auto] items-center gap-3 rounded-xl px-2 py-2',
                      rowLink,
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-12 items-center justify-center rounded-lg',
                        tone,
                      )}
                    >
                      <KindGlyph kind={entry.kind} className="size-6" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-lg font-extrabold break-words">
                        {entry.title}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatDuration(minutesOf(entry), language)}
                        {cost !== null && ` · ${cost}`}
                      </span>
                    </span>
                    <span className="text-lg font-extrabold">
                      {formatTime(entry.startTime, language)}
                    </span>
                  </Link>
                )}
              </SwipeRow>
            </li>
          )
        })}
      </ol>
      <DeleteSheet entry={deleting} onClose={() => setDeleting(null)} />
    </>
  )
}
