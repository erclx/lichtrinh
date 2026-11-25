import type { PushDevice } from '@shared/notices.ts'

interface FakePush {
  permission?: NotificationPermission
  /** What the device's own question is answered with. */
  answer?: NotificationPermission
  /** A subscription the browser already holds. */
  subscribed?: boolean
  /** Whether the app's service worker is registered, as a build does. */
  registered?: boolean
}

/** An invented subscription, shaped as a browser serializes one. */
export function aPushDevice(): PushDevice {
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/invented',
    keys: { p256dh: `B${'a'.repeat(86)}`, auth: 'b'.repeat(22) },
  }
}

/**
 * A browser that can push, in place of jsdom, which cannot. Records what was
 * asked of it, and `removeFakePush` takes it away again.
 */
export function fakePush({
  permission = 'default',
  answer = 'granted',
  subscribed = false,
  registered = true,
}: FakePush = {}) {
  const asked: string[] = []
  const subscription = {
    toJSON: () => ({ ...aPushDevice(), expirationTime: null }),
    unsubscribe: async () => {
      asked.push('unsubscribe')
      held = null
      return true
    },
  }
  let held = subscribed ? subscription : null
  const registration = {
    pushManager: {
      getSubscription: async () => held,
      subscribe: async ({
        applicationServerKey,
      }: PushSubscriptionOptionsInit) => {
        asked.push(`subscribe ${String(applicationServerKey)}`)
        held = subscription
        return subscription
      },
    },
  }
  const notification = {
    permission,
    requestPermission: async () => {
      asked.push('permission')
      notification.permission = answer
      return answer
    },
  }
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', notification)
  onNavigator('serviceWorker', {
    getRegistration: async () => (registered ? registration : undefined),
    ready: Promise.resolve(registration),
  })
  return { asked }
}

/** An iPhone or iPad tab, whose pages get no push outside the home screen. */
export function fakeIphoneTab() {
  onNavigator('standalone', false)
}

export function removeFakePush() {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
  Reflect.deleteProperty(navigator, 'standalone')
}

// Defined on the one navigator, since a stubbed copy loses its getters.
function onNavigator(key: string, value: unknown) {
  Object.defineProperty(navigator, key, { configurable: true, value })
}
