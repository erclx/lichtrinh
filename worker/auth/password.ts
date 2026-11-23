import {
  deriveKey,
  parsePasswordHash,
  PBKDF2_ITERATIONS,
} from '@shared/password-hash.ts'

const STAND_IN_SALT = new Uint8Array(16)

/**
 * True when the password matches the stored hash. Every call derives exactly
 * once, so a missing or unreadable hash costs what a wrong password costs.
 */
export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  const parsed = stored === null ? null : parsePasswordHash(stored)
  if (parsed === null) {
    await deriveKey(password, STAND_IN_SALT, PBKDF2_ITERATIONS)
    return false
  }
  const key = await deriveKey(password, parsed.salt, parsed.iterations)
  return crypto.subtle.timingSafeEqual(key, parsed.key)
}
