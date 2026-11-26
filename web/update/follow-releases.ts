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
 * with. An untouched page moves at once, a touched one on its next show or
 * screen, and none while something holds it. A resumed app asks for an
 * update on every show, since it otherwise asks for none until a load.
 */
export function followReleases() {
  let touched = false
  let registration: ServiceWorkerRegistration | undefined
  const touch = () => {
    touched = true
  }
  window.addEventListener('pointerdown', touch, { capture: true })
  window.addEventListener('keydown', touch, { capture: true })

  registerSW({
    immediate: true,
    // Set so the plugin never reloads every window by itself. The takeover
    // is read below instead, since the plugin stops listening after one.
    onNeedReload: () => {},
    onRegisteredSW: (_url, found) => {
      registration = found
    },
  })

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
