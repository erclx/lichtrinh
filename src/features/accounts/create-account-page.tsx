import type { Language, Role } from '@shared/auth.ts'
import { createUserRequest, username as usernameRule } from '@shared/users.ts'
import { type FormEvent, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { createAccount } from '@/features/accounts/accounts-api'
import { PasswordOnce } from '@/features/accounts/password-once'
import { ApiFailure } from '@/lib/api'
import { useSession } from '@/session/session-context'
import { PageHeader } from '@/shell/page-header'

interface FieldErrors {
  displayName?: 'required' | 'tooLong'
  username?: 'invalid' | 'taken'
}

// The API's own rule, so the form refuses what the API would answer with
// validation_failed.
function displayNameError(name: string): FieldErrors['displayName'] {
  if (name === '') return 'required'
  return createUserRequest.shape.displayName.safeParse(name).success
    ? undefined
    : 'tooLong'
}

const labelClass = 'text-sm leading-none font-extrabold'

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
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${ids}-name`}>{t('accounts.displayName')}</Label>
          <Input
            ref={displayNameRef}
            id={`${ids}-name`}
            autoComplete="off"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value)
              if (displayNameError(event.target.value.trim()) === undefined) {
                setErrors((current) => ({ ...current, displayName: undefined }))
              }
            }}
            aria-invalid={errors.displayName !== undefined}
            aria-describedby={
              errors.displayName !== undefined ? `${ids}-name-error` : undefined
            }
          />
          {errors.displayName !== undefined && (
            <p id={`${ids}-name-error`} className="text-sm">
              {t(
                errors.displayName === 'tooLong'
                  ? 'accounts.displayNameTooLong'
                  : 'accounts.displayNameRequired',
              )}
            </p>
          )}
        </div>

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

        <div className="flex flex-col gap-2">
          <p id={`${ids}-role`} className={labelClass}>
            {t('accounts.role')}
          </p>
          <ToggleGroup
            aria-labelledby={`${ids}-role`}
            value={[role]}
            onValueChange={([next]) => {
              if (next === 'member' || next === 'admin') setRole(next)
            }}
          >
            <ToggleGroupItem value="member">
              {t('accounts.roleMember')}
            </ToggleGroupItem>
            <ToggleGroupItem value="admin">
              {t('accounts.roleAdmin')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex flex-col gap-2">
          <p id={`${ids}-chat`} className={labelClass}>
            {t('accounts.canChatLabel')}
          </p>
          <ToggleGroup
            aria-labelledby={`${ids}-chat`}
            aria-describedby={`${ids}-chat-hint`}
            value={[canChat ? 'on' : 'off']}
            onValueChange={([next]) => {
              if (next === 'on' || next === 'off') setCanChat(next === 'on')
            }}
          >
            <ToggleGroupItem value="on">{t('accounts.on')}</ToggleGroupItem>
            <ToggleGroupItem value="off">{t('accounts.off')}</ToggleGroupItem>
          </ToggleGroup>
          <p
            id={`${ids}-chat-hint`}
            className="text-center text-sm text-muted-foreground"
          >
            {t('accounts.canChatHint')}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p id={`${ids}-language`} className={labelClass}>
            {t('accounts.language')}
          </p>
          <ToggleGroup
            aria-labelledby={`${ids}-language`}
            value={[language]}
            onValueChange={([next]) => {
              if (next === 'vi' || next === 'en') setLanguage(next)
            }}
          >
            <ToggleGroupItem value="vi" lang="vi">
              {t('language.viName')}
            </ToggleGroupItem>
            <ToggleGroupItem value="en" lang="en">
              {t('language.enName')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

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
