import { useSyncExternalStore } from 'react'

import { useMediaQuery } from '@/hooks/use-media-query'

// Not in the DOM types, since Chrome and Edge alone fire it.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<unknown>
}

function isInstallPrompt(event: Event): event is InstallPromptEvent {
  return 'prompt' in event && typeof event.prompt === 'function'
}

let held: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

function hold(event: InstallPromptEvent | null) {
  held = event
  listeners.forEach((listener) => listener())
}

// Listened for at load rather than by the page, since the browser fires once,
// often before anyone opens the install page.
window.addEventListener('beforeinstallprompt', (event) => {
  if (!isInstallPrompt(event)) return
  event.preventDefault()
  hold(event)
})
window.addEventListener('appinstalled', () => hold(null))

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Opens the browser's own install prompt, or null where it has offered none. */
export function useInstallPrompt(): (() => void) | null {
  const event = useSyncExternalStore(
    subscribe,
    () => held,
    () => null,
  )
  if (event === null) return null
  return () => {
    // A browser answers one offer once, so a spent one leaves no dead button.
    hold(null)
    void event.prompt()
  }
}

/** Whether this is the installed app rather than a browser tab. */
export function useInstalled(): boolean {
  const standalone = useMediaQuery('(display-mode: standalone)')
  // Safari's own flag for a page opened from the home screen.
  return (
    standalone || ('standalone' in navigator && navigator.standalone === true)
  )
}
