import '@/i18n/setup'

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyLanguage } from '@/i18n/setup'
import { aUser, failure, fakeApi, json, offline } from '@/test/fake-api'
import { renderRoute } from '@/test/render-route'

const admin = aUser({
  id: 'user-admin',
  username: 'admin',
  displayName: 'Admin',
  role: 'admin',
  language: 'en',
})
const traveler = aUser({
  id: 'user-traveler',
  username: 'traveler',
  displayName: 'Du khách',
  canChat: true,
  language: 'vi',
})

function renderEdit(id: string) {
  return renderRoute(`/admin/accounts/${id}`).router
}

function listed() {
  return {
    'GET /auth/me': () => json(admin),
    'GET /admin/users': () => json({ users: [admin, traveler] }),
  }
}

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EditAccountPage', () => {
  it('prefills the account and shows its username read-only', async () => {
    fakeApi(listed())

    renderEdit('user-traveler')

    expect(await screen.findByLabelText('Display name')).toHaveValue('Du khách')
    expect(screen.getByText('traveler')).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Family' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'On' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('sends only the fields that changed and returns to the list', async () => {
    const user = userEvent.setup()
    const api = fakeApi({
      ...listed(),
      'PATCH /admin/users/user-traveler': () =>
        json({ user: { ...traveler, canChat: false } }),
    })
    const router = renderEdit('user-traveler')

    await user.click(await screen.findByRole('button', { name: 'Off' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByRole('heading', { name: 'Accounts' })
    expect(router.state.location.pathname).toBe('/admin/accounts')
    expect(api.requests.find(({ method }) => method === 'PATCH')?.body).toEqual(
      { canChat: false },
    )
  })

  it('returns to the list unsent when nothing changed', async () => {
    const user = userEvent.setup()
    const api = fakeApi(listed())
    const router = renderEdit('user-traveler')

    await user.click(await screen.findByRole('button', { name: 'Save' }))

    await screen.findByRole('heading', { name: 'Accounts' })
    expect(router.state.location.pathname).toBe('/admin/accounts')
    expect(api.requests.some(({ method }) => method === 'PATCH')).toBe(false)
  })

  it('refuses an empty display name unsent', async () => {
    const user = userEvent.setup()
    const api = fakeApi(listed())
    renderEdit('user-traveler')

    await user.clear(await screen.findByLabelText('Display name'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Enter a display name.')).toBeInTheDocument()
    expect(screen.getByLabelText('Display name')).toHaveFocus()
    expect(api.requests.some(({ method }) => method === 'PATCH')).toBe(false)
  })

  it('shows last_admin under Role and keeps the form', async () => {
    const user = userEvent.setup()
    const otherAdmin = aUser({
      id: 'user-other',
      username: 'other',
      displayName: 'Quản trị khác',
      role: 'admin',
    })
    fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () => json({ users: [admin, otherAdmin] }),
      'PATCH /admin/users/user-other': () => failure('last_admin', 409),
    })
    const router = renderEdit('user-other')

    await user.click(await screen.findByRole('button', { name: 'Family' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText(/Keep at least one admin/),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/accounts/user-other')
    expect(screen.getByRole('button', { name: 'Family' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('says the connection failed and keeps the form', async () => {
    const user = userEvent.setup()
    fakeApi({ ...listed(), 'PATCH /admin/users/user-traveler': offline })
    renderEdit('user-traveler')

    await user.click(await screen.findByRole('button', { name: 'English' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Can't connect. Check the internet and try again.",
    )
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('sends no language for an account that never picked one', async () => {
    const user = userEvent.setup()
    const unset = aUser({ id: 'user-unset', displayName: 'Họ hàng' })
    const api = fakeApi({
      'GET /auth/me': () => json(admin),
      'GET /admin/users': () => json({ users: [admin, unset] }),
      'PATCH /admin/users/user-unset': () =>
        json({ user: { ...unset, canChat: true } }),
    })
    renderEdit('user-unset')

    await user.click(await screen.findByRole('button', { name: 'On' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByRole('heading', { name: 'Accounts' })
    expect(api.requests.find(({ method }) => method === 'PATCH')?.body).toEqual(
      { canChat: true },
    )
  })

  it('renders the not-found page for an id no account holds', async () => {
    fakeApi(listed())

    renderEdit('no-such-account')

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument()
  })

  it('shows the admin their own role as fixed text', async () => {
    fakeApi(listed())

    renderEdit('user-admin')

    expect(await screen.findByLabelText('Display name')).toHaveValue('Admin')
    expect(screen.getByText("You can't change your own role.")).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Family' }),
    ).not.toBeInTheDocument()
  })
})
