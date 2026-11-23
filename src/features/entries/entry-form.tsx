import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { type EntryKind, entryKind } from '@shared/changes.ts'
import type { Entry } from '@shared/entries.ts'
import { localDate } from '@shared/trip-time.ts'
import type { Trip } from '@shared/trips.ts'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import { useCreateEntry, useUpdateEntry } from '@/calendar-data/mutations'
import { useEntry, useTrip } from '@/calendar-data/queries'
import { KindGlyph } from '@/components/kind-icons'
import { kindLabelKey, kindTone } from '@/components/kinds'
import { LoadFailed } from '@/components/load-failed'
import { SaveError } from '@/components/save-error'
import { SheetList } from '@/components/sheet-list'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useOfferUndo } from '@/components/undo-context'
import { costText, parseCost } from '@/features/entries/cost'
import { DeleteSheet } from '@/features/entries/delete-sheet'
import { endFor, lengthOptions, startTimes } from '@/features/entries/lengths'
import { prefillFor } from '@/features/entries/prefill'
import { formatDuration, formatLongDate, formatTime } from '@/i18n/format'
import { useLanguage } from '@/i18n/use-language'
import { ApiFailure } from '@/lib/api'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/shell/page-header'

const titleLimit = 120
const dayMs = 86_400_000

interface FieldErrors {
  title?: 'required' | 'tooLong'
  cost?: 'invalid'
}

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMs)
    .toISOString()
    .slice(0, 10)
}

function lengthOf(entry: Entry) {
  const start = Date.parse(`${entry.startsOn}T${entry.startTime}:00Z`)
  const end = Date.parse(`${entry.endsOn}T${entry.endTime}:00Z`)
  return Math.round((end - start) / 60_000)
}

// The assistant can set any start, and an edit must not drop it.
function startOptions(current: string) {
  return startTimes.includes(current)
    ? startTimes
    : [...startTimes, current].sort()
}

function dayPathOf(tripId: string, date: string) {
  return `/trips/${encodeURIComponent(tripId)}/days/${date}`
}

interface EntryFormProps {
  trip: Trip
  /** The start date, which the form never moves. */
  date: string
  /** The entry being edited, or undefined when adding. */
  initial?: Entry
  /** The day's entries, which the add prefill reads. */
  dayEntries: Entry[]
  /** Reads the entry again after a stale save, for its new version. */
  onReload?: () => Promise<Entry | undefined>
}

/**
 * Add and edit share this form: a title, an optional kind, Starts and How
 * long through the sheet list, a cost in the trip currency, and notes. A
 * failed save keeps every field as typed.
 */
export function EntryForm({
  trip,
  date,
  initial,
  dayEntries,
  onReload,
}: EntryFormProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const offerUndo = useOfferUndo()
  const ids = useId()
  const create = useCreateEntry()
  const update = useUpdateEntry()
  const [prefill] = useState(() => prefillFor(dayEntries))
  // Kept for the form's life, so a retry after a lost answer reuses it.
  const [id] = useState(() => initial?.id ?? crypto.randomUUID())
  const [version, setVersion] = useState(initial?.version ?? 1)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [kind, setKind] = useState<EntryKind | null>(initial?.kind ?? null)
  const [startTime, setStartTime] = useState(
    initial?.startTime ?? prefill.startTime,
  )
  const [minutes, setMinutes] = useState(
    initial === undefined ? prefill.minutes : lengthOf(initial),
  )
  const [cost, setCost] = useState(
    initial?.costMinor == null
      ? ''
      : costText(initial.costMinor, trip.currency, language),
  )
  // The marks a cost reads by are the ones it was typed in, since the toggle
  // can switch the language between typing and Save.
  const [costLanguage, setCostLanguage] = useState(language)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const costRef = useRef<HTMLInputElement>(null)
  const failureRef = useRef<HTMLDivElement>(null)
  const pending = create.isPending || update.isPending
  const end = endFor(startTime, minutes)
  const kindLabelId = `${ids}-kind`

  useEffect(() => {
    if (failure !== null) failureRef.current?.focus()
  }, [failure])

  function titleError(value: string): FieldErrors['title'] {
    if (value === '') return 'required'
    return value.length > titleLimit ? 'tooLong' : undefined
  }

  async function onFailed(error: Error) {
    if (error instanceof ApiFailure && error.code === 'edit_conflict') {
      const fresh = await onReload?.()
      if (fresh !== undefined) setVersion(fresh.version)
      setFailure(t('entries.editConflict'))
      return
    }
    setFailure(
      t(
        error instanceof ApiFailure && error.code === 'network'
          ? 'entries.notSavedNetwork'
          : 'entries.notSavedGeneric',
      ),
    )
  }

  function onSubmit(event?: FormEvent) {
    event?.preventDefault()
    if (pending) return
    const trimmed = title.trim()
    const parsed = parseCost(cost, trip.currency, costLanguage)
    const next: FieldErrors = {
      title: titleError(trimmed),
      cost: parsed.ok ? undefined : 'invalid',
    }
    setErrors(next)
    if (next.title !== undefined) return titleRef.current?.focus()
    if (!parsed.ok) return costRef.current?.focus()
    setFailure(null)
    const fields = {
      title: trimmed,
      notes: notes.trim() === '' ? null : notes,
      kind,
      startTime,
      endsOn: addDays(date, end.daysLater),
      endTime: end.time,
      costMinor: parsed.minor,
    }
    if (initial === undefined) {
      create.mutate(
        { id, tripId: trip.id, startsOn: date, ...fields },
        {
          onSuccess: ({ entry, changeId }) => {
            offerUndo(t('undo.added', { title: entry.title }), changeId)
            void navigate(dayPathOf(trip.id, date), { replace: true })
          },
          onError: (error) => void onFailed(error),
        },
      )
      return
    }
    update.mutate(
      { id, version, ...fields },
      {
        onSuccess: ({ entry, changeId }) => {
          offerUndo(t('undo.saved', { title: entry.title }), changeId)
          void navigate(`/entries/${encodeURIComponent(entry.id)}`, {
            replace: true,
          })
        },
        onError: (error) => void onFailed(error),
      },
    )
  }

  const backTo =
    initial === undefined
      ? dayPathOf(trip.id, date)
      : `/entries/${encodeURIComponent(initial.id)}`

  return (
    <>
      <PageHeader
        title={t(
          initial === undefined ? 'entries.addTitle' : 'entries.editTitle',
        )}
        backTo={backTo}
      />
      <p className="-mt-2 pb-4 text-base text-muted-foreground">
        {formatLongDate(date, language)} · {trip.name}
      </p>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${ids}-title`}>{t('entries.what')}</Label>
          <Input
            ref={titleRef}
            id={`${ids}-title`}
            autoComplete="off"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              if (titleError(event.target.value.trim()) === undefined) {
                setErrors((current) => ({ ...current, title: undefined }))
              }
            }}
            aria-invalid={errors.title !== undefined}
            aria-describedby={`${ids}-title-hint${errors.title === undefined ? '' : ` ${ids}-title-error`}`}
          />
          <p id={`${ids}-title-hint`} className="text-sm text-muted-foreground">
            {t('entries.whatHint')}
          </p>
          {errors.title !== undefined && (
            <p id={`${ids}-title-error`} className="text-sm">
              {t(
                errors.title === 'tooLong'
                  ? 'entries.titleTooLong'
                  : 'entries.titleRequired',
              )}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span id={kindLabelId} className="text-sm font-extrabold">
            {t('entries.kind')}
          </span>
          <ToggleGroup
            aria-labelledby={kindLabelId}
            aria-describedby={`${ids}-kind-hint`}
            value={kind === null ? [] : [kind]}
            onValueChange={([next]) => {
              const parsed = entryKind.safeParse(next)
              setKind(parsed.success ? parsed.data : null)
            }}
            className="grid grid-cols-3 gap-1.5 min-[480px]:grid-cols-5"
          >
            {entryKind.options.map((option) => (
              <Toggle
                key={option}
                value={option}
                className={cn(
                  'flex min-h-target min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-transparent px-0.5 py-1.5 text-sm font-extrabold outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-pressed:border-foreground',
                  kindTone[option],
                )}
              >
                <KindGlyph kind={option} className="size-6" />
                <span className="max-w-full truncate">
                  {t(kindLabelKey[option])}
                </span>
              </Toggle>
            ))}
          </ToggleGroup>
          <p id={`${ids}-kind-hint`} className="text-sm text-muted-foreground">
            {t('entries.kindHint')}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-3">
            <SheetList
              label={t('entries.starts')}
              value={startTime}
              options={startOptions(startTime).map((time) => ({
                value: time,
                label: formatTime(time, language),
              }))}
              onChange={setStartTime}
            />
            <SheetList
              label={t('entries.howLong')}
              value={String(minutes)}
              options={lengthOptions(minutes).map((length) => ({
                value: String(length),
                label: formatDuration(length, language),
              }))}
              onChange={(next) => setMinutes(Number(next))}
            />
          </div>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {t(end.daysLater > 0 ? 'entries.endsNextDay' : 'entries.ends', {
              time: formatTime(end.time, language),
            })}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${ids}-cost`}>{t('entries.cost')}</Label>
          <Input
            ref={costRef}
            id={`${ids}-cost`}
            inputMode="decimal"
            autoComplete="off"
            value={cost}
            onChange={(event) => {
              setCost(event.target.value)
              setCostLanguage(language)
              if (parseCost(event.target.value, trip.currency, language).ok) {
                setErrors((current) => ({ ...current, cost: undefined }))
              }
            }}
            aria-invalid={errors.cost !== undefined}
            aria-describedby={`${ids}-cost-hint${errors.cost === undefined ? '' : ` ${ids}-cost-error`}`}
          />
          <p id={`${ids}-cost-hint`} className="text-sm text-muted-foreground">
            {t('entries.costHint', { currency: trip.currency })}
          </p>
          {errors.cost !== undefined && (
            <p id={`${ids}-cost-error`} className="text-sm">
              {t('entries.costInvalid')}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${ids}-notes`}>{t('entries.notes')}</Label>
          <textarea
            id={`${ids}-notes`}
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            aria-describedby={`${ids}-notes-hint`}
            className="w-full min-w-0 rounded-lg border-2 border-input bg-card px-4 py-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p id={`${ids}-notes-hint`} className="text-sm text-muted-foreground">
            {t('entries.notesHint')}
          </p>
        </div>

        {failure !== null && (
          <SaveError
            ref={failureRef}
            message={failure}
            onRetry={() => onSubmit()}
          />
        )}

        <Button type="submit" aria-busy={pending}>
          {pending
            ? t('entries.saving')
            : t(initial === undefined ? 'entries.save' : 'entries.saveChanges')}
        </Button>
        {initial !== undefined && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDeleting(true)}
            className="bg-muted"
          >
            {t('entries.deleteThis')}
          </Button>
        )}
      </form>
      {initial !== undefined && (
        <DeleteSheet
          entry={deleting ? initial : null}
          onClose={() => setDeleting(false)}
          onDeleted={() =>
            void navigate(dayPathOf(trip.id, initial.startsOn), {
              replace: true,
            })
          }
        />
      )}
    </>
  )
}

function Loading() {
  const { t } = useTranslation()
  return (
    <p role="status" className="pt-4 text-base text-muted-foreground">
      {t('shell.loading')}
    </p>
  )
}

/** `/entries/new?trip=<id>&date=<YYYY-MM-DD>`, opened from a day's Add. */
export function AddEntryPage() {
  const { t } = useTranslation()
  const [search] = useSearchParams()
  const tripId = search.get('trip') ?? undefined
  const date = localDate.safeParse(search.get('date'))
  const query = useTrip(tripId)

  if (query.isPending && tripId !== undefined) return <Loading />
  if (query.isError) {
    return (
      <>
        <PageHeader title={t('entries.addTitle')} backTo="/trips" />
        <LoadFailed
          message={t('day.loadFailed')}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      </>
    )
  }
  const trip = query.data?.trip
  if (
    trip === undefined ||
    !date.success ||
    date.data < trip.startsOn ||
    date.data > trip.endsOn
  ) {
    return (
      <>
        <PageHeader title={t('entries.addTitle')} backTo="/trips" />
        <p className="text-base text-muted-foreground">{t('day.notInTrip')}</p>
      </>
    )
  }
  return (
    <EntryForm
      trip={trip}
      date={date.data}
      dayEntries={(query.data?.entries ?? []).filter(
        (entry) => entry.startsOn === date.data,
      )}
    />
  )
}

/** `/entries/:entryId/edit`, opened from the entry's detail. */
export function EditEntryPage() {
  const { t } = useTranslation()
  const { entryId = '' } = useParams()
  const entry = useEntry(entryId)
  const trip = useTrip(entry.data?.tripId)

  if (entry.isError || trip.isError) {
    const missing =
      entry.error instanceof ApiFailure && entry.error.code === 'not_found'
    return (
      <>
        <PageHeader title={t('entries.editTitle')} backTo="/" />
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
  if (entry.data === undefined || trip.data === undefined) return <Loading />

  return (
    <EntryForm
      trip={trip.data.trip}
      date={entry.data.startsOn}
      initial={entry.data}
      dayEntries={[]}
      onReload={async () => (await entry.refetch()).data}
    />
  )
}
