import type { PushDevice } from '@shared/notices.ts'

/** A push service host from the allowlist, under an invented path. */
export function fakeEndpoint(host = 'fcm.googleapis.com') {
  return `https://${host}/fcm/send/invented-${crypto.randomUUID()}`
}

/** A subscription with real key material, as a browser would hand over. */
export async function fakeDevice(
  endpoint = fakeEndpoint(),
): Promise<PushDevice> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair
  const point = (await crypto.subtle.exportKey(
    'raw',
    pair.publicKey,
  )) as ArrayBuffer
  return {
    endpoint,
    keys: {
      p256dh: base64Url(new Uint8Array(point)),
      auth: base64Url(crypto.getRandomValues(new Uint8Array(16))),
    },
  }
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}
