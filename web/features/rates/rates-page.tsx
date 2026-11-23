import { type Rate, rateValue } from '@shared/rates.ts'
import { ArrowLeftRight } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useTrips } from '@/calendar-data/queries'
import { useClearRate, useRates, useSetRate } from '@/calendar-data/rates'
import { LoadFailed } from '@/components/load-failed'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Language } from '@/i18n/resources'
import { useLanguage } from '@/i18n/use-language'
import { ApiFailure } from '@/lib/api'
import { PageHeader } from '@/shell/page-header'

interface Pair {
  from: string
  to: string
}

interface PairRow {
  key: string
  /** The direction the row opens in: the stored one, else home first. */
  opens: Pair
  stored: Rate | undefined
}

function pairKey({ from, to }: Pair) {
  return [from, to].sort().join(':')
}

/**
 * Every pair a trip needs, home currency first, and every stored pair, once
 * each whichever way round it was stored.
 */
function pairRows(
  trips: readonly { currency: string; homeCurrency: string }[],
  rates: readonly Rate[],
): PairRow[] {
  const rows = new Map<string, PairRow>()
  for (const stored of rates) {
    rows.set(pairKey(stored), { key: pairKey(stored), opens: stored, stored })
  }
  for (const { currency, homeCurrency } of trips) {
    if (currency === homeCurrency) continue
    const pair = { from: homeCurrency, to: currency }
    const key = pairKey(pair)
    if (!rows.has(key)) rows.set(key, { key, opens: pair, stored: undefined })
  }
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key))
}

function marks(language: Language) {
  const parts = new Intl.NumberFormat(language).formatToParts(12_345.6)
  return {
    group: parts.find(({ type }) => type === 'group')?.value ?? ',',
    decimal: parts.find(({ type }) => type === 'decimal')?.value ?? '.',
  }
}

/**
 * A typed rate as the API's decimal string, in the language's own marks. A
 * group mark needs three digits after it, so `1.08` in Vietnamese is refused.
 */
function parseRate(text: string, language: Language) {
  const { group, decimal } = marks(language)
  const [whole = '', fraction, ...extra] = text
    .replace(/\s/g, '')
    .split(decimal)
  if (extra.length > 0) return null
  const [lead = '', ...groups] = whole.split(group)
  if (
    groups.length > 0 &&
    (!/^\d{1,3}$/.test(lead) || groups.some((part) => !/^\d{3}$/.test(part)))
  ) {
    return null
  }
  const plain = [lead, ...groups].join('')
  const parsed = rateValue.safeParse(
    fraction === undefined ? plain : `${plain}.${fraction}`,
  )
  return parsed.success ? parsed.data : null
}

/** A stored rate written the way the field takes it, digit for digit. */
function rateText(value: string, language: Language) {
  return value.replace('.', marks(language).decimal)
}

function failureKey(error: unknown) {
  return error instanceof ApiFailure && error.code === 'network'
    ? 'errors.network'
    : 'errors.generic'
}

/** The admin's exchange rates, one row per currency pair the trips use. */
export function RatesPage() {
  const { t } = useTranslation()
  const rates = useRates()
  const trips = useTrips()

  const header = <PageHeader title={t('rates.title')} backTo="/settings" />

  if (rates.isPending || trips.isPending) {
    return (
      <>
        {header}
        <p role="status" className="text-base text-muted-foreground">
          {t('rates.loading')}
        </p>
      </>
    )
  }

  if (rates.isError || trips.isError) {
    return (
      <>
        {header}
        <LoadFailed
          message={t('rates.loadFailed')}
          error={rates.error ?? trips.error}
          onRetry={() => {
            void rates.refetch()
            void trips.refetch()
          }}
        />
      </>
    )
  }

  const rows = pairRows(trips.data, rates.data)

  return (
    <>
      {header}
      <p className="pb-4 text-base text-muted-foreground">{t('rates.intro')}</p>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-base">
          {t('rates.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((row) => (
            <li key={row.key}>
              <RateForm opens={row.opens} stored={row.stored} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

type Outcome =
  | { kind: 'saved' | 'cleared'; message: string }
  | { kind: 'failed'; message: string }

function RateForm({ opens, stored }: { opens: Pair; stored?: Rate }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const ids = useId()
  const setRate = useSetRate()
  const clearRate = useClearRate()
  const [pair, setPair] = useState(opens)
  const [text, setText] = useState(() =>
    stored === undefined ? '' : rateText(stored.rate, language),
  )
  const [invalid, setInvalid] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const pending = setRate.isPending || clearRate.isPending
  const shown =
    stored !== undefined && stored.from === pair.from && stored.to === pair.to
      ? stored
      : undefined

  function swap() {
    const next = { from: pair.to, to: pair.from }
    setPair(next)
    setInvalid(false)
    setOutcome(null)
    const matches =
      stored !== undefined && stored.from === next.from && stored.to === next.to
    setText(matches ? rateText(stored.rate, language) : '')
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const value = parseRate(text, language)
    setOutcome(null)
    if (value === null) {
      setInvalid(true)
      return
    }
    try {
      await setRate.mutateAsync({ ...pair, rate: value })
      setOutcome({ kind: 'saved', message: t('rates.saved') })
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'validation_failed') {
        setInvalid(true)
        return
      }
      setOutcome({ kind: 'failed', message: t(failureKey(error)) })
    }
  }

  async function onClear() {
    if (pending || stored === undefined) return
    setOutcome(null)
    try {
      await clearRate.mutateAsync(stored)
      setText('')
      setInvalid(false)
      setOutcome({ kind: 'cleared', message: t('rates.cleared') })
    } catch (error) {
      setOutcome({ kind: 'failed', message: t(failureKey(error)) })
    }
  }

  const fieldId = `${ids}-rate`
  const statusId = `${ids}-status`
  const errorId = `${ids}-error`

  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={pending}
      className="flex flex-col gap-3 rounded-xl border-[1.5px] border-border bg-card px-4.5 py-4 text-card-foreground"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          aria-hidden="true"
          className="w-full text-lg font-extrabold min-[480px]:w-auto"
        >
          {t('rates.one', { currency: pair.from })}
        </span>
        <Input
          id={fieldId}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-label={t('rates.field', { from: pair.from, to: pair.to })}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${errorId} ${statusId}` : statusId}
          onChange={(event) => {
            setText(event.target.value)
            setOutcome(null)
            if (invalid) {
              setInvalid(parseRate(event.target.value, language) === null)
            }
          }}
          className="min-w-0 flex-1"
        />
        <span aria-hidden="true" className="shrink-0 text-lg font-extrabold">
          {pair.to}
        </span>
      </div>
      {invalid && (
        <p id={errorId} className="text-sm">
          {t('rates.invalid')}
        </p>
      )}
      <p id={statusId} className="text-sm text-muted-foreground">
        {shown === undefined
          ? t('rates.notSet')
          : t('rates.setOn', {
              date: new Intl.DateTimeFormat(language, {
                day: 'numeric',
                month: 'numeric',
                year: 'numeric',
              }).format(new Date(shown.updatedAt)),
            })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" aria-busy={setRate.isPending}>
          {t(setRate.isPending ? 'rates.saving' : 'rates.save')}
        </Button>
        {stored !== undefined && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void onClear()}
            aria-busy={clearRate.isPending}
          >
            {t(clearRate.isPending ? 'rates.clearing' : 'rates.clear')}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={swap}
          aria-label={t('rates.swap', { currency: pair.to })}
          className="size-target ml-auto shrink-0 px-0"
        >
          <ArrowLeftRight aria-hidden="true" />
        </Button>
      </div>
      {outcome !== null && (
        <p
          role={outcome.kind === 'failed' ? 'alert' : 'status'}
          className="rounded-xl bg-muted px-4 py-3 text-base"
        >
          {outcome.message}
        </p>
      )}
    </form>
  )
}
