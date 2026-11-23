import '@/i18n/setup'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { applyLanguage } from '@/i18n/setup'
import { apiFetch } from '@/lib/api'
import { routes } from '@/router'
import { SessionProvider } from '@/session/provider'
import { aUser, failure, fakeApi, json, offline } from '@/test/fake-api'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>,
  )
  return router
}

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the shell by role', () => {
  it('gives the admin an Accounts entry', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ role: 'admin' })) })

    renderAt('/')

    expect(
      (await screen.findAllByRole('link', { name: 'Accounts' })).length,
    ).toBeGreaterThan(0)
  })

  it('gives a member no Accounts entry', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ role: 'member' })) })

    renderAt('/')
    await screen.findByRole('heading', { name: 'Today' })

    expect(screen.queryAllByRole('link', { name: 'Accounts' })).toHaveLength(0)
  })

  it('shows a member the not-found page at the accounts path', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ role: 'member' })) })

    renderAt('/admin/accounts')

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
  })

  it('shows the admin the not-found page at the bare admin path', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ role: 'admin' })) })

    renderAt('/admin')

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
  })

  it('marks the current destination', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser()) })

    renderAt('/trips')
    await screen.findByRole('heading', { name: 'Trips' })

    const marks = screen
      .getAllByRole('link', { name: 'Trips' })
      .map((link) => link.getAttribute('aria-current'))
    expect(new Set(marks)).toEqual(new Set(['page']))
  })

  it('gives everyone the Settings button in the top bar', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ role: 'member' })) })

    renderAt('/')

    expect(
      await screen.findByRole('link', { name: 'Settings' }),
    ).toHaveAttribute('href', '/settings')
  })
})

describe('the desktop nav toggle', () => {
  it('hides the nav and offers it back in the top bar', async () => {
    const user = userEvent.setup()
    fakeApi({ 'GET /auth/me': () => json(aUser()) })
    renderAt('/')

    await user.click(
      await screen.findByRole('button', { name: 'Hide sidebar' }),
    )

    expect(screen.getByRole('button', { name: 'Show sidebar' })).toHaveFocus()
    expect(
      screen.queryByRole('button', { name: 'Hide sidebar' }),
    ).not.toBeInTheDocument()
  })

  it('restores a hidden nav from storage', async () => {
    localStorage.setItem('lichtrinh.navHidden', 'true')
    fakeApi({ 'GET /auth/me': () => json(aUser()) })

    renderAt('/')

    expect(
      await screen.findByRole('button', { name: 'Show sidebar' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Hide sidebar' }),
    ).not.toBeInTheDocument()
  })
})

describe('the session gate', () => {
  it('shows the sign-in card and no shell when signed out', async () => {
    fakeApi({ 'GET /auth/me': () => failure('unauthenticated', 401) })

    renderAt('/admin/accounts')

    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('lands on the path asked for after signing in', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => failure('unauthenticated', 401),
      'POST /auth/sign-in': () => json(aUser()),
    })
    const router = renderAt('/calendar')

    await user.type(await screen.findByLabelText('Username'), 'mai')
    await user.type(screen.getByLabelText('Password'), 'abcdefghjkmn')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByRole('heading', { name: 'Calendar' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/calendar')
  })

  it('returns to the sign-in card on a 401 and keeps the path', async () => {
    fakeApi({
      'GET /auth/me': () => json(aUser()),
      'GET /trips': () => failure('unauthenticated', 401),
    })
    const router = renderAt('/trips')
    await screen.findByRole('heading', { name: 'Trips' })

    await apiFetch('/trips').catch(() => {})

    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/trips')
  })

  it('offers a retry rather than the sign-in card when unreachable', async () => {
    fakeApi({ 'GET /auth/me': offline })

    renderAt('/')

    expect(
      await screen.findByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument()
  })
})
