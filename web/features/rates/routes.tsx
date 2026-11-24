import type { RouteObject } from 'react-router'

import { RatesPage } from '@/features/rates/rates-page'

export const adminRoutes: RouteObject[] = [
  { path: 'rates', element: <RatesPage /> },
]
