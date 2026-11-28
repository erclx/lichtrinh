import type { KindTotal } from '@shared/budget.ts'
import type { EntryKind } from '@shared/changes.ts'
import { useTranslation } from 'react-i18next'

import type { Language } from '@/i18n/resources'
import { useLanguage } from '@/i18n/use-language'
import { cn } from '@/lib/utils'

export type ChartView = 'ring' | 'bars'

const kindLabel = {
  food: 'budget.food',
  sights: 'budget.sights',
  activity: 'budget.activity',
  transport: 'budget.transport',
  rest: 'budget.rest',
} as const satisfies Record<EntryKind, string>

// Each kind fills in its ink rather than its pastel, since a chart needs the
// 3:1 a pastel lacks against the card. No kind takes the muted ink.
const fillOf = {
  food: 'bg-food-ink',
  sights: 'bg-sights-ink',
  activity: 'bg-activity-ink',
  transport: 'bg-transport-ink',
  rest: 'bg-rest-ink',
  none: 'bg-muted-foreground',
} as const

const strokeOf = {
  food: 'stroke-food-ink',
  sights: 'stroke-sights-ink',
  activity: 'stroke-activity-ink',
  transport: 'stroke-transport-ink',
  rest: 'stroke-rest-ink',
  none: 'stroke-muted-foreground',
} as const

// The drawn ring: radius 54 and width 22 on a 140 box, segments 2 apart.
const RADIUS = 54
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const GAP = 2

/** Largest first, the fixed kind order breaking ties, since `sort` is stable. */
function largestFirst(byKind: readonly KindTotal[]): KindTotal[] {
  return [...byKind].sort((a, b) => b.totalMinor - a.totalMinor)
}

/** A kind's share as a whole percent, a share under one percent reading `<1%` rather than 0. */
function formatShare(share: number, language: Language): string {
  const percent = new Intl.NumberFormat(language, {
    style: 'percent',
    maximumFractionDigits: 0,
  })
  return share > 0 && share < 0.01
    ? `<${percent.format(0.01)}`
    : percent.format(share)
}

function Ring({
  kinds,
  totalMinor,
}: {
  kinds: KindTotal[]
  totalMinor: number
}) {
  // One kind draws the whole ring, with no gap to break it.
  const gap = kinds.length > 1 ? GAP : 0
  const lengths = kinds.map(
    ({ totalMinor: amount }) => (amount / totalMinor) * CIRCUMFERENCE,
  )
  const starts = lengths.map((_, index) =>
    lengths.slice(0, index).reduce((sum, length) => sum + length, 0),
  )
  return (
    <svg aria-hidden="true" viewBox="0 0 140 140" className="size-46 shrink-0">
      {kinds.map(({ kind }, index) => {
        const length = lengths[index] ?? 0
        const offset = starts[index] ?? 0
        return (
          <circle
            key={kind ?? 'none'}
            r={RADIUS}
            cx="70"
            cy="70"
            fill="none"
            strokeWidth="22"
            strokeDasharray={`${Math.max(length - gap, 0)} ${CIRCUMFERENCE - length + gap}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 70 70)"
            className={strokeOf[kind ?? 'none']}
          />
        )
      })}
    </svg>
  )
}

interface KindSplitProps {
  byKind: readonly KindTotal[]
  totalMinor: number
  view: ChartView
  money: (minor: number) => string
}

/**
 * Each kind's share of a trip as a ring or as bars. The ring and the bars are
 * hidden from a screen reader, so the list named `Cost by kind` carries every
 * figure in both views.
 */
export function KindSplit({ byKind, totalMinor, view, money }: KindSplitProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const kinds = largestFirst(byKind)
  const largest = kinds[0]?.totalMinor ?? 0

  return (
    <div
      data-testid="kind-split"
      data-view={view}
      className={cn(
        'mt-3 flex flex-wrap items-center gap-5',
        view === 'bars' && 'flex-col items-stretch',
      )}
    >
      {view === 'ring' && totalMinor > 0 && (
        <Ring kinds={kinds} totalMinor={totalMinor} />
      )}
      <ul
        aria-label={t('budget.byKind')}
        className={cn(
          'grid min-w-0 grow items-center gap-x-3 gap-y-2 text-base',
          view === 'ring'
            ? 'grid-cols-[auto_minmax(0,1fr)_auto_auto]'
            : 'grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto_auto]',
        )}
      >
        {kinds.map(({ kind, totalMinor: amount }) => {
          const fill = fillOf[kind ?? 'none']
          const name =
            kind === null ? t('budget.uncategorized') : t(kindLabel[kind])
          return (
            <li
              key={kind ?? 'none'}
              className="col-span-full grid grid-cols-subgrid items-center"
            >
              {view === 'ring' && (
                <span
                  aria-hidden="true"
                  className={cn('size-3.5 rounded-sm', fill)}
                />
              )}
              <span className="break-words">{name}</span>{' '}
              {view === 'bars' && (
                <span
                  aria-hidden="true"
                  className="h-3 overflow-hidden rounded-full bg-muted"
                >
                  <span
                    className={cn('block h-full rounded-full', fill)}
                    style={{
                      width: `${largest > 0 ? (amount / largest) * 100 : 0}%`,
                    }}
                  />
                </span>
              )}
              <span className="text-right font-extrabold whitespace-nowrap">
                {money(amount)}
              </span>{' '}
              <span className="text-right whitespace-nowrap text-muted-foreground">
                {formatShare(
                  totalMinor > 0 ? amount / totalMinor : 0,
                  language,
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
