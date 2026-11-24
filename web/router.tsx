import type { RouteObject } from 'react-router'

import { SessionGate } from '@/session/gate'
import { RequireAdmin } from '@/session/require-admin'
import { AppShell } from '@/shell/app-shell'
import { NotFoundPage } from '@/shell/not-found-page'

interface FeatureRoutes {
  /** Pages under the shell, for anyone signed in. */
  routes?: RouteObject[]
  /** Pages under `admin/`, with paths relative to it. */
  adminRoutes?: RouteObject[]
}

const features = Object.values(
  import.meta.glob<FeatureRoutes>('./features/*/routes.tsx', { eager: true }),
)

/**
 * The one route table, gathered from each feature's `routes.tsx`. Order is
 * free, since the router ranks a static path above a parameter.
 */
export const routes: RouteObject[] = [
  {
    element: <SessionGate />,
    children: [
      {
        element: <AppShell />,
        children: [
          ...features.flatMap((feature) => feature.routes ?? []),
          {
            path: 'admin',
            element: <RequireAdmin />,
            children: [
              { index: true, element: <NotFoundPage /> },
              ...features.flatMap((feature) => feature.adminRoutes ?? []),
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
