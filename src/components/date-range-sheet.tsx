import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PickerField, PickerSheet } from '@/components/picker-sheet'
import { Button } from '@/components/ui/button'
import {
  formatMonthTitle,
  formatNumericDate,
  formatShortDate,
  weekdayLabels,
} from '@/i18n/format'
import { isLanguage } from '@/i18n/language'
import { monthCells } from '@/lib/month-cells'
import { cn } from '@/lib/utils'

export interface DateRange {
  /** The first day, as `YYYY-MM-DD`. */
  from: string
  /** The last day, as `YYYY-MM-DD`, on or after `from`. */
  to: string
}

interface DateRangeSheetProps {
  from: string | null
  to: string | null
  onChange: (range: DateRange) => void
  /** The day to ring and to open on when no first day is set, as `YYYY-MM-DD`. */
  today?: string
}

interface MonthView {
  year: number
  month: number
}

const dayMs = 86_400_000

function viewOf(date: string): MonthView {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) }
}

function deviceToday(): string {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

function dayCount(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / dayMs) + 1
}

const navClass =
  'relative flex size-14 items-center justify-center rounded-full bg-muted outline-none after:absolute after:-inset-1 focus-visible:ring-3 focus-visible:ring-ring [@media(hover:hover)]:hover:bg-border'

/**
 * The trip's From and To fields, which open one Trip dates sheet setting both.
 * A first tap sets the first day, a second the last, and a third starts over.
 * A last tap before the first day becomes the new first day.
 */
export function DateRangeSheet({
  from,
  to,
  onChange,
  today,
}: DateRangeSheetProps) {
  const { t, i18n } = useTranslation()
  const language = isLanguage(i18n.language) ? i18n.language : 'en'
  const [open, setOpen] = useState(false)
  const [first, setFirst] = useState<string | null>(from)
  const [last, setLast] = useState<string | null>(to)
  // Empty until the first open, which sets it from the first day or today.
  const [view, setView] = useState<MonthView | null>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const fromRef = useRef<HTMLButtonElement>(null)
  const toRef = useRef<HTMLButtonElement>(null)
  const daysRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const monthId = useId()

  function openFrom(field: HTMLButtonElement | null) {
    setFirst(from)
    setLast(to)
    setView(viewOf(from ?? today ?? deviceToday()))
    openerRef.current = field
    setOpen(true)
  }

  function tap(date: string) {
    if (first === null || last !== null) {
      setFirst(date)
      setLast(null)
    } else if (date < first) {
      setFirst(date)
    } else {
      setLast(date)
    }
  }

  function step(by: 1 | -1) {
    setView((current) => {
      if (current === null) return current
      const index = current.year * 12 + (current.month - 1) + by
      return { year: Math.floor(index / 12), month: (index % 12) + 1 }
    })
  }

  function done() {
    if (first === null || last === null) return
    onChange({ from: first, to: last })
    setOpen(false)
  }

  function focusFirstDay() {
    const days = daysRef.current
    return (
      days?.querySelector<HTMLElement>('[aria-pressed="true"]') ??
      days?.querySelector<HTMLElement>('[data-today]') ??
      days?.querySelector<HTMLElement>('button') ??
      true
    )
  }

  const complete = first !== null && last !== null
  const calendarIcon = (
    <CalendarIcon aria-hidden="true" className="size-6" strokeWidth={2.2} />
  )

  return (
    <div className="grid grid-cols-2 gap-3">
      <PickerField
        ref={fromRef}
        label={t('controls.from')}
        value={from ? formatNumericDate(from, language) : ''}
        placeholder={t('controls.noDate')}
        icon={calendarIcon}
        expanded={open}
        onOpen={() => openFrom(fromRef.current)}
      />
      <PickerField
        ref={toRef}
        label={t('controls.to')}
        value={to ? formatNumericDate(to, language) : ''}
        placeholder={t('controls.noDate')}
        icon={calendarIcon}
        expanded={open}
        onOpen={() => openFrom(toRef.current)}
      />
      <PickerSheet
        open={open}
        onOpenChange={setOpen}
        title={t('controls.tripDates')}
        titleId={titleId}
        initialFocus={focusFirstDay}
        finalFocus={openerRef}
      >
        {view && (
          <>
            <div className="flex shrink-0 items-center justify-between px-1 pb-2">
              <h3 id={monthId} className="text-lg font-extrabold">
                {formatMonthTitle(view.year, view.month, language)}
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label={t('controls.previousMonth')}
                  onClick={() => step(-1)}
                  className={navClass}
                >
                  <ChevronLeftIcon aria-hidden="true" className="size-6" />
                </button>
                <button
                  type="button"
                  aria-label={t('controls.nextMonth')}
                  onClick={() => step(1)}
                  className={navClass}
                >
                  <ChevronRightIcon aria-hidden="true" className="size-6" />
                </button>
              </div>
            </div>
            <div
              aria-hidden="true"
              className="grid shrink-0 grid-cols-7 px-1.5 text-center text-sm font-extrabold text-muted-foreground"
            >
              {weekdayLabels(language).map((weekday) => (
                <span key={weekday} className="py-1.5">
                  {weekday}
                </span>
              ))}
            </div>
            <div
              ref={daysRef}
              role="group"
              aria-labelledby={monthId}
              className="grid shrink-0 grid-cols-7 px-1.5"
            >
              {monthCells(view.year, view.month)
                .flat()
                .map((cell) => {
                  const day = Number(cell.date.slice(8))
                  if (!cell.inMonth) {
                    return (
                      <span
                        key={cell.date}
                        aria-hidden="true"
                        className="flex h-12 items-center justify-center text-muted-foreground opacity-55"
                      >
                        {day}
                      </span>
                    )
                  }
                  const isEnd = cell.date === first || cell.date === last
                  const inBand =
                    complete &&
                    first !== last &&
                    cell.date >= first &&
                    cell.date <= last
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      aria-pressed={isEnd}
                      data-today={cell.date === today ? '' : undefined}
                      onClick={() => tap(cell.date)}
                      className={cn(
                        'group relative flex h-12 items-center justify-center text-base outline-none',
                        inBand &&
                          'before:absolute before:inset-y-0 before:bg-muted',
                        inBand &&
                          (cell.date === first
                            ? 'before:right-0 before:left-1/2'
                            : cell.date === last
                              ? 'before:right-1/2 before:left-0'
                              : 'before:inset-x-0'),
                      )}
                    >
                      <span
                        className={cn(
                          'relative flex aspect-square w-full max-w-12 items-center justify-center rounded-full group-focus-visible:outline-3 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring',
                          cell.date === today &&
                            'shadow-[inset_0_0_0_2px_var(--ring)]',
                          isEnd &&
                            'bg-primary font-extrabold text-primary-foreground',
                        )}
                      >
                        {day}
                      </span>
                    </button>
                  )
                })}
            </div>
          </>
        )}
        <div className="flex shrink-0 items-center justify-between gap-3 px-1 pt-3">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {first && last ? (
              <>
                <b className="text-foreground">
                  {formatShortDate(first, language)}
                </b>{' '}
                {t('controls.rangeTo')}{' '}
                <b className="text-foreground">
                  {formatShortDate(last, language)}
                </b>{' '}
                · {t('controls.dayCount', { count: dayCount(first, last) })}
              </>
            ) : first ? (
              <>
                <b className="text-foreground">
                  {formatShortDate(first, language)}
                </b>{' '}
                · {t('controls.pickLastDay')}
              </>
            ) : (
              t('controls.pickFirstDay')
            )}
          </p>
          <Button
            aria-disabled={!complete}
            onClick={done}
            className="shrink-0 aria-disabled:cursor-default aria-disabled:opacity-45"
          >
            {t('controls.done')}
          </Button>
        </div>
      </PickerSheet>
    </div>
  )
}
