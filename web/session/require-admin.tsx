import { Outlet } from 'react-router'

import { useSession } from '@/session/session-context'
import { NotFoundPage } from '@/shell/not-found-page'

/** Guards the admin's routes in the app. The API refuses a member as well. */
export function RequireAdmin() {
  const { user } = useSession()
  return user?.role === 'admin' ? <Outlet /> : <NotFoundPage />
}
