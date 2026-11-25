import { noticeEmailWrite, type NoticeSetting } from '@shared/notices.ts'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  failureKey,
  saveNoticeEmail,
  savePushDevice,
  turnEmailOff,
  turnPushOff,
} from '@/features/assistant-settings/assistant-settings-api'
import {
  type PushAnswer,
  readPushAnswer,
  subscribeDevice,
  unsubscribeDevice,
} from '@/features/assistant-settings/push-device'
import { ApiFailure } from '@/lib/api'
import { cn } from '@/lib/utils'

const box = 'rounded-xl bg-muted px-4 py-3'

/**
 * How the signed-in admin hears that the assistant or voice is off. Each way
 * this copy of the app can send takes a row, and the section goes with both.
 */
export function NotifyMe({ saved }: { saved: NoticeSetting }) {
  const { t } = useTranslation()
  const headingId = useId()
  const [setting, setSetting] = useState(saved)
  const [push, setPush] = usePushShown(saved.push?.deviceOn ?? false)
  const [emailOn, setEmailOn] = useState(
    saved.email !== null && saved.email.address !== null,
  )
  if (setting.push === null && setting.email === null) return null

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2
        id={headingId}
        className="text-sm font-extrabold text-muted-foreground"
      >
        {t('assistantSettings.notify.heading')}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t('assistantSettings.notify.hint')}
      </p>
      {setting.push !== null && (
        <PushRow
          publicKey={setting.push.publicKey}
          shown={push}
          onShown={setPush}
          onSetting={setSetting}
        />
      )}
      {setting.email !== null && (
        <EmailRow
          address={setting.email.address}
          on={emailOn}
          onTurn={setEmailOn}
          onSetting={setSetting}
        />
      )}
      {!setting.reachable && push === 'off' && !emailOn && (
        <p role="status" className={cn(box, 'mt-1 text-base')}>
          {t('assistantSettings.notify.none')}
        </p>
      )}
    </section>
  )
}

// A device that cannot push shows `off` until a press asks it.
type PushShown = PushAnswer | 'asking'

/** The device's own side, read on mount since a browser can change it alone. */
function usePushShown(deviceOn: boolean) {
  const [shown, setShown] = useState<PushShown>('off')
  const [onAtLoad] = useState(deviceOn)

  useEffect(() => {
    let live = true
    readPushAnswer(onAtLoad).then(
      (answer) => {
        if (live && answer === 'on') setShown('on')
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [onAtLoad])

  return [shown, setShown] as const
}

interface PushRowProps {
  publicKey: string
  shown: PushShown
  onShown: (shown: PushShown) => void
  onSetting: (setting: NoticeSetting) => void
}

function PushRow({ publicKey, shown, onShown, onSetting }: PushRowProps) {
  const { t } = useTranslation()
  const hintId = useId()
  const [error, setError] = useState<unknown>(null)
  const busy = useRef(false)
  const on = shown === 'on' || shown === 'asking'

  async function turn(next: boolean) {
    if (busy.current || (next && shown === 'on')) return
    busy.current = true
    setError(null)
    try {
      if (next) {
        onShown('asking')
        onShown(await turnOn())
      } else if (shown === 'on') {
        // The API first, so a failed call leaves the device on and saying so.
        onSetting(await turnPushOff())
        onShown('off')
        await unsubscribeDevice().catch(() => undefined)
      } else {
        onShown('off')
      }
    } catch (caught) {
      onShown(next ? 'off' : 'on')
      setError(caught)
    } finally {
      busy.current = false
    }
  }

  async function turnOn(): Promise<PushAnswer> {
    const device = await subscribeDevice(publicKey)
    if (typeof device === 'string') return device
    onSetting(await savePushDevice(device))
    return 'on'
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <OnOff
        label={t('assistantSettings.notify.push')}
        on={on}
        busy={shown === 'asking'}
        describedBy={hintId}
        onTurn={(next) => void turn(next)}
      />
      <PushHint id={hintId} shown={shown} />
      {error !== null && (
        <p role="alert" className={cn(box, 'text-base')}>
          {t(failureKey(error))}
        </p>
      )}
    </div>
  )
}

const HINTS = {
  on: 'assistantSettings.notify.deviceOn',
  off: 'assistantSettings.notify.deviceOff',
  asking: 'assistantSettings.notify.asking',
  blocked: 'assistantSettings.notify.blocked',
  install: 'assistantSettings.notify.install',
  unsupported: 'assistantSettings.notify.unsupported',
} as const satisfies Record<PushShown, string>

function PushHint({ id, shown }: { id: string; shown: PushShown }) {
  const { t } = useTranslation()
  if (shown === 'on' || shown === 'off' || shown === 'asking') {
    return (
      <p id={id} role="status" className="text-sm text-muted-foreground">
        {t(HINTS[shown])}
      </p>
    )
  }
  return (
    <>
      <p id={id} role="alert" className={cn(box, 'text-sm')}>
        {t(HINTS[shown])}
      </p>
      {shown === 'install' && (
        <Link
          to="/settings/install"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'mt-1 h-auto min-h-target w-full border-2 border-muted-foreground bg-card py-2 whitespace-normal dark:border-muted-foreground dark:bg-card',
          )}
        >
          {t('assistantSettings.notify.addToHome')}
        </Link>
      )}
    </>
  )
}

interface EmailRowProps {
  address: string | null
  on: boolean
  onTurn: (on: boolean) => void
  onSetting: (setting: NoticeSetting) => void
}

type EmailProblem = 'invalid' | 'unconfirmed'

type EmailOutcome =
  | { kind: 'saved' }
  | { kind: 'problem'; problem: EmailProblem }
  | { kind: 'failed'; error: unknown }

function EmailRow({ address, on, onTurn, onSetting }: EmailRowProps) {
  const { t } = useTranslation()
  const ids = useId()
  const fieldRef = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState(address ?? '')
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<EmailOutcome | null>(null)
  const problem = outcome?.kind === 'problem' ? outcome.problem : null

  async function turn(next: boolean) {
    if (pending || next === on) return
    setOutcome(null)
    if (next || address === null) {
      onTurn(next)
      return
    }
    setPending(true)
    try {
      onSetting(await turnEmailOff())
      onTurn(false)
    } catch (error) {
      setOutcome({ kind: 'failed', error })
    } finally {
      setPending(false)
    }
  }

  function refuse(refused: EmailProblem) {
    setOutcome({ kind: 'problem', problem: refused })
    fieldRef.current?.focus()
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const write = noticeEmailWrite.safeParse({
      address: typed,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    if (!write.success) {
      refuse('invalid')
      return
    }
    setPending(true)
    setOutcome(null)
    try {
      onSetting(await saveNoticeEmail(write.data))
      setTyped(write.data.address)
      setOutcome({ kind: 'saved' })
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'email_unconfirmed') {
        refuse('unconfirmed')
      } else {
        setOutcome({ kind: 'failed', error })
      }
    } finally {
      setPending(false)
    }
  }

  // An invalid address clears its error as soon as it reads right, and an
  // unconfirmed one as soon as it is another address.
  function onType(next: string) {
    setTyped(next)
    const stillInvalid =
      problem === 'invalid' &&
      !noticeEmailWrite.shape.address.safeParse(next).success
    if (!stillInvalid) setOutcome(null)
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <OnOff
        label={t('assistantSettings.notify.email')}
        on={on}
        busy={pending}
        onTurn={(next) => void turn(next)}
      />
      {on && (
        <form noValidate onSubmit={onSubmit} className="flex gap-2.5">
          <Input
            ref={fieldRef}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={typed}
            onChange={(event) => onType(event.target.value)}
            aria-label={t('assistantSettings.notify.address')}
            aria-invalid={problem !== null}
            aria-describedby={problem === null ? undefined : `${ids}-problem`}
            className="flex-1"
          />
          <Button type="submit" aria-busy={pending}>
            {t(pending ? 'assistantSettings.saving' : 'assistantSettings.save')}
          </Button>
        </form>
      )}
      {on && problem !== null && (
        <p
          id={`${ids}-problem`}
          role="alert"
          className="text-sm font-extrabold"
        >
          {problem === 'invalid'
            ? t('assistantSettings.notify.invalid')
            : t('assistantSettings.notify.unconfirmed')}
        </p>
      )}
      {outcome?.kind === 'failed' && (
        <p role="alert" className={cn(box, 'mt-1 text-base')}>
          {t(
            outcome.error instanceof ApiFailure &&
              outcome.error.code === 'notice_failed'
              ? 'assistantSettings.notify.testFailed'
              : failureKey(outcome.error),
          )}
        </p>
      )}
      {on && outcome?.kind === 'saved' && (
        <p role="status" className={cn(box, 'mt-1 text-base')}>
          {t('assistantSettings.notify.saved')}
        </p>
      )}
    </div>
  )
}

interface OnOffProps {
  label: string
  on: boolean
  busy: boolean
  describedBy?: string
  onTurn: (on: boolean) => void
}

/** Drawn like the Appearance toggle, so the app has one kind of choice row. */
function OnOff({ label, on, busy, describedBy, onTurn }: OnOffProps) {
  const { t } = useTranslation()
  const labelId = useId()

  return (
    <>
      <p id={labelId} className="text-sm leading-none font-extrabold">
        {label}
      </p>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-busy={busy}
        className="flex rounded-full bg-muted p-1"
      >
        {[true, false].map((value) => (
          <Button
            key={String(value)}
            variant="ghost"
            aria-pressed={on === value}
            onClick={() => onTurn(value)}
            className="flex-1 px-4 text-muted-foreground hover:bg-transparent not-aria-pressed:hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary dark:hover:bg-transparent"
          >
            {t(
              value
                ? 'assistantSettings.notify.on'
                : 'assistantSettings.notify.off',
            )}
          </Button>
        ))}
      </div>
    </>
  )
}
