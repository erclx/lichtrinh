import '@/i18n/setup'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'

import { readStoredLanguage, storeLanguage } from '@/i18n/language'
import { applyLanguage } from '@/i18n/setup'
import { apiFetch } from '@/lib/api'
import { lastUserKey, SessionProvider } from '@/session/provider'
import { useSession } from '@/session/session-context'
import { aUser, failure, fakeApi, json, offline } from '@/test/fake-api'

function Probe() {
  const session = useSession()
  return (
    <div>
      <p>status: {session.status}</p>
      <p>user: {session.user?.displayName ?? 'none'}</p>
      <p>chat: {session.user?.canChat ? 'yes' : 'no'}</p>
      <button
        onClick={() =>
          session.signIn({ username: 'member', password: 'abcd efgh jkmn' })
        }
      >
        sign in
      </button>
      <button onClick={() => session.refresh()}>retry</button>
      <button onClick={() => session.signOut()}>sign out</button>
      <button onClick={() => apiFetch('/admin/users').catch(() => {})}>
        later call
      </button>
      <button onClick={() => session.saveLanguage('vi')}>save vi</button>
    </div>
  )
}

function renderSession(onSignedOut?: () => void) {
  return render(
    <SessionProvider onSignedOut={onSignedOut}>
      <Probe />
    </SessionProvider>,
  )
}

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SessionProvider', () => {
  it('reads loading until the first answer arrives', () => {
    fakeApi({ 'GET /auth/me': () => new Promise<Response>(() => {}) })

    renderSession()

    expect(screen.getByText('status: loading')).toBeInTheDocument()
  })

  it('reads signed in with the account when the session is live', async () => {
    fakeApi({
      'GET /auth/me': () => json(aUser({ displayName: 'Thành viên' })),
    })

    renderSession()

    expect(await screen.findByText('status: signed-in')).toBeInTheDocument()
    expect(screen.getByText('user: Thành viên')).toBeInTheDocument()
  })

  it('reads signed out when the API refuses the session', async () => {
    fakeApi({ 'GET /auth/me': () => failure('unauthenticated', 401) })

    renderSession()

    expect(await screen.findByText('status: signed-out')).toBeInTheDocument()
  })

  it('reads unreachable rather than signed out when the network is down', async () => {
    fakeApi({ 'GET /auth/me': offline })

    renderSession()

    expect(await screen.findByText('status: unreachable')).toBeInTheDocument()
  })

  it('reads unreachable when the API fails on its side', async () => {
    fakeApi({ 'GET /auth/me': () => failure('internal_error', 500) })

    renderSession()

    expect(await screen.findByText('status: unreachable')).toBeInTheDocument()
  })

  it('signs in again on retry once the network is back', async () => {
    const user = userEvent.setup()
    let online = false
    fakeApi({
      'GET /auth/me': () => (online ? json(aUser()) : offline()),
    })
    renderSession()
    await screen.findByText('status: unreachable')

    online = true
    await user.click(screen.getByRole('button', { name: 'retry' }))

    expect(await screen.findByText('status: signed-in')).toBeInTheDocument()
  })

  it('signs in with the credentials given', async () => {
    const user = userEvent.setup()
    const api = fakeApi({
      'GET /auth/me': () => failure('unauthenticated', 401),
      'POST /auth/sign-in': () => json(aUser({ displayName: 'Thành viên' })),
    })
    renderSession()
    await screen.findByText('status: signed-out')

    await user.click(screen.getByRole('button', { name: 'sign in' }))

    expect(await screen.findByText('user: Thành viên')).toBeInTheDocument()
    expect(api.requests.at(-1)?.body).toEqual({
      username: 'member',
      password: 'abcd efgh jkmn',
    })
  })

  it('returns to signed out when any later call finds the session gone', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => json(aUser()),
      'GET /admin/users': () => failure('unauthenticated', 401),
    })
    renderSession()
    await screen.findByText('status: signed-in')

    await user.click(screen.getByRole('button', { name: 'later call' }))

    expect(await screen.findByText('status: signed-out')).toBeInTheDocument()
    expect(screen.getByText('user: none')).toBeInTheDocument()
  })

  it('stays signed in when a later call is only forbidden', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => json(aUser()),
      'GET /admin/users': () => failure('forbidden', 403),
    })
    renderSession()
    await screen.findByText('status: signed-in')

    await user.click(screen.getByRole('button', { name: 'later call' }))

    expect(screen.getByText('status: signed-in')).toBeInTheDocument()
  })

  it('saves a language press to the account', async () => {
    const user = userEvent.setup()
    const api = fakeApi({
      'GET /auth/me': () => json(aUser()),
      'PATCH /auth/me': () => json(aUser({ language: 'vi' })),
    })
    renderSession()
    await screen.findByText('status: signed-in')

    await user.click(screen.getByRole('button', { name: 'save vi' }))

    expect(api.requests.at(-1)).toEqual({
      method: 'PATCH',
      path: '/auth/me',
      body: { language: 'vi' },
    })
  })
})

function rememberMember() {
  localStorage.setItem(
    lastUserKey,
    JSON.stringify({
      id: 'user-member',
      displayName: 'Thành viên',
      role: 'member',
      canChat: true,
      language: null,
    }),
  )
}

describe('offline', () => {
  it('opens on the remembered person when the network is down', async () => {
    rememberMember()
    fakeApi({ 'GET /auth/me': offline })

    renderSession()

    expect(await screen.findByText('status: offline')).toBeInTheDocument()
    expect(screen.getByText('user: Thành viên')).toBeInTheDocument()
    expect(screen.getByText('chat: yes')).toBeInTheDocument()
  })

  it('reads unreachable with nobody remembered on the device', async () => {
    fakeApi({ 'GET /auth/me': offline })

    renderSession()

    expect(await screen.findByText('status: unreachable')).toBeInTheDocument()
  })

  it('reads unreachable when the API answers with its own failure', async () => {
    rememberMember()
    fakeApi({ 'GET /auth/me': () => failure('internal_error', 500) })

    renderSession()

    expect(await screen.findByText('status: unreachable')).toBeInTheDocument()
  })

  it('remembers the signed-in person without their username', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ language: 'vi' })) })

    renderSession()
    await screen.findByText('status: signed-in')

    expect(JSON.parse(localStorage.getItem(lastUserKey) ?? 'null')).toEqual({
      id: 'user-member',
      displayName: 'Thành viên',
      role: 'member',
      canChat: false,
      language: 'vi',
    })
  })

  it('stays on the saved plan when the reconnect check meets a server failure', async () => {
    rememberMember()
    let failing = false
    fakeApi({
      'GET /auth/me': () =>
        failing ? failure('internal_error', 500) : offline(),
    })
    renderSession()
    await screen.findByText('status: offline')

    failing = true
    window.dispatchEvent(new Event('online'))
    await new Promise((settled) => setTimeout(settled, 50))

    expect(screen.getByText('status: offline')).toBeInTheDocument()
  })

  it('signs in again when the connection returns', async () => {
    rememberMember()
    let online = false
    fakeApi({ 'GET /auth/me': () => (online ? json(aUser()) : offline()) })
    renderSession()
    await screen.findByText('status: offline')

    online = true
    window.dispatchEvent(new Event('online'))

    expect(await screen.findByText('status: signed-in')).toBeInTheDocument()
  })

  it('signs out and forgets the device when a session was revoked while away', async () => {
    rememberMember()
    const forget = vi.fn()
    let online = false
    fakeApi({
      'GET /auth/me': () =>
        online ? failure('unauthenticated', 401) : offline(),
    })
    renderSession(forget)
    await screen.findByText('status: offline')

    online = true
    window.dispatchEvent(new Event('online'))

    expect(await screen.findByText('status: signed-out')).toBeInTheDocument()
    expect(forget).toHaveBeenCalled()
    expect(localStorage.getItem(lastUserKey)).toBeNull()
  })
})

describe('signing out', () => {
  it('forgets the person and the saved plan on the device', async () => {
    const user = userEvent.setup()
    const forget = vi.fn()
    fakeApi({
      'GET /auth/me': () => json(aUser()),
      'POST /auth/sign-out': () => new Response(null, { status: 204 }),
    })
    renderSession(forget)
    await screen.findByText('status: signed-in')

    await user.click(screen.getByRole('button', { name: 'sign out' }))

    expect(await screen.findByText('status: signed-out')).toBeInTheDocument()
    expect(forget).toHaveBeenCalledOnce()
    expect(localStorage.getItem(lastUserKey)).toBeNull()
  })
})

describe('the account language', () => {
  it('opens in the account language on a device with no stored choice', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ language: 'vi' })) })

    renderSession()
    await screen.findByText('status: signed-in')

    expect(i18n.language).toBe('vi')
  })

  it('applies the account language at sign-in without storing it', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => failure('unauthenticated', 401),
      'POST /auth/sign-in': () => json(aUser({ language: 'vi' })),
    })
    renderSession()
    await screen.findByText('status: signed-out')

    await user.click(screen.getByRole('button', { name: 'sign in' }))
    await screen.findByText('status: signed-in')

    expect(i18n.language).toBe('vi')
    expect(readStoredLanguage()).toBeNull()
  })

  it('keeps the device choice over the account language', async () => {
    storeLanguage('en')
    fakeApi({ 'GET /auth/me': () => json(aUser({ language: 'vi' })) })

    renderSession()
    await screen.findByText('status: signed-in')

    expect(i18n.language).toBe('en')
  })

  it('keeps the current language for an account with none set', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ language: null })) })

    renderSession()
    await screen.findByText('status: signed-in')

    expect(i18n.language).toBe('en')
  })
})
