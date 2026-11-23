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
  useMemo,
  useState,
} from 'react'

import { readStoredLanguage } from '@/i18n/language'
import { applyLanguage } from '@/i18n/setup'
import { ApiFailure, apiFetch, onUnauthenticated } from '@/lib/api'
import { SessionContext, type SessionStatus } from '@/session/session-context'

interface State {
  status: SessionStatus
  user: User | null
}

const signedOut: State = { status: 'signed-out', user: null }

// A device choice outranks the account, so the account's language applies
// only where nobody has pressed the toggle, and never gets stored.
function applyAccountLanguage(account: User) {
  if (account.language !== null && readStoredLanguage() === null) {
    void applyLanguage(account.language)
  }
}

function signedIn(account: User): State {
  applyAccountLanguage(account)
  return { status: 'signed-in', user: account }
}

async function loadSession(): Promise<State> {
  try {
    return signedIn(await apiFetch('/auth/me', { schema: user }))
  } catch (error) {
    if (error instanceof ApiFailure && error.code === 'unauthenticated') {
      return signedOut
    }
    return { status: 'unreachable', user: null }
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading', user: null })

  useEffect(() => {
    let live = true
    void loadSession().then((next) => {
      if (live) setState(next)
    })
    const stop = onUnauthenticated(() => setState(signedOut))
    return () => {
      live = false
      stop()
    }
  }, [])

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
    setState(signedOut)
  }, [])

  const refresh = useCallback(async () => {
    setState({ status: 'loading', user: null })
    setState(await loadSession())
  }, [])

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
