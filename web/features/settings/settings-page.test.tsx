import '@/i18n/setup'

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyLanguage } from '@/i18n/setup'
import { aUser, fakeApi, json, offline } from '@/test/fake-api'
import { renderRoute } from '@/test/render-route'

function renderSettings() {
  return renderRoute('/settings').router
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

  it.each(['member', 'admin'] as const)(
    'gives the %s the Add to home screen row',
    async (role) => {
      fakeApi({ 'GET /auth/me': () => json(aUser({ role })) })

      renderSettings()

      expect(
        await screen.findByRole('link', { name: 'Add to home screen' }),
      ).toHaveAttribute('href', '/settings/install')
    },
  )

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

  it('gives the admin the Exchange rates row', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ role: 'admin' })) })

    renderSettings()

    expect(
      await screen.findByRole('link', { name: 'Exchange rates' }),
    ).toHaveAttribute('href', '/admin/rates')
  })

  it('shows a member no Exchange rates row', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ role: 'member' })) })

    renderSettings()
    await screen.findByRole('heading', { name: 'Settings' })

    expect(
      screen.queryByRole('link', { name: 'Exchange rates' }),
    ).not.toBeInTheDocument()
  })

  it('gives the admin the Assistant row', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ role: 'admin' })) })

    renderSettings()

    expect(
      await screen.findByRole('link', { name: 'Assistant' }),
    ).toHaveAttribute('href', '/admin/assistant')
  })

  it('shows a member no Assistant row', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ role: 'member' })) })

    renderSettings()
    await screen.findByRole('heading', { name: 'Settings' })

    expect(
      screen.queryByRole('link', { name: 'Assistant' }),
    ).not.toBeInTheDocument()
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

  describe('Appearance', () => {
    afterEach(() => {
      delete document.documentElement.dataset.theme
    })

    it('marks Auto pressed when nothing is stored', async () => {
      fakeApi({ 'GET /auth/me': () => json(aUser()) })

      renderSettings()
      const group = await screen.findByRole('group', { name: 'Appearance' })

      expect(
        within(group).getByRole('button', { name: 'Auto' }),
      ).toHaveAttribute('aria-pressed', 'true')
    })

    it('themes the page dark on Dark and remembers it on the device', async () => {
      const user = userEvent.setup()
      const api = fakeApi({ 'GET /auth/me': () => json(aUser()) })
      renderSettings()
      const group = await screen.findByRole('group', { name: 'Appearance' })

      await user.click(within(group).getByRole('button', { name: 'Dark' }))

      expect(document.documentElement.dataset.theme).toBe('dark')
      expect(localStorage.getItem('lichtrinh.theme')).toBe('dark')
      expect(
        within(group).getByRole('button', { name: 'Dark' }),
      ).toHaveAttribute('aria-pressed', 'true')
      expect(api.requests.map((request) => request.method)).toEqual(['GET'])
    })

    it('opens on the choice the device remembers', async () => {
      localStorage.setItem('lichtrinh.theme', 'light')
      fakeApi({ 'GET /auth/me': () => json(aUser()) })

      renderSettings()
      const group = await screen.findByRole('group', { name: 'Appearance' })

      expect(
        within(group).getByRole('button', { name: 'Light' }),
      ).toHaveAttribute('aria-pressed', 'true')
    })
  })
})
