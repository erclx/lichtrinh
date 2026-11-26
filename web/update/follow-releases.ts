import { registerSW } from 'virtual:pwa-register'

import { takeRelease } from '@/update/take-release'

async function askOnShow(registration: ServiceWorkerRegistration | undefined) {
  try {
    await registration?.update()
  } catch {
    // Offline or behind a captive page, so the saved release stands.
  }
  await takeRelease()
}

/**
 * Registers the worker and moves this page onto each release it takes over
 * with: an untouched page at once, a touched one on its next show or screen.
 * A resumed app asks on every show, since it asks for none until a load.
 */
export function followReleases() {
  let touched = false
  let registration: ServiceWorkerRegistration | undefined
  const touch = () => {
    touched = true
  }
  window.addEventListener('pointerdown', touch, { capture: true })
  window.addEventListener('keydown', touch, { capture: true })

  // Kept empty so the plugin never reloads every window by itself.
  registerSW({
    immediate: true,
    onNeedReload: () => {},
    onRegisteredSW: (_url, found) => {
      registration = found
    },
  })

  // Read here, since the plugin hears only the first takeover a page sees.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!touched) void takeRelease()
    })
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    touched = false
    void askOnShow(registration)
  })
}
