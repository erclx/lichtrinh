import type { Language, Role } from '@shared/auth.ts'
import { username as usernameRule } from '@shared/users.ts'
import { type FormEvent, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AccountChoices,
  DisplayNameField,
} from '@/features/accounts/account-fields'
import { createAccount } from '@/features/accounts/accounts-api'
import {
  type DisplayNameError,
  displayNameError,
} from '@/features/accounts/display-name'
import { PasswordOnce } from '@/features/accounts/password-once'
import { ApiFailure } from '@/lib/api'
import { useSession } from '@/session/session-context'
import { PageHeader } from '@/shell/page-header'

interface FieldErrors {
  displayName?: DisplayNameError
  username?: 'invalid' | 'taken'
}

export function CreateAccountPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user: self } = useSession()
  const ids = useId()
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [canChat, setCanChat] = useState(false)
  const [language, setLanguage] = useState<Language>('vi')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState<{
    name: string
    password: string
  } | null>(null)
  const displayNameRef = useRef<HTMLInputElement>(null)
  const usernameRef = useRef<HTMLInputElement>(null)

  const parsedUsername = usernameRule.safeParse(username)
  const takenName = parsedUsername.success ? parsedUsername.data : username
  const takenByOther = takenName !== self?.username

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const name = displayName.trim()
    const next: FieldErrors = {
      displayName: displayNameError(name),
      username: parsedUsername.success ? undefined : 'invalid',
    }
    setErrors(next)
    setSubmitError(null)
    if (next.displayName !== undefined) return displayNameRef.current?.focus()
    if (!parsedUsername.success) return usernameRef.current?.focus()

    setPending(true)
    try {
      const { user, password } = await createAccount({
        displayName: name,
        username: parsedUsername.data,
        role,
        canChat,
        language,
      })
      setCreated({ name: user.displayName, password })
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'username_taken') {
        setErrors({ username: 'taken' })
        usernameRef.current?.focus()
      } else {
        setSubmitError(
          t(
            error instanceof ApiFailure && error.code === 'network'
              ? 'errors.network'
              : 'errors.generic',
          ),
        )
      }
    } finally {
      setPending(false)
    }
  }

  if (created !== null) {
    return (
      <PasswordOnce
        title={t('accounts.createdTitle')}
        name={created.name}
        password={created.password}
        onDone={() => void navigate('/admin/accounts', { replace: true })}
      />
    )
  }

  const usernameDescribedBy = [
    `${ids}-username-hint`,
    errors.username !== undefined ? `${ids}-username-error` : null,
  ]
    .filter((id) => id !== null)
    .join(' ')

  return (
    <>
      <PageHeader title={t('accounts.createTitle')} backTo="/admin/accounts" />
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <DisplayNameField
          idPrefix={ids}
          value={displayName}
          error={errors.displayName}
          inputRef={displayNameRef}
          onChange={(value) => {
            setDisplayName(value)
            if (displayNameError(value.trim()) === undefined) {
              setErrors((current) => ({ ...current, displayName: undefined }))
            }
          }}
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${ids}-username`}>{t('accounts.username')}</Label>
          <Input
            ref={usernameRef}
            id={`${ids}-username`}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value)
              if (usernameRule.safeParse(event.target.value).success) {
                setErrors((current) => ({ ...current, username: undefined }))
              }
            }}
            aria-invalid={errors.username !== undefined}
            aria-describedby={usernameDescribedBy}
          />
          <p
            id={`${ids}-username-hint`}
            className="text-sm text-muted-foreground"
          >
            {t('accounts.usernameHint')}
          </p>
          {errors.username === 'invalid' && (
            <p id={`${ids}-username-error`} className="text-sm">
              {t('accounts.usernameInvalid')}
            </p>
          )}
          {errors.username === 'taken' && (
            <p id={`${ids}-username-error`} className="text-sm">
              {t('accounts.usernameTaken')}
              {/* The admin's own row offers no reset, so its name gets no link. */}
              {takenByOther && (
                <>
                  {' '}
                  <Link
                    to="/admin/accounts"
                    state={{ resetUsername: takenName }}
                    className="font-extrabold underline underline-offset-4"
                  >
                    {t('accounts.resetThatAccount')}
                  </Link>
                </>
              )}
            </p>
          )}
        </div>

        <AccountChoices
          idPrefix={ids}
          role={role}
          canChat={canChat}
          language={language}
          onRole={setRole}
          onCanChat={setCanChat}
          onLanguage={setLanguage}
        />

        <p className="text-base text-muted-foreground">
          {t('accounts.passwordNote')}
        </p>

        {submitError !== null && (
          <p role="alert" className="rounded-xl bg-muted px-4 py-3 text-base">
            {submitError}
          </p>
        )}

        <Button
          type="submit"
          aria-busy={pending}
          className="h-auto min-h-target w-full py-3 whitespace-normal"
        >
          {t(pending ? 'accounts.creating' : 'accounts.create')}
        </Button>
      </form>
    </>
  )
}
