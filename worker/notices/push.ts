import { buildPushPayload } from '@block65/webcrypto-web-push'
import type { PushWords } from '@shared/notice-text.ts'
import { and, eq } from 'drizzle-orm'

import type { createDb } from '../db/client.ts'
import { pushDevices } from '../db/schema.ts'

const TIMEOUT_MS = 5_000

// Half a day, so a phone off overnight still hears about it, and a notice
// for an outage long over never arrives.
const KEPT_FOR_SECONDS = 12 * 60 * 60

// The push services browsers name, so a saved endpoint can point the Worker
// at nothing else. A leading dot takes any host below it.
const HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  '.push.apple.com',
  '.notify.windows.com',
]

/** Whether an endpoint is one a browser's own push service hands out. */
export function isPushEndpoint(endpoint: string): boolean {
  if (!URL.canParse(endpoint)) return false
  const url = new URL(endpoint)
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    HOSTS.some((host) =>
      host.startsWith('.')
        ? url.hostname.endsWith(host)
        : url.hostname === host,
    )
  )
}

export interface VapidKeys {
  subject: string
  publicKey: string
  privateKey: string
}

/** This copy's push keys, or null while either is unset. */
export function vapidKeys(env: Env, origin: string): VapidKeys | null {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = env
  if (!publicKey || !privateKey) return null
  return { subject: origin, publicKey, privateKey }
}

export interface PushTarget {
  sessionId: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Posts one push, and answers whether the push service took it. A device the
 * service no longer knows is removed. Nothing here throws, so one bad device
 * never stops the others.
 */
export async function sendPush(
  db: ReturnType<typeof createDb>,
  device: PushTarget,
  words: PushWords,
  vapid: VapidKeys,
  timeoutMs = TIMEOUT_MS,
): Promise<boolean> {
  try {
    const request = await buildPushPayload(
      {
        data: { ...words },
        options: { ttl: KEPT_FOR_SECONDS, urgency: 'high' },
      },
      {
        endpoint: device.endpoint,
        expirationTime: null,
        keys: { p256dh: device.p256dh, auth: device.auth },
      },
      vapid,
    )
    const res = await fetch(device.endpoint, {
      ...request,
      // A redirect would leave the allowed hosts.
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    await res.body?.cancel()
    if (res.status === 404 || res.status === 410) await forget(db, device)
    return res.ok
  } catch {
    return false
  }
}

// Held to the endpoint sent to, since the device may have subscribed again
// while the push was on its way.
function forget(db: ReturnType<typeof createDb>, device: PushTarget) {
  return db
    .delete(pushDevices)
    .where(
      and(
        eq(pushDevices.sessionId, device.sessionId),
        eq(pushDevices.endpoint, device.endpoint),
      ),
    )
}
