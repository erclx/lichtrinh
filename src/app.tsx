import { createBrowserRouter, RouterProvider } from 'react-router'

import { routes } from '@/router'
import { SessionProvider } from '@/session/provider'

// Created once outside the tree, as a data router must be.
const router = createBrowserRouter(routes)

export function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  )
}
