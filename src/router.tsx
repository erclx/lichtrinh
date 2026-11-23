import type { RouteObject } from 'react-router'

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
          {
            path: 'settings',
            element: <PlaceholderPage titleKey="nav.settings" />,
          },
          {
            path: 'admin',
            element: <RequireAdmin />,
            children: [
              {
                path: 'accounts',
                element: <PlaceholderPage titleKey="nav.accounts" />,
              },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
