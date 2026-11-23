// Lowercase letters and digits without 0, 1, i, l, and o, which a person
// reading a password aloud or off a screen mistakes for each other. 31
// symbols across 12 places give about 59 bits.
export const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export const PASSWORD_LENGTH = 12

// The largest multiple of the alphabet a byte can hold. A byte at or past it
// is skipped, since its remainder would favor the first few symbols.
const UNBIASED_LIMIT = 256 - (256 % PASSWORD_ALPHABET.length)

type RandomBytes = (count: number) => Uint8Array

/** The password as stored and verified, with no grouping spaces. */
export function generatePassword(
  randomBytes: RandomBytes = (count) =>
    crypto.getRandomValues(new Uint8Array(count)),
): string {
  let password = ''
  while (password.length < PASSWORD_LENGTH) {
    for (const byte of randomBytes(PASSWORD_LENGTH - password.length)) {
      if (byte < UNBIASED_LIMIT) {
        password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]
      }
    }
  }
  return password
}

/** The form shown to the admin, which sign-in accepts with or without spaces. */
export function groupInFours(password: string): string {
  return password.match(/.{1,4}/g)?.join(' ') ?? password
}
