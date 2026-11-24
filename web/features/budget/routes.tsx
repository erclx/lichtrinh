import type { RouteObject } from 'react-router'

import { BudgetPage } from '@/features/budget/budget-page'

export const routes: RouteObject[] = [
  { path: 'trips/:tripId/budget', element: <BudgetPage /> },
]
