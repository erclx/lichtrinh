import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { buttonVariants } from '@/components/ui/button'
import { PageHeader } from '@/shell/page-header'

/**
 * An unknown path, and an admin path a member opens, so the member learns
 * nothing about what the admin sees there.
 */
export function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <>
      <PageHeader title={t('shell.notFoundTitle')} />
      <div className="flex flex-col items-start gap-5">
        <p className="text-base text-muted-foreground">
          {t('shell.notFoundBody')}
        </p>
        <Link to="/" className={buttonVariants()}>
          {t('shell.goToday')}
        </Link>
      </div>
    </>
  )
}
