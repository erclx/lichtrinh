import '@/i18n/setup'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { applyLanguage } from '@/i18n/setup'
import { routes } from '@/router'
import { SessionProvider } from '@/session/provider'
import { aUser, failure, fakeApi, json, offline } from '@/test/fake-api'

const admin = aUser({
  id: 'user-admin',
  username: 'admin',
  displayName: 'Admin',
  role: 'admin',
})
const traveler = aUser({
  id: 'user-traveler',
  username: 'lan',
  displayName: 'Lan',
  canChat: true,
})
const cousin = aUser({
  id: 'user-cousin',
  username: 'minh',
  displayName: 'Minh',
})

function renderAccounts() {
  const router = createMemoryRouter(routes, {
    initialEntries: ['/admin/accounts'],
  })
  render(
    <SessionProvider>
      <RouterProvider router={router} />
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

describe('AccountsPage', () => {
  it('lists each account with its role and chat access', async () => {
    fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () => json({ users: [admin, traveler, cousin] }),
    })

    renderAccounts()

    const row = (await screen.findByText('Lan')).closest('li')
    expect(row).toHaveTextContent('Family · can chat')
    expect(screen.getByText('Minh').closest('li')).toHaveTextContent('Family')
  })

  it('offers no Reset on the admin’s own row', async () => {
    fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () => json({ users: [admin, traveler] }),
    })

    renderAccounts()

    const own = (await screen.findByText('Admin · you')).closest('li')
    expect(own).not.toBeNull()
    expect(within(own as HTMLElement).queryByRole('button')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Reset password for Lan' }),
    ).toBeInTheDocument()
  })

  it('shows the loading line while the list is on its way', async () => {
    fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () => new Promise<Response>(() => {}),
    })

    renderAccounts()

    expect(await screen.findByText('Loading accounts…')).toBeInTheDocument()
  })

  it('shows the empty state with a way to make the first account', async () => {
    fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () => json({ users: [] }),
    })

    renderAccounts()

    expect(await screen.findByText('No accounts yet.')).toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: 'New account' }).length,
    ).toBeGreaterThan(0)
  })

  it('offers a retry when the list fails, and loads on it', async () => {
    const user = userEvent.setup()
    let online = false
    fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () =>
        online ? json({ users: [admin, traveler] }) : offline(),
    })
    renderAccounts()
    await screen.findByText("Couldn't load the accounts.")

    online = true
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Lan')).toBeInTheDocument()
  })
})

describe('resetting a password', () => {
  it('asks first, naming the person and the sign-out', async () => {
    const user = userEvent.setup()
    const api = fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () => json({ users: [admin, traveler] }),
    })
    renderAccounts()

    await user.click(
      await screen.findByRole('button', { name: 'Reset password for Lan' }),
    )

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent("Reset Lan's password?")
    expect(dialog).toHaveTextContent('signed out on every device')
    expect(api.requests.some(({ method }) => method === 'POST')).toBe(false)
  })

  it('sends nothing when the admin cancels', async () => {
    const user = userEvent.setup()
    const api = fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () => json({ users: [admin, traveler] }),
    })
    renderAccounts()
    await user.click(
      await screen.findByRole('button', { name: 'Reset password for Lan' }),
    )

    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(api.requests.some(({ method }) => method === 'POST')).toBe(false)
  })

  it('shows the new password once, grouped in fours', async () => {
    const user = userEvent.setup()
    const api = fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () => json({ users: [admin, traveler] }),
      'POST /admin/users/user-traveler/password': () =>
        json({ password: 'nevasturbeka' }),
    })
    renderAccounts()
    await user.click(
      await screen.findByRole('button', { name: 'Reset password for Lan' }),
    )

    await user.click(
      await screen.findByRole('button', { name: 'Reset password' }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Send this password to Lan' }),
    ).toBeInTheDocument()
    expect(screen.getByText('neva')).toBeInTheDocument()
    expect(screen.getByText('stur')).toBeInTheDocument()
    expect(screen.getByText('beka')).toBeInTheDocument()
    expect(api.requests.at(-1)?.path).toBe(
      '/admin/users/user-traveler/password',
    )
  })

  it('clears the password on Done', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () => json({ users: [admin, traveler] }),
      'POST /admin/users/user-traveler/password': () =>
        json({ password: 'nevasturbeka' }),
    })
    renderAccounts()
    await user.click(
      await screen.findByRole('button', { name: 'Reset password for Lan' }),
    )
    await user.click(
      await screen.findByRole('button', { name: 'Reset password' }),
    )

    await user.click(await screen.findByRole('button', { name: 'Done' }))

    expect(screen.queryByText('neva')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Accounts' }),
    ).toBeInTheDocument()
  })

  it('keeps the confirm open with a message when the reset fails', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () => json({ users: [admin, traveler] }),
      'POST /admin/users/user-traveler/password': () =>
        failure('internal_error', 500),
    })
    renderAccounts()
    await user.click(
      await screen.findByRole('button', { name: 'Reset password for Lan' }),
    )

    await user.click(
      await screen.findByRole('button', { name: 'Reset password' }),
    )

    expect(
      await within(screen.getByRole('alertdialog')).findByRole('alert'),
    ).toHaveTextContent('Something went wrong')
  })
})
