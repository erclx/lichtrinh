import type { Language, Role, User } from '@shared/auth.ts'
import type { UpdateUserRequest } from '@shared/users.ts'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  AccountChoices,
  DisplayNameField,
} from '@/features/accounts/account-fields'
import { listAccounts, updateAccount } from '@/features/accounts/accounts-api'
import {
  type DisplayNameError,
  displayNameError,
} from '@/features/accounts/display-name'
import { ApiFailure } from '@/lib/api'
import { useSession } from '@/session/session-context'
import { NotFoundPage } from '@/shell/not-found-page'
import { PageHeader } from '@/shell/page-header'

type Load =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; account: User | undefined }

// The list, since a family holds a handful of accounts and a read route for
// one would be a second contract nobody else needs.
function useAccount(id: string) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    listAccounts().then(
      (accounts) => {
        if (live) {
          setLoad({
            state: 'ready',
            account: accounts.find((account) => account.id === id),
          })
        }
      },
      () => {
        if (live) setLoad({ state: 'failed' })
      },
    )
    return () => {
      live = false
    }
  }, [id, attempt])

  function retry() {
    setLoad({ state: 'loading' })
    setAttempt((count) => count + 1)
  }

  return { load, retry }
}

export function EditAccountPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const { load, retry } = useAccount(id)

  if (load.state === 'ready' && load.account === undefined) {
    return <NotFoundPage />
  }

  return (
    <>
      <PageHeader title={t('accounts.editTitle')} backTo="/admin/accounts" />
      {load.state === 'loading' && (
        <p role="status" className="text-base text-muted-foreground">
          {t('accounts.loading')}
        </p>
      )}
      {load.state === 'failed' && (
        <div
          role="alert"
          className="flex flex-col items-start gap-4 rounded-xl bg-muted p-4"
        >
          <p className="text-base">{t('accounts.loadFailed')}</p>
          <Button onClick={retry}>{t('shell.retry')}</Button>
        </div>
      )}
      {load.state === 'ready' && load.account !== undefined && (
        <EditAccountForm key={load.account.id} account={load.account} />
      )}
    </>
  )
}

function EditAccountForm({ account }: { account: User }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user: self } = useSession()
  const ids = useId()
  const own = account.id === self?.id
  const [displayName, setDisplayName] = useState(account.displayName)
  const [role, setRole] = useState<Role>(account.role)
  const [canChat, setCanChat] = useState(account.canChat)
  // An account that never picked a language shows the default one, and sends
  // it only when the admin picks one.
  const shownLanguage = account.language ?? 'vi'
  const [language, setLanguage] = useState<Language>(shownLanguage)
  const [nameError, setNameError] = useState<DisplayNameError | undefined>()
  const [roleError, setRoleError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const displayNameRef = useRef<HTMLInputElement>(null)

  function changes(name: string): UpdateUserRequest {
    const changed: UpdateUserRequest = {}
    if (name !== account.displayName) changed.displayName = name
    if (!own && role !== account.role) changed.role = role
    if (canChat !== account.canChat) changed.canChat = canChat
    if (language !== shownLanguage) changed.language = language
    return changed
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const name = displayName.trim()
    const error = displayNameError(name)
    setNameError(error)
    setRoleError(null)
    setSubmitError(null)
    if (error !== undefined) return displayNameRef.current?.focus()

    const changed = changes(name)
    if (Object.keys(changed).length === 0) {
      return void navigate('/admin/accounts')
    }
    setPending(true)
    try {
      await updateAccount(account.id, changed)
      void navigate('/admin/accounts')
    } catch (failure) {
      if (failure instanceof ApiFailure && failure.code === 'last_admin') {
        setRoleError(t('accounts.lastAdmin'))
      } else {
        setSubmitError(
          t(
            failure instanceof ApiFailure && failure.code === 'network'
              ? 'errors.network'
              : 'errors.generic',
          ),
        )
      }
      setPending(false)
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
      <DisplayNameField
        idPrefix={ids}
        value={displayName}
        error={nameError}
        inputRef={displayNameRef}
        onChange={(value) => {
          setDisplayName(value)
          if (displayNameError(value.trim()) === undefined) {
            setNameError(undefined)
          }
        }}
      />

      <div className="flex flex-col gap-2">
        <p className="text-sm leading-none font-extrabold">
          {t('accounts.username')}
        </p>
        <p className="text-base">
          {account.username}
          <span className="block text-sm text-muted-foreground">
            {t('accounts.usernameFixed')}
          </span>
        </p>
      </div>

      <AccountChoices
        idPrefix={ids}
        role={role}
        canChat={canChat}
        language={language}
        onRole={(next) => {
          setRole(next)
          setRoleError(null)
        }}
        onCanChat={setCanChat}
        onLanguage={setLanguage}
        roleFixed={own}
        roleError={roleError}
      />

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
        {t(pending ? 'accounts.saving' : 'accounts.save')}
      </Button>
    </form>
  )
}
