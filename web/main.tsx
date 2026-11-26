import './index.css'
import './i18n/setup'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app.tsx'

// Production alone, so a developer never debugs a build the worker cached.
if (import.meta.env.PROD) {
  void import('@/update/follow-releases').then(({ followReleases }) =>
    followReleases(),
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
