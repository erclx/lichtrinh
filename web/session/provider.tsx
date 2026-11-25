import {
  type Language,
  type SignInRequest,
  type User,
  user,
} from '@shared/auth.ts'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'

import { refreshMs } from '@/calendar-data/query-client'
import { readStoredLanguage } from '@/i18n/language'
import { applyLanguage } from '@/i18n/setup'
import { ApiFailure, apiFetch, onUnauthenticated } from '@/lib/api'
import { SessionContext, type SessionStatus } from '@/session/session-context'

interface State {
  status: SessionStatus
  user: User | null
}

const signedOut: State = { status: 'signed-out', user: null }

/** The last signed-in person, kept so the app opens offline on their plan. */
export const lastUserKey = 'lichtrinh.lastUser'

// The fields the shell needs offline and nothing more, never a credential.
const storedUser = user.pick({
  id: true,
  displayName: true,
  role: true,
  canChat: true,
  language: true,
})

function storeLastUser({ id, displayName, role, canChat, language }: User) {
  try {
    localStorage.setItem(
      lastUserKey,
      JSON.stringify({ id, displayName, role, canChat, language }),
    )
  } catch {
    // A private window opens offline on the retry page instead.
  }
}

function forgetLastUser() {
  try {
    localStorage.removeItem(lastUserKey)
  } catch {
    // Nothing was stored to forget.
  }
}

// The username shows on no offline page, so it is never stored.
function readLastUser(): User | null {
  try {
    const parsed = storedUser.safeParse(
      JSON.parse(localStorage.getItem(lastUserKey) ?? 'null'),
    )
    return parsed.success ? { ...parsed.data, username: '' } : null
  } catch {
    return null
  }
}

// A device choice outranks the account, so the account's language applies
// only where nobody has pressed the toggle, and never gets stored.
function applyAccountLanguage(account: User) {
  if (account.language !== null && readStoredLanguage() === null) {
    void applyLanguage(account.language)
  }
}

function signedIn(account: User): State {
  applyAccountLanguage(account)
  storeLastUser(account)
  return { status: 'signed-in', user: account }
}

async function loadSession(): Promise<State> {
  try {
    return signedIn(await apiFetch('/auth/me', { schema: user }))
  } catch (error) {
    if (error instanceof ApiFailure && error.code === 'unauthenticated') {
      return signedOut
    }
    const lost = error instanceof ApiFailure && error.code === 'network'
    const stored = lost ? readLastUser() : null
    if (stored !== null) {
      applyAccountLanguage(stored)
      return { status: 'offline', user: stored }
    }
    return { status: 'unreachable', user: null }
  }
}

interface SessionProviderProps {
  children: ReactNode
  /** Forgets what the device kept for the person, on every way to signed out. */
  onSignedOut?: () => void
}

export function SessionProvider({
  children,
  onSignedOut,
}: SessionProviderProps) {
  const [state, setState] = useState<State>({ status: 'loading', user: null })

  // Every way to signed out forgets what the device kept for the person.
  const settle = useCallback(
    (next: State) => {
      if (next.status === 'signed-out') {
        forgetLastUser()
        onSignedOut?.()
      }
      setState(next)
    },
    [onSignedOut],
  )

  useEffect(() => {
    let live = true
    void loadSession().then((next) => {
      if (live) settle(next)
    })
    const stop = onUnauthenticated(() => settle(signedOut))
    return () => {
      live = false
      stop()
    }
  }, [settle])

  // A layout effect, so an `online` event right after the offline commit is heard.
  const offline = state.status === 'offline'
  useLayoutEffect(() => {
    if (!offline) return
    let live = true
    const check = () =>
      void loadSession().then((next) => {
        if (!live) return
        if (next.status === 'signed-in' || next.status === 'signed-out') {
          settle(next)
        }
      })
    window.addEventListener('online', check)
    const timer = setInterval(check, refreshMs)
    return () => {
      live = false
      window.removeEventListener('online', check)
      clearInterval(timer)
    }
  }, [offline, settle])

  const signIn = useCallback(async (credentials: SignInRequest) => {
    const account = await apiFetch('/auth/sign-in', {
      method: 'POST',
      body: credentials,
      schema: user,
    })
    setState(signedIn(account))
  }, [])

  const signOut = useCallback(async () => {
    try {
      await apiFetch('/auth/sign-out', { method: 'POST' })
    } catch (error) {
      if (!(error instanceof ApiFailure && error.code === 'unauthenticated')) {
        throw error
      }
    }
    settle(signedOut)
  }, [settle])

  const refresh = useCallback(async () => {
    setState({ status: 'loading', user: null })
    settle(await loadSession())
  }, [settle])

  const saveLanguage = useCallback(async (language: Language) => {
    try {
      const account = await apiFetch('/auth/me', {
        method: 'PATCH',
        body: { language },
        schema: user,
      })
      setState((current) =>
        current.status === 'signed-in'
          ? { ...current, user: account }
          : current,
      )
    } catch {
      // The press already applied on this device, and a 401 is the gate's.
    }
  }, [])

  const value = useMemo(
    () => ({ ...state, signIn, signOut, refresh, saveLanguage }),
    [state, signIn, signOut, refresh, saveLanguage],
  )

  return <SessionContext value={value}>{children}</SessionContext>
}
