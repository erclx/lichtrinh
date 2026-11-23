import '@/i18n/setup'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { applyLanguage } from '@/i18n/setup'
import { routes } from '@/router'
import { SessionProvider } from '@/session/provider'
import { aUser, failure, fakeApi, json } from '@/test/fake-api'

const admin = aUser({
  id: 'user-admin',
  username: 'admin',
  displayName: 'Admin',
  role: 'admin',
})

function renderCreate() {
  const router = createMemoryRouter(routes, {
    initialEntries: ['/admin/accounts/new'],
  })
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

describe('CreateAccountPage', () => {
  it('refuses an empty display name and an invalid username unsent', async () => {
    const user = userEvent.setup()
    const api = fakeApi({ 'GET /auth/me': () => json(admin) })
    renderCreate()

    await user.type(await screen.findByLabelText('Username'), 'Cô Út')
    await user.click(
      screen.getByRole('button', { name: 'Create and get the password' }),
    )

    expect(screen.getByText('Enter a display name.')).toBeInTheDocument()
    expect(
      screen.getByText(/Use 2 to 32 lowercase letters or numbers/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Display name')).toHaveFocus()
    expect(api.requests.some(({ method }) => method === 'POST')).toBe(false)
  })

  it('sends the name, the username, the role, chat, and the language', async () => {
    const user = userEvent.setup()
    const api = fakeApi({
      'GET /auth/me': () => json(admin),
      'POST /admin/users': () =>
        json(
          {
            user: aUser({ username: 'traveler', displayName: 'Du khách' }),
            password: 'mapekrytuvha',
          },
          201,
        ),
    })
    renderCreate()

    await user.type(await screen.findByLabelText('Display name'), ' Du khách ')
    await user.type(screen.getByLabelText('Username'), 'Traveler')
    await user.click(screen.getByRole('button', { name: 'Admin' }))
    await user.click(screen.getByRole('button', { name: 'On' }))
    await user.click(screen.getByRole('button', { name: 'English' }))
    await user.click(
      screen.getByRole('button', { name: 'Create and get the password' }),
    )

    await screen.findByRole('heading', {
      name: 'Send this password to Du khách',
    })
    expect(api.requests.at(-1)).toEqual({
      method: 'POST',
      path: '/admin/users',
      body: {
        displayName: 'Du khách',
        username: 'traveler',
        role: 'admin',
        canChat: true,
        language: 'en',
      },
    })
  })

  it('defaults to a family member who cannot chat, in Vietnamese', async () => {
    const user = userEvent.setup()
    const api = fakeApi({
      'GET /auth/me': () => json(admin),
      'POST /admin/users': () =>
        json({ user: aUser(), password: 'mapekrytuvha' }, 201),
    })
    renderCreate()

    await user.type(await screen.findByLabelText('Display name'), 'Mai')
    await user.type(screen.getByLabelText('Username'), 'mai')
    await user.click(
      screen.getByRole('button', { name: 'Create and get the password' }),
    )

    await screen.findByRole('heading', { name: 'Account created' })
    expect(api.requests.at(-1)?.body).toMatchObject({
      role: 'member',
      canChat: false,
      language: 'vi',
    })
  })

  it('shows the password once, grouped in fours', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => json(admin),
      'POST /admin/users': () =>
        json({ user: aUser(), password: 'mapekrytuvha' }, 201),
    })
    renderCreate()

    await user.type(await screen.findByLabelText('Display name'), 'Mai')
    await user.type(screen.getByLabelText('Username'), 'mai')
    await user.click(
      screen.getByRole('button', { name: 'Create and get the password' }),
    )

    expect(await screen.findByText('mape')).toBeInTheDocument()
    expect(screen.getByText('kryt')).toBeInTheDocument()
    expect(screen.getByText('uvha')).toBeInTheDocument()
  })

  it('returns to the list on Done, leaving the password behind', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () => json({ users: [admin] }),
      'POST /admin/users': () =>
        json({ user: aUser(), password: 'mapekrytuvha' }, 201),
    })
    const router = renderCreate()
    await user.type(await screen.findByLabelText('Display name'), 'Mai')
    await user.type(screen.getByLabelText('Username'), 'mai')
    await user.click(
      screen.getByRole('button', { name: 'Create and get the password' }),
    )

    await user.click(await screen.findByRole('button', { name: 'Done' }))

    expect(
      await screen.findByRole('heading', { name: 'Accounts' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('mape')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/accounts')
    expect(JSON.stringify(router.state.location)).not.toContain('mape')
  })

  it('refuses a display name past 60 characters unsent', async () => {
    const user = userEvent.setup()
    const api = fakeApi({ 'GET /auth/me': () => json(admin) })
    renderCreate()

    await user.type(
      await screen.findByLabelText('Display name'),
      'a'.repeat(61),
    )
    await user.type(screen.getByLabelText('Username'), 'mai')
    await user.click(
      screen.getByRole('button', { name: 'Create and get the password' }),
    )

    expect(
      screen.getByText('Keep the display name to 60 characters.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Display name')).toHaveFocus()
    expect(api.requests.some(({ method }) => method === 'POST')).toBe(false)
  })

  it('offers no reset link when the taken username is the admin’s own', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => json(admin),
      'POST /admin/users': () => failure('username_taken', 409),
    })
    renderCreate()

    await user.type(await screen.findByLabelText('Display name'), 'Admin two')
    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.click(
      screen.getByRole('button', { name: 'Create and get the password' }),
    )

    expect(
      await screen.findByText('That username is taken.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Reset that account instead' }),
    ).not.toBeInTheDocument()
  })

  it('shows a taken username under Username with a link to reset it', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => json(admin),
      'POST /admin/users': () => failure('username_taken', 409),
    })
    renderCreate()

    await user.type(await screen.findByLabelText('Display name'), 'Mai')
    await user.type(screen.getByLabelText('Username'), 'mai')
    await user.click(
      screen.getByRole('button', { name: 'Create and get the password' }),
    )

    expect(
      await screen.findByText('That username is taken.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(
      screen.getByRole('link', { name: 'Reset that account instead' }),
    ).toHaveAttribute('href', '/admin/accounts')
  })

  it('opens the reset confirm for the taken account from its link', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () =>
        json({
          users: [admin, aUser({ username: 'mai', displayName: 'Mai' })],
        }),
      'POST /admin/users': () => failure('username_taken', 409),
    })
    renderCreate()
    await user.type(await screen.findByLabelText('Display name'), 'Mai')
    await user.type(screen.getByLabelText('Username'), 'mai')
    await user.click(
      screen.getByRole('button', { name: 'Create and get the password' }),
    )

    await user.click(
      await screen.findByRole('link', { name: 'Reset that account instead' }),
    )

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      "Reset Mai's password?",
    )
  })
})
