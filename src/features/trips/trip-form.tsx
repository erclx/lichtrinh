import { nowInZone } from '@shared/trip-time.ts'
import type { Trip } from '@shared/trips.ts'
import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { useCreateTrip } from '@/calendar-data/mutations'
import { useTrips } from '@/calendar-data/queries'
import { DateRangeSheet } from '@/components/date-range-sheet'
import { SaveError } from '@/components/save-error'
import { SheetList } from '@/components/sheet-list'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useOfferUndo } from '@/components/undo-context'
import {
  currencyOptions,
  deviceZone,
  zoneOptions,
} from '@/features/trips/zone-options'
import { useLanguage } from '@/i18n/use-language'
import { ApiFailure } from '@/lib/api'
import { PageHeader } from '@/shell/page-header'

const nameLimit = 80

interface FieldErrors {
  name?: 'required' | 'tooLong'
  dates?: 'required'
}

// The family plans from Vietnam, so a first trip starts in dong and dollars,
// and every later one starts on the latest trip's pair.
function currencyDefaults(trips: Trip[] | undefined) {
  const latest = trips?.reduce<Trip | undefined>(
    (last, trip) =>
      last === undefined || trip.startsOn > last.startsOn ? trip : last,
    undefined,
  )
  return {
    currency: latest?.currency ?? 'VND',
    homeCurrency: latest?.homeCurrency ?? 'USD',
  }
}

export function TripForm() {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const offerUndo = useOfferUndo()
  const ids = useId()
  const trips = useTrips()
  const create = useCreateTrip()
  // Kept for the form's life, so a retry after a lost answer reuses it.
  const [id] = useState(() => crypto.randomUUID())
  const [name, setName] = useState('')
  const [dates, setDates] = useState<{ from: string; to: string } | null>(null)
  const [zone, setZone] = useState(deviceZone)
  const [currency, setCurrency] = useState<string | null>(null)
  const [homeCurrency, setHomeCurrency] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const nameRef = useRef<HTMLInputElement>(null)
  const saveErrorRef = useRef<HTMLDivElement>(null)

  const [opened] = useState(() => new Date())
  const zones = useMemo(() => zoneOptions(language, opened), [language, opened])
  const currencies = useMemo(() => currencyOptions(language), [language])
  const defaults = currencyDefaults(trips.data)
  const chosenCurrency = currency ?? defaults.currency
  const chosenHome = homeCurrency ?? defaults.homeCurrency

  function nameError(value: string): FieldErrors['name'] {
    if (value === '') return 'required'
    return value.length > nameLimit ? 'tooLong' : undefined
  }

  function onSubmit(event?: FormEvent) {
    event?.preventDefault()
    if (create.isPending) return
    const trimmed = name.trim()
    const next: FieldErrors = {
      name: nameError(trimmed),
      dates: dates === null ? 'required' : undefined,
    }
    setErrors(next)
    if (next.name !== undefined) return nameRef.current?.focus()
    if (dates === null) return
    create.mutate(
      {
        id,
        name: trimmed,
        startsOn: dates.from,
        endsOn: dates.to,
        timeZone: zone,
        currency: chosenCurrency,
        homeCurrency: chosenHome,
      },
      {
        onSuccess: ({ trip, changeId }) => {
          offerUndo(t('undo.created', { title: trip.name }), changeId)
          void navigate(`/trips/${encodeURIComponent(trip.id)}`, {
            replace: true,
          })
        },
      },
    )
  }

  // The card mounts with the failure, so focus moves once it is there.
  useEffect(() => {
    if (create.error !== null) saveErrorRef.current?.focus()
  }, [create.error])

  const saveFailure =
    create.error instanceof ApiFailure && create.error.code === 'network'
      ? t('entries.notSavedNetwork')
      : t('entries.notSavedGeneric')

  return (
    <>
      <PageHeader title={t('trips.newTrip')} backTo="/trips" />
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${ids}-name`}>{t('trips.name')}</Label>
          <Input
            ref={nameRef}
            id={`${ids}-name`}
            autoComplete="off"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (nameError(event.target.value.trim()) === undefined) {
                setErrors((current) => ({ ...current, name: undefined }))
              }
            }}
            aria-invalid={errors.name !== undefined}
            aria-describedby={
              errors.name !== undefined ? `${ids}-name-error` : undefined
            }
          />
          {errors.name !== undefined && (
            <p id={`${ids}-name-error`} className="text-sm">
              {t(
                errors.name === 'tooLong'
                  ? 'trips.nameTooLong'
                  : 'trips.nameRequired',
              )}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <DateRangeSheet
            from={dates?.from ?? null}
            to={dates?.to ?? null}
            today={nowInZone(opened, zone).date}
            onChange={(range) => {
              setDates(range)
              setErrors((current) => ({ ...current, dates: undefined }))
            }}
          />
          {errors.dates !== undefined && (
            <p role="alert" className="text-sm">
              {t('trips.datesRequired')}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <SheetList
            label={t('trips.localTime')}
            value={zone}
            options={zones}
            onChange={setZone}
            filterable
          />
          <p className="text-sm text-muted-foreground">
            {t('trips.localTimeHint')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SheetList
            label={t('trips.tripCurrency')}
            value={chosenCurrency}
            options={currencies}
            onChange={setCurrency}
            filterable
          />
          <SheetList
            label={t('trips.homeCurrency')}
            value={chosenHome}
            options={currencies}
            onChange={setHomeCurrency}
            filterable
          />
        </div>

        {create.isError && (
          <SaveError
            ref={saveErrorRef}
            message={saveFailure}
            onRetry={() => onSubmit()}
          />
        )}

        <Button type="submit" aria-disabled={create.isPending}>
          {create.isPending ? t('trips.creating') : t('trips.create')}
        </Button>
      </form>
    </>
  )
}
