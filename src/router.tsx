import type { RouteObject } from 'react-router'

import { AccountsPage } from '@/features/accounts/accounts-page'
import { CreateAccountPage } from '@/features/accounts/create-account-page'
import { SettingsPage } from '@/features/settings/settings-page'
import { SessionGate } from '@/session/gate'
import { RequireAdmin } from '@/session/require-admin'
import { AppShell } from '@/shell/app-shell'
import { NotFoundPage } from '@/shell/not-found-page'
import { PlaceholderPage } from '@/shell/placeholder-page'

/**
 * The one route table. A screen row replaces a placeholder's `element` or
 * adds a child under the shell, and renames none of the paths here.
 */
export const routes: RouteObject[] = [
  {
    element: <SessionGate />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <PlaceholderPage titleKey="nav.today" /> },
          {
            path: 'trips',
            element: <PlaceholderPage titleKey="nav.trips" />,
          },
          {
            path: 'calendar',
            element: <PlaceholderPage titleKey="nav.calendar" />,
          },
          { path: 'settings', element: <SettingsPage /> },
          {
            path: 'admin',
            element: <RequireAdmin />,
            children: [
              { index: true, element: <NotFoundPage /> },
              { path: 'accounts', element: <AccountsPage /> },
              { path: 'accounts/new', element: <CreateAccountPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
