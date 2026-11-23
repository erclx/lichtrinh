import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'

import { LanguageToggle } from '@/components/language-toggle'
import { ApiFailure } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useSession } from '@/session/session-context'
import {
  AccountsIcon,
  ChevronIcon,
  GlobeIcon,
  SignOutIcon,
} from '@/shell/icons'
import { PageHeader } from '@/shell/page-header'

const row =
  'flex min-h-target items-center gap-4 border-b-[1.5px] border-border py-3'
const rowIcon =
  'flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-muted'
const pressable =
  'w-full rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

/** Later rows add their own rows here, such as Appearance and the tutorial. */
export function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, signOut, saveLanguage } = useSession()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSignOut() {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await signOut()
      // Today, so whoever signs in next on this device starts there.
      void navigate('/', { replace: true })
    } catch (failure) {
      setError(
        t(
          failure instanceof ApiFailure && failure.code === 'network'
            ? 'errors.network'
            : 'errors.generic',
        ),
      )
      setPending(false)
    }
  }

  return (
    <>
      <PageHeader title={t('settings.title')} backTo="/" />
      <ul>
        <li className={cn(row, 'flex-wrap')}>
          <span aria-hidden="true" className={rowIcon}>
            <GlobeIcon className="size-6" />
          </span>
          <span className="flex-1 text-base font-extrabold">
            {t('settings.language')}
          </span>
          <LanguageToggle
            onChange={(language) => void saveLanguage(language)}
          />
        </li>
        {user?.role === 'admin' && (
          <li>
            <Link to="/admin/accounts" className={cn(row, pressable)}>
              <span aria-hidden="true" className={rowIcon}>
                <AccountsIcon className="size-6" />
              </span>
              <span className="flex-1 text-base font-extrabold">
                {t('settings.manageAccounts')}
              </span>
              <ChevronIcon className="size-6 text-muted-foreground" />
            </Link>
          </li>
        )}
        <li>
          <button
            type="button"
            onClick={() => void onSignOut()}
            aria-busy={pending}
            className={cn(row, pressable)}
          >
            <span aria-hidden="true" className={rowIcon}>
              <SignOutIcon className="size-6" />
            </span>
            <span className="flex-1 text-base font-extrabold">
              {t(pending ? 'settings.signingOut' : 'settings.signOut')}
            </span>
          </button>
        </li>
      </ul>
      {error !== null && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-muted px-4 py-3 text-base"
        >
          {error}
        </p>
      )}
    </>
  )
}
