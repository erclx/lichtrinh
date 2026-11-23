import type { Language, SignInRequest, User } from '@shared/auth.ts'
import { createContext, useContext } from 'react'

/**
 * `unreachable` is kept apart from `signed-out`, since a signed-in person
 * whose network dropped still holds a live session.
 */
export type SessionStatus =
  | 'loading'
  | 'signed-out'
  | 'signed-in'
  | 'unreachable'

export interface SessionValue {
  status: SessionStatus
  user: User | null
  /** Throws `ApiFailure` for the sign-in page to word. */
  signIn: (credentials: SignInRequest) => Promise<void>
  signOut: () => Promise<void>
  /** Asks the API again, the retry an unreachable load offers. */
  refresh: () => Promise<void>
  /** Saves a language press to the account, so a new device opens in it. */
  saveLanguage: (language: Language) => Promise<void>
}

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const session = useContext(SessionContext)
  if (session === null) {
    throw new Error('useSession needs a SessionProvider above it')
  }
  return session
}
