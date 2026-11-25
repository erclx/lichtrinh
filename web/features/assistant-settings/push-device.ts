import type { PushDevice } from '@shared/notices.ts'

/**
 * What this device answers. `install` is an iPhone or iPad tab, which can ask
 * only from the home screen, and `unsupported` is a browser with no push, or
 * the dev server, which registers no service worker.
 */
export type PushAnswer = 'on' | 'off' | 'blocked' | 'install' | 'unsupported'

/** The device's own side of the setting, which the browser can change alone. */
export async function readPushAnswer(deviceOn: boolean): Promise<PushAnswer> {
  const cannot = whyNot()
  if (cannot !== null) return cannot
  if (Notification.permission === 'denied') return 'blocked'
  const registration = await navigator.serviceWorker.getRegistration()
  if (registration === undefined) return 'unsupported'
  const subscription = await registration.pushManager.getSubscription()
  return deviceOn &&
    Notification.permission === 'granted' &&
    subscription !== null
    ? 'on'
    : 'off'
}

/**
 * Asks for the permission and subscribes, answering the device to save or why
 * there is none. Called straight from a tap, since Safari ignores an ask that
 * comes after a wait.
 */
export async function subscribeDevice(
  publicKey: string,
): Promise<PushDevice | Exclude<PushAnswer, 'on'>> {
  const cannot = whyNot()
  if (cannot !== null) return cannot
  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'blocked'
  if (permission !== 'granted') return 'off'
  const registration = await navigator.serviceWorker.getRegistration()
  if (registration === undefined) return 'unsupported'
  const { pushManager } = await navigator.serviceWorker.ready
  // One made under an older key refuses the new one until it is gone.
  await (await pushManager.getSubscription())?.unsubscribe()
  const subscription = await pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: publicKey,
  })
  return toDevice(subscription)
}

/** Drops the subscription, after which the push service delivers nothing. */
export async function unsubscribeDevice(): Promise<void> {
  if (whyNot() !== null) return
  const registration = await navigator.serviceWorker.getRegistration()
  await (await registration?.pushManager.getSubscription())?.unsubscribe()
}

// An iPhone or iPad gives a page no push at all until it opens from the home
// screen, and only those carry Safari's own flag for that.
function whyNot(): 'install' | 'unsupported' | null {
  if (
    'PushManager' in window &&
    'Notification' in window &&
    'serviceWorker' in navigator
  ) {
    return null
  }
  return 'standalone' in navigator && navigator.standalone !== true
    ? 'install'
    : 'unsupported'
}

function toDevice(subscription: PushSubscription): PushDevice {
  const { endpoint, keys } = subscription.toJSON()
  return {
    endpoint: endpoint ?? '',
    keys: { p256dh: keys?.p256dh ?? '', auth: keys?.auth ?? '' },
  }
}
