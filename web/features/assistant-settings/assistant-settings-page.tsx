import { Radio as RadioPrimitive } from '@base-ui/react/radio'
import {
  type AssistantModel,
  assistantModel,
  type AssistantStatus,
} from '@shared/assistant.ts'
import type { NoticeSetting } from '@shared/notices.ts'
import {
  type VoiceAdmin,
  type VoiceModel,
  voiceModel,
  type VoiceUsage,
} from '@shared/voice.ts'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup } from '@/components/ui/radio-group'
import {
  failureKey,
  readAssistantStatus,
  readContact,
  readNoticeSetting,
  readVoice,
  saveContact,
  saveModel,
  saveVoiceModel,
} from '@/features/assistant-settings/assistant-settings-api'
import { NotifyMe } from '@/features/assistant-settings/notify-me'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/shell/page-header'

// The contact schema's own bound, checked here so the field says so before
// a request goes out.
const CONTACT_MAX = 60

const MODELS = [
  {
    value: 'lichtrinh-assistant',
    name: 'assistantSettings.modelQwen',
    hint: 'assistantSettings.modelQwenHint',
  },
  {
    value: 'lichtrinh-assistant-gemma',
    name: 'assistantSettings.modelGemma',
    hint: 'assistantSettings.modelGemmaHint',
  },
] as const satisfies readonly {
  value: AssistantModel
  name: string
  hint: string
}[]

const SPEECH_MODELS = [
  {
    value: 'qwen3-asr-1.7b',
    name: 'assistantSettings.speech.qwen',
    hint: 'assistantSettings.speech.qwenHint',
  },
  {
    value: 'whisper-large-v3-turbo',
    name: 'assistantSettings.speech.whisper',
    hint: 'assistantSettings.speech.whisperHint',
  },
  {
    value: 'phowhisper-large',
    name: 'assistantSettings.speech.phowhisper',
    hint: 'assistantSettings.speech.phowhisperHint',
  },
] as const satisfies readonly {
  value: VoiceModel
  name: string
  hint: string
}[]

type Load =
  | { state: 'loading' }
  | { state: 'failed' }
  | {
      state: 'ready'
      status: AssistantStatus
      contactName: string | null
      voice: VoiceAdmin
      notices: NoticeSetting
    }

type Outcome =
  | { kind: 'saved'; message: string }
  | { kind: 'failed'; message: string }

function useAssistantSettings() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([
      readAssistantStatus(),
      readContact(),
      readVoice(),
      readNoticeSetting(),
    ]).then(
      ([status, contactName, voice, notices]) => {
        if (live) {
          setLoad({ state: 'ready', status, contactName, voice, notices })
        }
      },
      () => {
        if (live) setLoad({ state: 'failed' })
      },
    )
    return () => {
      live = false
    }
  }, [attempt])

  function retry() {
    setLoad({ state: 'loading' })
    setAttempt((count) => count + 1)
  }

  return { load, retry }
}

/**
 * The admin's assistant page: the home computer, both models, the contact, and
 * how to hear that either is off.
 */
export function AssistantSettingsPage() {
  const { t } = useTranslation()
  const { load, retry } = useAssistantSettings()

  return (
    <>
      <PageHeader title={t('assistantSettings.title')} backTo="/settings" />

      {load.state === 'loading' && (
        <p role="status" className="text-base text-muted-foreground">
          {t('assistantSettings.loading')}
        </p>
      )}

      {load.state === 'failed' && (
        <div
          role="alert"
          className="flex flex-col items-start gap-4 rounded-xl bg-muted p-4"
        >
          <p className="text-base">{t('assistantSettings.loadFailed')}</p>
          <Button onClick={retry}>{t('shell.retry')}</Button>
        </div>
      )}

      {load.state === 'ready' && (
        <div className="flex flex-col gap-6">
          <HomeComputerCard status={load.status} />
          <ModelPicker saved={load.status.model} />
          <SpeechPicker voice={load.voice} />
          <ContactForm saved={load.contactName} />
          <NotifyMe saved={load.notices} />
          <p className="rounded-2xl bg-muted px-3.5 py-3 text-sm text-muted-foreground">
            {t('assistantSettings.note')}
          </p>
        </div>
      )}
    </>
  )
}

function HomeComputerCard({ status }: { status: AssistantStatus }) {
  const { t } = useTranslation()

  return (
    <section className="rounded-xl border-[1.5px] border-border bg-card px-4.5 py-4">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-lg font-extrabold">
          {t('assistantSettings.homeComputer')}
        </h2>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-extrabold',
            status.online
              ? 'bg-activity text-activity-ink'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-2.5 rounded-full border-2 border-current',
              status.online && 'bg-current',
            )}
          />
          {t(
            status.online
              ? 'assistantSettings.online'
              : 'assistantSettings.offline',
          )}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        <LastAnswered at={status.lastAnsweredAt} />
      </p>
    </section>
  )
}

function LastAnswered({ at }: { at: string | null }) {
  const { t, i18n } = useTranslation()
  // Read once on mount, since the page is reloaded long before a day turns.
  const [today] = useState(() => new Date().toDateString())
  if (at === null) return t('assistantSettings.neverAnswered')

  const answered = new Date(at)
  if (answered.toDateString() === today) {
    const time = new Intl.DateTimeFormat(i18n.language, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(answered)
    return t('assistantSettings.lastAnsweredToday', { time })
  }
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(answered)
  return t('assistantSettings.lastAnsweredOn', { date })
}

function ModelPicker({ saved }: { saved: AssistantModel }) {
  const { t } = useTranslation()
  const ids = useId()
  const [model, setModel] = useState(saved)
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  async function onPick(value: unknown) {
    const picked = assistantModel.safeParse(value)
    if (!picked.success || pending || picked.data === model) return
    const previous = model
    setModel(picked.data)
    setPending(true)
    setOutcome(null)
    try {
      setModel(await saveModel(picked.data))
      setOutcome({ kind: 'saved', message: t('assistantSettings.modelSaved') })
    } catch (error) {
      setModel(previous)
      setOutcome({ kind: 'failed', message: t(failureKey(error)) })
    } finally {
      setPending(false)
    }
  }

  return (
    <section aria-labelledby={`${ids}-heading`} aria-busy={pending}>
      <h2
        id={`${ids}-heading`}
        className="text-sm font-extrabold text-muted-foreground"
      >
        {t('assistantSettings.modelHeading')}
      </h2>
      <RadioGroup
        value={model}
        onValueChange={(value) => void onPick(value)}
        aria-labelledby={`${ids}-heading`}
        className="gap-0"
      >
        {MODELS.map(({ value, name, hint }) => (
          <label
            key={value}
            className="flex min-h-18 cursor-pointer items-center gap-3.5 border-b-[1.5px] border-border py-3"
          >
            <RadioPrimitive.Root
              value={value}
              aria-labelledby={`${ids}-${value}-name`}
              aria-describedby={`${ids}-${value}-hint`}
              className="size-7 shrink-0 rounded-full border-[3px] border-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-foreground data-checked:bg-foreground data-checked:shadow-[inset_0_0_0_6px_var(--background)]"
            />
            <span className="flex flex-col">
              <span
                id={`${ids}-${value}-name`}
                className="text-lg font-extrabold"
              >
                {t(name)}
              </span>
              <span
                id={`${ids}-${value}-hint`}
                className="text-sm text-muted-foreground"
              >
                {t(hint)}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>
      <OutcomeLine outcome={outcome} />
    </section>
  )
}

function SpeechPicker({ voice }: { voice: VoiceAdmin }) {
  const { t } = useTranslation()
  const ids = useId()
  const [model, setModel] = useState(voice.model)
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  async function onPick(value: unknown) {
    const picked = voiceModel.safeParse(value)
    if (!picked.success || pending || picked.data === model) return
    const previous = model
    setModel(picked.data)
    setPending(true)
    setOutcome(null)
    try {
      setModel(await saveVoiceModel(picked.data))
      setOutcome({
        kind: 'saved',
        message: t('assistantSettings.speech.saved'),
      })
    } catch (error) {
      setModel(previous)
      setOutcome({ kind: 'failed', message: t(failureKey(error)) })
    } finally {
      setPending(false)
    }
  }

  return (
    <section aria-labelledby={`${ids}-heading`} aria-busy={pending}>
      <h2
        id={`${ids}-heading`}
        className="text-sm font-extrabold text-muted-foreground"
      >
        {t('assistantSettings.speech.heading')}
      </h2>
      <RadioGroup
        value={model}
        onValueChange={(value) => void onPick(value)}
        aria-labelledby={`${ids}-heading`}
        className="gap-0"
      >
        {SPEECH_MODELS.map(({ value, name, hint }) => (
          <label
            key={value}
            className="flex min-h-18 cursor-pointer items-center gap-3.5 border-b-[1.5px] border-border py-3"
          >
            <RadioPrimitive.Root
              value={value}
              aria-labelledby={`${ids}-${value}-name`}
              aria-describedby={`${ids}-${value}-hint ${ids}-${value}-usage`}
              className="size-7 shrink-0 rounded-full border-[3px] border-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-foreground data-checked:bg-foreground data-checked:shadow-[inset_0_0_0_6px_var(--background)]"
            />
            <span className="flex flex-col">
              <span
                id={`${ids}-${value}-name`}
                className="text-lg font-extrabold"
              >
                {t(name)}
              </span>
              <span
                id={`${ids}-${value}-hint`}
                className="text-sm text-muted-foreground"
              >
                {t(hint)}
              </span>
              <span
                id={`${ids}-${value}-usage`}
                className="text-sm text-muted-foreground"
              >
                <UsageLine
                  usage={voice.usage.find((row) => row.model === value)}
                />
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>
      <OutcomeLine outcome={outcome} />
    </section>
  )
}

/** How a model did in use: its clips, how many went out, and the edits to those. */
function UsageLine({ usage }: { usage: VoiceUsage | undefined }) {
  const { t, i18n } = useTranslation()
  if (usage === undefined || usage.clips === 0) {
    return t('assistantSettings.speech.unused')
  }
  if (usage.meanEditRatio === null) {
    return t('assistantSettings.speech.unsent', { count: usage.clips })
  }
  const share = new Intl.NumberFormat(i18n.language, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(usage.meanEditRatio)
  return t('assistantSettings.speech.usage', {
    count: usage.clips,
    sent: usage.sent,
    share,
  })
}

function ContactForm({ saved }: { saved: string | null }) {
  const { t } = useTranslation()
  const ids = useId()
  const fieldRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(saved ?? '')
  const [tooLong, setTooLong] = useState(false)
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const trimmed = name.trim()
    if (trimmed.length > CONTACT_MAX) {
      setTooLong(true)
      fieldRef.current?.focus()
      return
    }
    setPending(true)
    setOutcome(null)
    try {
      const contactName = await saveContact(trimmed === '' ? null : trimmed)
      setName(contactName ?? '')
      setOutcome({
        kind: 'saved',
        message: t(
          contactName === null
            ? 'assistantSettings.contactCleared'
            : 'assistantSettings.contactSaved',
        ),
      })
    } catch (error) {
      setOutcome({ kind: 'failed', message: t(failureKey(error)) })
    } finally {
      setPending(false)
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-2">
      <Label htmlFor={`${ids}-contact`}>
        {t('assistantSettings.contactLabel')}
      </Label>
      <div className="flex gap-2.5">
        <Input
          ref={fieldRef}
          id={`${ids}-contact`}
          autoComplete="off"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setOutcome(null)
            if (event.target.value.trim().length <= CONTACT_MAX) {
              setTooLong(false)
            }
          }}
          aria-invalid={tooLong}
          aria-describedby={
            tooLong
              ? `${ids}-contact-error ${ids}-contact-hint`
              : `${ids}-contact-hint`
          }
          className="flex-1"
        />
        <Button type="submit" aria-busy={pending}>
          {t(pending ? 'assistantSettings.saving' : 'assistantSettings.save')}
        </Button>
      </div>
      {tooLong && (
        <p id={`${ids}-contact-error`} className="text-sm">
          {t('assistantSettings.contactTooLong')}
        </p>
      )}
      <p id={`${ids}-contact-hint`} className="text-sm text-muted-foreground">
        {t('assistantSettings.contactHint')}
      </p>
      <OutcomeLine outcome={outcome} />
    </form>
  )
}

function OutcomeLine({ outcome }: { outcome: Outcome | null }) {
  if (outcome === null) return null
  return (
    <p
      role={outcome.kind === 'saved' ? 'status' : 'alert'}
      className="mt-3 rounded-xl bg-muted px-4 py-3 text-base"
    >
      {outcome.message}
    </p>
  )
}
