import type { RouteObject } from 'react-router'

import { TodayScreen } from '@/features/today/today-screen'

export const routes: RouteObject[] = [{ index: true, element: <TodayScreen /> }]
