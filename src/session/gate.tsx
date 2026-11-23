import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'

import { LanguageToggle } from '@/components/language-toggle'
import { Button } from '@/components/ui/button'
import { SignInPage } from '@/features/sign-in/sign-in-page'
import { useSession } from '@/session/session-context'

/**
 * Decides between the sign-in card and the app at whatever path was asked
 * for, so signing in lands on that path without a redirect. Offline with a
 * remembered person, the app opens on the plan the device saved.
 */
export function SessionGate() {
  const { t } = useTranslation()
  const { status, refresh } = useSession()

  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-label={t('shell.loading')}
        className="min-h-svh bg-background"
      />
    )
  }
  if (status === 'signed-out') return <SignInPage />
  if (status === 'unreachable') {
    return (
      <div className="flex min-h-svh justify-center bg-background px-4 py-4 text-foreground">
        <main className="flex w-full max-w-[460px] flex-col gap-5">
          <LanguageToggle className="self-end" />
          <h1 className="pt-8 font-heading text-2xl font-extrabold">
            {t('shell.unreachableTitle')}
          </h1>
          <p className="text-base text-muted-foreground">
            {t('shell.unreachableBody')}
          </p>
          <Button onClick={() => void refresh()} className="w-full">
            {t('shell.retry')}
          </Button>
        </main>
      </div>
    )
  }
  return <Outlet />
}
