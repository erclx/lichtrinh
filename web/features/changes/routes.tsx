import type { RouteObject } from 'react-router'

import { HistoryPage } from '@/features/changes/history-page'

export const routes: RouteObject[] = [
  { path: 'trips/:tripId/history', element: <HistoryPage /> },
]
