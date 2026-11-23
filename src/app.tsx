import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createBrowserRouter, RouterProvider } from 'react-router'

import { createQueryClient } from '@/calendar-data/query-client'
import { UndoProvider } from '@/components/undo-status'
import { calendarPersistOptions } from '@/offline/persist'
import { routes } from '@/router'
import { SessionProvider } from '@/session/provider'

// Created once outside the tree, as a data router must be.
const router = createBrowserRouter(routes)
const queryClient = createQueryClient()
const persistOptions = calendarPersistOptions()

export function App() {
  return (
    <SessionProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
      >
        <UndoProvider>
          <RouterProvider router={router} />
        </UndoProvider>
      </PersistQueryClientProvider>
    </SessionProvider>
  )
}
