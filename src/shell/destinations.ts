import type { Role } from '@shared/auth.ts'
import type { ComponentType, SVGProps } from 'react'

import {
  AccountsIcon,
  CalendarIcon,
  SettingsIcon,
  TodayIcon,
  TripsIcon,
} from '@/shell/icons'

export interface Destination {
  path: string
  labelKey:
    | 'nav.today'
    | 'nav.trips'
    | 'nav.calendar'
    | 'nav.accounts'
    | 'nav.settings'
  icon: ComponentType<SVGProps<SVGSVGElement>>
  adminOnly: boolean
  /**
   * `header` is the top bar's one button, which every width shows, so the
   * phone tabs keep room for the places a person moves between.
   */
  placement: 'nav' | 'header'
}

/**
 * Every place the shell links to. A screen row adds a destination here and
 * never as markup in `nav.tsx`.
 */
export const destinations: readonly Destination[] = [
  {
    path: '/',
    labelKey: 'nav.today',
    icon: TodayIcon,
    adminOnly: false,
    placement: 'nav',
  },
  {
    path: '/trips',
    labelKey: 'nav.trips',
    icon: TripsIcon,
    adminOnly: false,
    placement: 'nav',
  },
  {
    path: '/calendar',
    labelKey: 'nav.calendar',
    icon: CalendarIcon,
    adminOnly: false,
    placement: 'nav',
  },
  {
    path: '/admin/accounts',
    labelKey: 'nav.accounts',
    icon: AccountsIcon,
    adminOnly: true,
    placement: 'nav',
  },
  {
    path: '/settings',
    labelKey: 'nav.settings',
    icon: SettingsIcon,
    adminOnly: false,
    placement: 'header',
  },
]

export function visibleDestinations(role: Role): Destination[] {
  return destinations.filter(
    (destination) => role === 'admin' || !destination.adminOnly,
  )
}
