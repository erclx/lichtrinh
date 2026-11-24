import type { RouteObject } from 'react-router'

import { CalendarScreen } from '@/features/calendar/calendar-screen'

export const routes: RouteObject[] = [
  { path: 'calendar', element: <CalendarScreen /> },
]
