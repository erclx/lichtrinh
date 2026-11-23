import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'

import { createQueryClient } from '@/calendar-data/query-client'
import { UndoProvider } from '@/components/undo-status'
import { routes } from '@/router'
import { SessionProvider } from '@/session/provider'

// Created once outside the tree, as a data router must be.
const router = createBrowserRouter(routes)
const queryClient = createQueryClient()

export function App() {
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <UndoProvider>
          <RouterProvider router={router} />
        </UndoProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
}
