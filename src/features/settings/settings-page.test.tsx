import '@/i18n/setup'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { applyLanguage } from '@/i18n/setup'
import { routes } from '@/router'
import { SessionProvider } from '@/session/provider'
import { aUser, fakeApi, json, offline } from '@/test/fake-api'

function renderSettings() {
  const router = createMemoryRouter(routes, { initialEntries: ['/settings'] })
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

describe('SettingsPage', () => {
  it('signs out to the sign-in card', async () => {
    const user = userEvent.setup()
    const api = fakeApi({
      'GET /auth/me': () => json(aUser()),
      'POST /auth/sign-out': () => new Response(null, { status: 204 }),
    })
    const router = renderSettings()

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument()
    expect(api.requests.at(-1)?.path).toBe('/auth/sign-out')
    expect(router.state.location.pathname).toBe('/')
  })

  it('stays signed in with a message when sign-out cannot reach the API', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => json(aUser()),
      'POST /auth/sign-out': offline,
    })
    renderSettings()

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't connect")
    expect(
      screen.getByRole('heading', { name: 'Settings' }),
    ).toBeInTheDocument()
  })

  it('shows a member no Manage accounts row', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ role: 'member' })) })

    renderSettings()
    await screen.findByRole('heading', { name: 'Settings' })

    expect(
      screen.queryByRole('link', { name: 'Manage accounts' }),
    ).not.toBeInTheDocument()
  })

  it('gives the admin the Manage accounts row', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ role: 'admin' })) })

    renderSettings()

    expect(
      await screen.findByRole('link', { name: 'Manage accounts' }),
    ).toHaveAttribute('href', '/admin/accounts')
  })

  it('saves a language press to the account', async () => {
    const user = userEvent.setup()
    const api = fakeApi({
      'GET /auth/me': () => json(aUser()),
      'PATCH /auth/me': () => json(aUser({ language: 'vi' })),
    })
    renderSettings()
    await screen.findByRole('heading', { name: 'Settings' })

    const [toggle] = screen.getAllByRole('button', { name: 'VI Tiếng Việt' })
    await user.click(toggle)

    expect(api.requests.at(-1)).toMatchObject({
      method: 'PATCH',
      body: { language: 'vi' },
    })
  })
})
