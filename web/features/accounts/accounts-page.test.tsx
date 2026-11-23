import '@/i18n/setup'

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyLanguage } from '@/i18n/setup'
import { aUser, failure, fakeApi, json, offline } from '@/test/fake-api'
import { renderRoute } from '@/test/render-route'

const admin = aUser({
  id: 'user-admin',
  username: 'admin',
  displayName: 'Admin',
  role: 'admin',
})
const traveler = aUser({
  id: 'user-traveler',
  username: 'traveler',
  displayName: 'Du khách',
  canChat: true,
})
const cousin = aUser({
  id: 'user-cousin',
  username: 'family',
  displayName: 'Gia đình',
})

function renderAccounts() {
  return renderRoute('/admin/accounts').router
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

    const row = (await screen.findByText('Du khách')).closest('li')
    expect(row).toHaveTextContent('Family · can chat')
    expect(screen.getByText('Gia đình').closest('li')).toHaveTextContent(
      'Family',
    )
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
      screen.getByRole('button', { name: 'Reset password for Du khách' }),
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

    expect(await screen.findByText('Du khách')).toBeInTheDocument()
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
      await screen.findByRole('button', {
        name: 'Reset password for Du khách',
      }),
    )

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent("Reset Du khách's password?")
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
      await screen.findByRole('button', {
        name: 'Reset password for Du khách',
      }),
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
      await screen.findByRole('button', {
        name: 'Reset password for Du khách',
      }),
    )

    await user.click(
      await screen.findByRole('button', { name: 'Reset password' }),
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Send this password to Du khách',
      }),
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
      await screen.findByRole('button', {
        name: 'Reset password for Du khách',
      }),
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
      await screen.findByRole('button', {
        name: 'Reset password for Du khách',
      }),
    )

    await user.click(
      await screen.findByRole('button', { name: 'Reset password' }),
    )

    expect(
      await within(screen.getByRole('alertdialog')).findByRole('alert'),
    ).toHaveTextContent('Something went wrong')
  })

  it('opens the edit page from a row', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () => json({ users: [admin, traveler] }),
    })
    const router = renderAccounts()

    await user.click(await screen.findByRole('link', { name: 'Edit Du khách' }))

    expect(router.state.location.pathname).toBe('/admin/accounts/user-traveler')
  })

  it('links the admin’s own row to its edit page too', async () => {
    fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () => json({ users: [admin, traveler] }),
    })

    renderAccounts()

    expect(
      await screen.findByRole('link', { name: 'Edit Admin' }),
    ).toHaveAttribute('href', '/admin/accounts/user-admin')
  })
})
