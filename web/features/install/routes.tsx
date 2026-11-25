import type { RouteObject } from 'react-router'

import { HomeScreenPage } from '@/features/install/home-screen-page'

export const routes: RouteObject[] = [
  { path: 'settings/install', element: <HomeScreenPage /> },
]
