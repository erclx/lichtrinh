import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'

import { BrandMark } from '@/components/brand-mark'
import { LanguageToggle } from '@/components/language-toggle'
import { cn } from '@/lib/utils'
import { useSession } from '@/session/session-context'
import type { Destination } from '@/shell/destinations'
import { SidebarIcon } from '@/shell/icons'

interface TopBarProps {
  header: Destination | undefined
  navHidden: boolean
  onShowNav: () => void
  showRef: Ref<HTMLButtonElement>
}

const focus =
  'outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/**
 * The wordmark carries the mark on phone and beside a hidden desktop nav,
 * and stands bare on tablet, whose rail already shows the mark. With the
 * desktop nav open the nav carries both.
 */
export function TopBar({ header, navHidden, onShowNav, showRef }: TopBarProps) {
  const { t } = useTranslation()
  const { saveLanguage } = useSession()

  return (
    <header className="flex items-center gap-2 px-gutter py-2.5 min-[480px]:px-gutter-tablet lg:px-gutter-desktop">
      {navHidden && (
        <button
          ref={showRef}
          type="button"
          onClick={onShowNav}
          aria-label={t('nav.show')}
          className={cn(
            'hidden size-target shrink-0 items-center justify-center rounded-full bg-muted lg:inline-flex',
            focus,
          )}
        >
          <SidebarIcon className="size-6" />
        </button>
      )}
      <div
        className={cn(
          '@container flex min-w-0 flex-1 items-center gap-2.5',
          !navHidden && 'lg:hidden',
        )}
      >
        <BrandMark
          className={cn(
            'size-8.5 shrink-0 min-[480px]:hidden',
            navHidden && 'lg:block',
          )}
        />
        {/* Where the toggle and Settings leave no room for the name, at a
            narrow width or a large Text Size, the mark stands alone rather
            than cutting the name short. The bound is in em, so it grows with
            the text. */}
        <span className="hidden font-heading text-lg font-extrabold whitespace-nowrap @min-[7.25em]:inline">
          {t('app.name')}
        </span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <LanguageToggle onChange={(language) => void saveLanguage(language)} />
        {header !== undefined && (
          <NavLink
            to={header.path}
            aria-label={t(header.labelKey)}
            className={cn(
              'inline-flex size-target items-center justify-center rounded-full bg-muted aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground',
              focus,
            )}
          >
            <header.icon className="size-6.5" />
          </NavLink>
        )}
      </div>
    </header>
  )
}
