import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { UndoProvider } from '@/components/undo-status'
import { routes } from '@/router'
import { SessionProvider } from '@/session/provider'

/**
 * Renders the whole route table at `path` as `app.tsx` does, with a fresh
 * cache that never retries or refreshes, so each test reads its own answers.
 */
export function renderRoute(path: string) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <SessionProvider>
      <QueryClientProvider client={client}>
        <UndoProvider>
          <RouterProvider router={router} />
        </UndoProvider>
      </QueryClientProvider>
    </SessionProvider>,
  )
  return { router }
}
