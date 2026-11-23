import { PASSWORD_LENGTH } from '@shared/generated-password.ts'

/**
 * The groups a password is shown and spoken in. Only a generated password
 * splits, since fours cut through anything else at arbitrary places, and the
 * admin reads what the server sent rather than a guess at its shape.
 */
export function groupPassword(value: string): string[] {
  if (value.length !== PASSWORD_LENGTH || /\s/.test(value)) return [value]
  return [value.slice(0, 4), value.slice(4, 8), value.slice(8)]
}
