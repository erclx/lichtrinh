import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BrandMark } from '@/components/brand-mark'
import { LanguageToggle } from '@/components/language-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiFailure } from '@/lib/api'
import { useSession } from '@/session/session-context'
import { safeWhenEmpty } from '@/update/holds'

type Problem = 'wrong' | 'paused' | 'network' | 'generic'

function problemOf(error: unknown): Problem {
  if (!(error instanceof ApiFailure)) return 'generic'
  switch (error.code) {
    case 'invalid_credentials':
    case 'validation_failed':
      return 'wrong'
    case 'rate_limited':
      return 'paused'
    case 'network':
      return 'network'
    default:
      return 'generic'
  }
}

interface Refusal {
  problem: Problem
}

/** The whole screen a signed-out visitor sees, with no shell around it. */
export function SignInPage() {
  const { t } = useTranslation()
  const { signIn } = useSession()
  const ids = useId()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [missing, setMissing] = useState({ username: false, password: false })
  // A new object per refusal, so the same refusal twice still moves focus.
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [pending, setPending] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (refusal !== null) alertRef.current?.focus()
  }, [refusal])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const name = username.trim()
    const empty = { username: name === '', password: password === '' }
    setMissing(empty)
    if (empty.username || empty.password) {
      setRefusal(null)
      ;(empty.username ? usernameRef : passwordRef).current?.focus()
      return
    }
    setPending(true)
    try {
      await signIn({ username: name, password })
    } catch (error) {
      setRefusal({ problem: problemOf(error) })
      setPending(false)
    }
  }

  const wrong = refusal?.problem === 'wrong'
  const alertId = `${ids}-alert`

  return (
    <div className="flex min-h-svh flex-col items-center bg-background text-foreground min-[480px]:bg-muted min-[480px]:p-8">
      {/* From 480 up, two growing spacers set the card's middle at 40 percent
          of the height, the lower one starting a fifth of it taller, and both
          give way on a short screen. A phone starts the form at the top. */}
      <div aria-hidden="true" className="hidden grow min-[480px]:block" />
      <main className="flex w-full max-w-[460px] flex-col gap-5 px-gutter py-4 min-[480px]:rounded-3xl min-[480px]:bg-background min-[480px]:p-6 min-[480px]:shadow-xl">
        <LanguageToggle className="self-end" />
        <div className="flex flex-col items-center gap-2 pt-4 text-center">
          <BrandMark className="size-24" />
          <h1 className="font-heading text-2xl font-extrabold">
            {t('app.name')}
          </h1>
          <p className="text-base text-muted-foreground">{t('signIn.lead')}</p>
        </div>

        {refusal !== null && (
          <div
            ref={alertRef}
            id={alertId}
            role="alert"
            tabIndex={-1}
            className="rounded-xl bg-muted px-4 py-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {refusal.problem === 'paused' ? (
              <>
                <p className="font-extrabold">{t('signIn.pausedTitle')}</p>
                <p>{t('signIn.pausedBody')}</p>
              </>
            ) : (
              <p>
                {t(
                  refusal.problem === 'wrong'
                    ? 'signIn.wrong'
                    : refusal.problem === 'network'
                      ? 'errors.network'
                      : 'errors.generic',
                )}
              </p>
            )}
          </div>
        )}

        <form
          noValidate
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
          {...safeWhenEmpty}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${ids}-username`}>{t('signIn.username')}</Label>
            <Input
              ref={usernameRef}
              id={`${ids}-username`}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(event) => {
                setUsername(event.target.value)
                if (event.target.value.trim() !== '') {
                  setMissing((current) => ({ ...current, username: false }))
                }
              }}
              aria-invalid={missing.username || wrong}
              aria-describedby={
                missing.username
                  ? `${ids}-username-error`
                  : wrong
                    ? alertId
                    : undefined
              }
            />
            {missing.username && (
              <p id={`${ids}-username-error`} className="text-sm">
                {t('signIn.usernameRequired')}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${ids}-password`}>{t('signIn.password')}</Label>
            <div className="relative">
              <Input
                ref={passwordRef}
                id={`${ids}-password`}
                name="password"
                type={shown ? 'text' : 'password'}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (event.target.value !== '') {
                    setMissing((current) => ({ ...current, password: false }))
                  }
                }}
                aria-invalid={missing.password || wrong}
                aria-describedby={
                  missing.password
                    ? `${ids}-password-error`
                    : wrong
                      ? alertId
                      : undefined
                }
                className="pr-24"
              />
              <Button
                type="button"
                variant="ghost"
                aria-pressed={shown}
                aria-controls={`${ids}-password`}
                aria-label={t('signIn.showLabel')}
                onClick={() => setShown((current) => !current)}
                className="absolute inset-y-0 right-0 rounded-lg px-4 text-sm text-muted-foreground hover:bg-transparent aria-pressed:text-foreground"
              >
                {t('signIn.show')}
              </Button>
            </div>
            {missing.password && (
              <p id={`${ids}-password-error`} className="text-sm">
                {t('signIn.passwordRequired')}
              </p>
            )}
          </div>

          <Button type="submit" aria-busy={pending} className="mt-2 w-full">
            {t(pending ? 'signIn.submitting' : 'signIn.submit')}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {t('signIn.forgot')}
        </p>
      </main>
      <div
        aria-hidden="true"
        className="hidden grow basis-[20svh] min-[480px]:block"
      />
    </div>
  )
}
