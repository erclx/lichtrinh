const encoder = new TextEncoder()

/**
 * Whether an `Authorization` header carries the secret as a bearer token.
 * Both sides are hashed first, so the constant-time compare always sees
 * equal lengths. An unset secret matches nothing.
 */
export async function carriesSecret(
  header: string | undefined,
  secret: string | undefined,
): Promise<boolean> {
  if (secret === undefined || secret === '') return false
  const token = /^Bearer (.+)$/.exec(header ?? '')?.[1]
  if (token === undefined) return false
  const [given, expected] = await Promise.all([digest(token), digest(secret)])
  return crypto.subtle.timingSafeEqual(given, expected)
}

function digest(text: string) {
  return crypto.subtle.digest('SHA-256', encoder.encode(text))
}
