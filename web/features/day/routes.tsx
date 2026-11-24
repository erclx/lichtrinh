import type { RouteObject } from 'react-router'

import { DayPage } from '@/features/day/day-view'

export const routes: RouteObject[] = [
  { path: 'trips/:tripId/days/:date', element: <DayPage /> },
]
