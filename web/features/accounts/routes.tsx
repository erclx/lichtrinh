import type { RouteObject } from 'react-router'

import { AccountsPage } from '@/features/accounts/accounts-page'
import { CreateAccountPage } from '@/features/accounts/create-account-page'
import { EditAccountPage } from '@/features/accounts/edit-account-page'

export const adminRoutes: RouteObject[] = [
  { path: 'accounts', element: <AccountsPage /> },
  { path: 'accounts/new', element: <CreateAccountPage /> },
  { path: 'accounts/:id', element: <EditAccountPage /> },
]
