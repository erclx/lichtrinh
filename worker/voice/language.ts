import type { User } from '@shared/auth.ts'
import type { SpokenLanguage } from '@shared/voice.ts'

/** The language an account speaks and is answered in. */
export function spokenLanguage(user: User): SpokenLanguage {
  return user.language ?? 'vi'
}
