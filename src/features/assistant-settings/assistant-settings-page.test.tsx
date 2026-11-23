import '@/i18n/setup'

import type { AssistantStatus } from '@shared/assistant.ts'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyLanguage } from '@/i18n/setup'
import { aUser, failure, fakeApi, json, offline } from '@/test/fake-api'
import { renderRoute } from '@/test/render-route'

type Routes = Parameters<typeof fakeApi>[0]

function aStatus(overrides: Partial<AssistantStatus> = {}): AssistantStatus {
  return {
    online: true,
    lastAnsweredAt: null,
    model: 'lichtrinh-assistant',
    ...overrides,
  }
}

/** Today at 10:14 on the device's clock, as the API sends it. */
function todayAt1014() {
  const at = new Date()
  at.setHours(10, 14, 0, 0)
  return at.toISOString()
}

function adminApi(routes: Routes = {}) {
  return fakeApi({
    'GET /auth/me': () => json(aUser({ id: 'user-admin', role: 'admin' })),
    'GET /assistant/status': () => json(aStatus()),
    'GET /settings': () => json({ contactName: null }),
    ...routes,
  })
}

function renderPage() {
  renderRoute('/admin/assistant')
}

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AssistantSettingsPage', () => {
  describe('the home computer card', () => {
    it('reads Online with the time the assistant last answered', async () => {
      adminApi({
        'GET /assistant/status': () =>
          json(aStatus({ online: true, lastAnsweredAt: todayAt1014() })),
      })

      renderPage()

      expect(await screen.findByText('Online')).toBeInTheDocument()
      expect(
        screen.getByText(/last answered at 10:14.*today/),
      ).toBeInTheDocument()
    })

    it('reads Offline in words before the first answer', async () => {
      adminApi({
        'GET /assistant/status': () => json(aStatus({ online: false })),
      })

      renderPage()

      expect(await screen.findByText('Offline')).toBeInTheDocument()
      expect(
        screen.getByText("The assistant hasn't answered yet."),
      ).toBeInTheDocument()
    })

    it('offers a retry when the settings cannot load', async () => {
      const user = userEvent.setup()
      let reachable = false
      adminApi({
        'GET /assistant/status': () =>
          reachable ? json(aStatus()) : offline(),
      })
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Try again' }))
      reachable = true
      await user.click(screen.getByRole('button', { name: 'Try again' }))

      expect(await screen.findByText('Online')).toBeInTheDocument()
    })
  })

  describe('the model', () => {
    it('checks the model the status names', async () => {
      adminApi({
        'GET /assistant/status': () =>
          json(aStatus({ model: 'lichtrinh-assistant-gemma' })),
      })

      renderPage()

      expect(await screen.findByRole('radio', { name: 'Gemma' })).toBeChecked()
      expect(screen.getByRole('radio', { name: 'Qwen' })).not.toBeChecked()
    })

    it('saves a picked model and confirms it inline', async () => {
      const user = userEvent.setup()
      const api = adminApi({
        'PUT /admin/assistant': ({ body }) => json(body),
      })
      renderPage()

      await user.click(await screen.findByRole('radio', { name: 'Gemma' }))

      expect(await screen.findByText(/^Saved\. The next answer/)).toBeVisible()
      expect(screen.getByRole('radio', { name: 'Gemma' })).toBeChecked()
      expect(api.requests.at(-1)).toEqual({
        method: 'PUT',
        path: '/admin/assistant',
        body: { model: 'lichtrinh-assistant-gemma' },
      })
    })

    it('keeps the saved model and says so when the save fails', async () => {
      const user = userEvent.setup()
      adminApi({ 'PUT /admin/assistant': offline })
      renderPage()

      await user.click(await screen.findByRole('radio', { name: 'Gemma' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Can't connect",
      )
      expect(screen.getByRole('radio', { name: 'Qwen' })).toBeChecked()
    })
  })

  describe('the contact name', () => {
    it('saves the name typed and confirms it inline', async () => {
      const user = userEvent.setup()
      const api = adminApi({
        'PUT /admin/settings': ({ body }) => json(body),
      })
      renderPage()

      await user.type(
        await screen.findByLabelText(
          'Name shown when the assistant is offline',
        ),
        '  Invented Cousin ',
      )
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(await screen.findByText('Saved.')).toBeVisible()
      expect(api.requests.at(-1)?.body).toEqual({
        contactName: 'Invented Cousin',
      })
    })

    it('clears the name when saved empty', async () => {
      const user = userEvent.setup()
      const api = adminApi({
        'GET /settings': () => json({ contactName: 'Invented Cousin' }),
        'PUT /admin/settings': ({ body }) => json(body),
      })
      renderPage()
      const field = await screen.findByLabelText(
        'Name shown when the assistant is offline',
      )
      await screen.findByDisplayValue('Invented Cousin')

      await user.clear(field)
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(await screen.findByText(/^Cleared\./)).toBeVisible()
      expect(api.requests.at(-1)?.body).toEqual({ contactName: null })
    })

    it('refuses a name past 60 characters without sending it', async () => {
      const user = userEvent.setup()
      const api = adminApi()
      renderPage()
      const field = await screen.findByLabelText(
        'Name shown when the assistant is offline',
      )

      await user.type(field, 'x'.repeat(61))
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(field).toHaveAccessibleDescription(/60 characters/)
      expect(api.requests.some(({ method }) => method === 'PUT')).toBe(false)
    })

    it('shows a failed save inline', async () => {
      const user = userEvent.setup()
      adminApi({
        'PUT /admin/settings': () => failure('internal_error', 500),
      })
      renderPage()

      await user.type(
        await screen.findByLabelText(
          'Name shown when the assistant is offline',
        ),
        'Invented Cousin',
      )
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Something went wrong',
      )
    })
  })

  it('shows a member the not-found page', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ role: 'member' })) })

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
  })
})
