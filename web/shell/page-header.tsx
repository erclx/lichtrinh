import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { BackIcon } from '@/shell/icons'

interface PageHeaderProps {
  title: string
  /** Where the labeled back control leads, left out on a top-level page. */
  backTo?: string
  /** A trailing control on the back row, such as Accounts' New account. */
  action?: ReactNode
}

/** The header every page renders above its content, as the frames draw it. */
export function PageHeader({ title, backTo, action }: PageHeaderProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-1 pt-2 pb-3">
      {(backTo !== undefined || action !== undefined) && (
        <div className="flex items-center justify-between gap-2">
          {backTo !== undefined && (
            <Link
              to={backTo}
              className="-ml-2 inline-flex min-h-target items-center gap-2.5 rounded-full px-2 text-base font-extrabold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <BackIcon className="h-4.5 w-2.5" />
              {t('shell.back')}
            </Link>
          )}
          {action !== undefined && <div className="ml-auto">{action}</div>}
        </div>
      )}
      <h1 className="font-heading text-2xl font-extrabold">{title}</h1>
    </div>
  )
}
