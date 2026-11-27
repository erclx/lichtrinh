import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'

import { BrandMark } from '@/components/brand-mark'
import { cn } from '@/lib/utils'
import type { Destination } from '@/shell/destinations'
import { SidebarIcon } from '@/shell/icons'

const current =
  'aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground'
const focus =
  'outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset'

interface SidebarProps {
  destinations: Destination[]
  onHide: () => void
  hideRef: Ref<HTMLButtonElement>
}

/** The desktop nav, from 1024 wide, which a person can hide. */
export function Sidebar({ destinations, onHide, hideRef }: SidebarProps) {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('nav.label')}
      className="sticky top-0 hidden h-svh w-62 shrink-0 flex-col gap-2 border-r-[1.5px] border-border p-3 lg:flex"
    >
      <div className="flex min-h-target items-center gap-2.5 pl-2 pb-3">
        <BrandMark className="size-8.5 shrink-0" />
        <span className="font-heading text-lg font-extrabold whitespace-nowrap">
          {t('app.name')}
        </span>
        <button
          ref={hideRef}
          type="button"
          onClick={onHide}
          aria-label={t('nav.hide')}
          className={cn(
            'ml-auto flex size-target shrink-0 items-center justify-center rounded-full bg-muted',
            focus,
          )}
        >
          <SidebarIcon className="size-6" />
        </button>
      </div>
      {destinations.map(({ path, labelKey, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          className={cn(
            'flex min-h-target items-center gap-3.5 rounded-[--spacing(5.5)] px-4.5 text-base font-extrabold text-muted-foreground hover:text-foreground',
            current,
            focus,
          )}
        >
          <Icon className="size-6.5 shrink-0" />
          {t(labelKey)}
        </NavLink>
      ))}
    </nav>
  )
}

/** The tablet rail, from 480 to 1023 wide, with the mark alone on top. */
export function Rail({ destinations }: { destinations: Destination[] }) {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('nav.label')}
      className="sticky top-0 hidden h-svh w-28 shrink-0 flex-col items-stretch gap-2 border-r-[1.5px] border-border px-2 py-3 min-[480px]:flex lg:hidden"
    >
      <div className="flex min-h-14 items-center justify-center pb-3">
        <BrandMark className="size-8.5" />
      </div>
      {destinations.map(({ path, labelKey, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          className={cn(
            'flex min-h-19 flex-col items-center justify-center gap-1 rounded-[--spacing(5.5)] px-1 py-2 text-center text-sm leading-tight font-extrabold text-muted-foreground hover:text-foreground',
            current,
            focus,
          )}
        >
          <Icon className="size-7 shrink-0" />
          {t(labelKey)}
        </NavLink>
      ))}
    </nav>
  )
}

/** The phone tabs, under 480 wide, kept at the bottom of the screen. */
export function Tabs({ destinations }: { destinations: Destination[] }) {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('nav.label')}
      className="sticky bottom-0 flex gap-2 bg-background px-3 pt-2 pb-[max(--spacing(3.5),env(safe-area-inset-bottom))] min-[480px]:hidden"
    >
      {destinations.map(({ path, labelKey, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          className={cn(
            'flex h-19 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[--spacing(5.5)] text-sm leading-tight font-extrabold text-muted-foreground',
            current,
            focus,
          )}
        >
          <Icon className="size-7 shrink-0" />
          <span className="max-w-full truncate px-1">{t(labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  )
}
