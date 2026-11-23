import type { User } from '@shared/auth.ts'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'

import { Button, buttonVariants } from '@/components/ui/button'
import { listAccounts, resetPassword } from '@/features/accounts/accounts-api'
import { PasswordOnce } from '@/features/accounts/password-once'
import { ResetConfirm } from '@/features/accounts/reset-confirm'
import { ApiFailure } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useSession } from '@/session/session-context'
import { PlusIcon } from '@/shell/icons'
import { PageHeader } from '@/shell/page-header'

type Load =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; accounts: User[] }

function useAccounts() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    listAccounts().then(
      (accounts) => {
        if (live) setLoad({ state: 'ready', accounts })
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

/** The create page's "reset that account" link names its account here. */
function resetRequestOf(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null
  const value = (state as { resetUsername?: unknown }).resetUsername
  return typeof value === 'string' ? value : null
}

export function AccountsPage() {
  const { t, i18n } = useTranslation()
  const { user } = useSession()
  const { load, retry } = useAccounts()
  const location = useLocation()
  const navigate = useNavigate()
  const [chosen, setChosen] = useState<User | null>(null)
  // Read once at mount, since the history entry is cleared below so a
  // reload or Back never reopens the confirm.
  const [requested, setRequested] = useState(() =>
    resetRequestOf(location.state),
  )
  const [pending, setPending] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [shown, setShown] = useState<{
    name: string
    password: string
  } | null>(null)

  const carriesRequest = resetRequestOf(location.state) !== null
  useEffect(() => {
    if (carriesRequest) void navigate('.', { replace: true, state: null })
  }, [carriesRequest, navigate])

  const requestedAccount =
    requested === null || load.state !== 'ready'
      ? undefined
      : load.accounts.find(
          ({ username, id }) => username === requested && id !== user?.id,
        )
  const target = chosen ?? requestedAccount ?? null

  function closeConfirm() {
    setChosen(null)
    setRequested(null)
  }

  async function onConfirm() {
    if (target === null || pending) return
    setPending(true)
    setResetError(null)
    try {
      const password = await resetPassword(target.id)
      closeConfirm()
      setShown({ name: target.displayName, password })
    } catch (error) {
      setResetError(
        t(
          error instanceof ApiFailure && error.code === 'network'
            ? 'errors.network'
            : 'errors.generic',
        ),
      )
    } finally {
      setPending(false)
    }
  }

  if (shown !== null) {
    return (
      <PasswordOnce
        title={t('accounts.resetTitle')}
        name={shown.name}
        password={shown.password}
        onDone={() => setShown(null)}
      />
    )
  }

  const newAccount = (
    <Link to="new" className={cn(buttonVariants(), 'w-full')}>
      <PlusIcon />
      {t('accounts.newAccount')}
    </Link>
  )

  return (
    <>
      <PageHeader
        title={t('accounts.title')}
        backTo="/settings"
        action={
          <Link
            to="new"
            aria-label={t('accounts.newAccount')}
            className="inline-flex size-target items-center justify-center rounded-full bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <PlusIcon className="size-6" />
          </Link>
        }
      />

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

      {load.state === 'ready' && load.accounts.length === 0 && (
        <div className="flex flex-col gap-4">
          <p className="text-base text-muted-foreground">
            {t('accounts.empty')}
          </p>
          {newAccount}
        </div>
      )}

      {load.state === 'ready' && load.accounts.length > 0 && (
        <div className="flex flex-col gap-4">
          <ul>
            {load.accounts.map((account) => {
              const own = account.id === user?.id
              const subtitle = [
                t(
                  account.role === 'admin'
                    ? 'accounts.roleAdmin'
                    : 'accounts.roleMember',
                ),
                account.canChat ? t('accounts.canChat') : null,
                own ? t('accounts.you') : null,
              ]
                .filter((part) => part !== null)
                .join(' · ')
              return (
                <li
                  key={account.id}
                  className="flex items-center gap-4 border-b-[1.5px] border-border py-3"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-extrabold"
                  >
                    {Array.from(account.displayName)[0]?.toLocaleUpperCase(
                      i18n.language,
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold break-words">
                      {account.displayName}
                    </p>
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
                  </div>
                  {!own && (
                    <Button
                      variant="ghost"
                      aria-label={t('accounts.resetLabel', {
                        name: account.displayName,
                      })}
                      onClick={() => {
                        setResetError(null)
                        setRequested(null)
                        setChosen(account)
                      }}
                      className="rounded-[18px] bg-muted px-4 text-sm"
                    >
                      {t('accounts.reset')}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
          {newAccount}
        </div>
      )}

      <ResetConfirm
        name={target?.displayName ?? null}
        pending={pending}
        error={resetError}
        onConfirm={() => void onConfirm()}
        onCancel={closeConfirm}
      />
    </>
  )
}
