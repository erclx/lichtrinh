import './index.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { PanelPage } from './panel-page.tsx'
import { usePanelState } from './use-panel-state.ts'

// The page is one screen over one query, so its root holds both.
// oxlint-disable-next-line react/only-export-components
function Panel() {
  const { state, stale, pending, failure, press } = usePanelState()
  if (state !== undefined) {
    return (
      <PanelPage
        state={state}
        stale={stale}
        pending={pending}
        failure={failure}
        onPress={press}
      />
    )
  }
  return stale ? (
    <p role="alert" className="p-4">
      The panel is not answering. Double-click the shortcut to start it again.
    </p>
  ) : null
}

const root = document.getElementById('root')
if (root === null) throw new Error('The page has no root')
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <Panel />
    </QueryClientProvider>
  </StrictMode>,
)
