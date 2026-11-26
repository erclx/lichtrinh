// Runs alike in the Worker and in Bun on standard Web Crypto, so the admin
// command and sign-in hash a password the same way.

// Estimated at 7 to 8 ms of CPU on staging, per `.claude/rules/project/code/passwords.md`.
// A row on an older count still signs in at its old cost, and an unknown name
// answers in equal time only once every account is reset onto this one.
export const PBKDF2_ITERATIONS = 10_000

const SCHEME = 'pbkdf2-sha256'
const SALT_BYTES = 16
const KEY_BYTES = 32
// A stored count past this is corrupt rather than a stronger hash, and would
// spend a request's CPU before failing.
const MAX_ITERATIONS = 1_000_000

export interface PasswordHash {
  iterations: number
  salt: Uint8Array<ArrayBuffer>
  key: Uint8Array<ArrayBuffer>
}

export async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    KEY_BYTES * 8,
  )
  return new Uint8Array(bits)
}

/**
 * The string a `users.password_hash` row stores, naming its scheme and
 * iteration count so a later count can be read beside an older one.
 */
export async function hashPassword(
  password: string,
  salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(
    new Uint8Array(SALT_BYTES),
  ),
): Promise<string> {
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS)
  return [SCHEME, PBKDF2_ITERATIONS, toBase64(salt), toBase64(key)].join('$')
}

/** Null for any string this module did not write. */
export function parsePasswordHash(stored: string): PasswordHash | null {
  const parts = stored.split('$')
  if (parts.length !== 4) return null
  const [scheme, count, salt, key] = parts
  if (scheme !== SCHEME || !/^[1-9]\d*$/.test(count)) return null
  const iterations = Number(count)
  if (iterations > MAX_ITERATIONS) return null
  const saltBytes = fromBase64(salt)
  const keyBytes = fromBase64(key)
  if (saltBytes === null || saltBytes.length === 0) return null
  if (keyBytes === null || keyBytes.length !== KEY_BYTES) return null
  return { iterations, salt: saltBytes, key: keyBytes }
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length % 4 !== 0) {
    return null
  }
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}
