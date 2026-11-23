import '@/i18n/setup'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'

import { readStoredLanguage, storeLanguage } from '@/i18n/language'
import { applyLanguage } from '@/i18n/setup'
import { apiFetch } from '@/lib/api'
import { SessionProvider } from '@/session/provider'
import { useSession } from '@/session/session-context'
import { aUser, failure, fakeApi, json, offline } from '@/test/fake-api'

function Probe() {
  const session = useSession()
  return (
    <div>
      <p>status: {session.status}</p>
      <p>user: {session.user?.displayName ?? 'none'}</p>
      <button
        onClick={() =>
          session.signIn({ username: 'member', password: 'abcd efgh jkmn' })
        }
      >
        sign in
      </button>
      <button onClick={() => session.refresh()}>retry</button>
      <button onClick={() => apiFetch('/admin/users').catch(() => {})}>
        later call
      </button>
      <button onClick={() => session.saveLanguage('vi')}>save vi</button>
    </div>
  )
}

function renderSession() {
  return render(
    <SessionProvider>
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
