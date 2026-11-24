import type { RouteObject } from 'react-router'

import { SettingsPage } from '@/features/settings/settings-page'

export const routes: RouteObject[] = [
  { path: 'settings', element: <SettingsPage /> },
]
