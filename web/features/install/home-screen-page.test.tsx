import '@/i18n/setup'

import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyLanguage } from '@/i18n/setup'
import { aUser, fakeApi, json } from '@/test/fake-api'
import { renderRoute } from '@/test/render-route'

// Chrome and Edge fire this on a site they can install, and no other browser does.
function offerInstall() {
  const prompt = vi.fn(() => Promise.resolve())
  const event = new Event('beforeinstallprompt', { cancelable: true })
  act(() => {
    window.dispatchEvent(Object.assign(event, { prompt }))
  })
  return { event, prompt }
}

function matchStandalone() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(display-mode: standalone)',
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

async function renderInstall(heading = 'Add to home screen') {
  fakeApi({ 'GET /auth/me': () => json(aUser({ role: 'member' })) })
  renderRoute('/settings/install')
  await screen.findByRole('heading', { name: heading, level: 1 })
}

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
})

afterEach(() => {
  // The offer outlives a page, so each test hands the next one none.
  act(() => {
    window.dispatchEvent(new Event('appinstalled'))
  })
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'standalone')
})

describe('HomeScreenPage', () => {
  it('walks through three steps in English', async () => {
    await renderInstall()

    const steps = screen
      .getAllByRole('listitem')
      .map((item) => item.textContent)

    expect(steps).toEqual([
      expect.stringContaining('Share'),
      expect.stringContaining('“Add to Home Screen”'),
      expect.stringContaining('“Add”'),
    ])
  })

  it("walks through three steps in Vietnamese, in Safari's own words", async () => {
    await applyLanguage('vi')
    await renderInstall('Thêm vào màn hình chính')

    const steps = screen
      .getAllByRole('listitem')
      .map((item) => item.textContent)

    expect(steps).toEqual([
      expect.stringContaining('“Chia sẻ”'),
      expect.stringMatching(
        /“Thêm vào Màn hình chính”.*“Mở dưới dạng ứng dụng web”/,
      ),
      expect.stringContaining('“Thêm”'),
    ])
  })

  it('leads back to Settings', async () => {
    await renderInstall()

    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '/settings',
    )
  })

  describe('installed', () => {
    it('says so in place of the steps in an installed app', async () => {
      matchStandalone()

      await renderInstall()

      expect(screen.getByText(/already installed/)).toBeInTheDocument()
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    })

    it('reads an iPhone home-screen app by its own flag', async () => {
      Object.defineProperty(navigator, 'standalone', {
        value: true,
        configurable: true,
      })

      await renderInstall()

      expect(screen.getByText(/already installed/)).toBeInTheDocument()
    })

    it('offers no Install button in an installed app', async () => {
      matchStandalone()
      await renderInstall()

      offerInstall()

      expect(
        screen.queryByRole('button', { name: 'Install on this device' }),
      ).not.toBeInTheDocument()
    })
  })

  describe('Install button', () => {
    it('is absent where the browser makes no offer', async () => {
      await renderInstall()

      expect(
        screen.queryByRole('button', { name: 'Install on this device' }),
      ).not.toBeInTheDocument()
    })

    it('shows for an offer made before the page opened', async () => {
      offerInstall()

      await renderInstall()

      expect(
        screen.getByRole('button', { name: 'Install on this device' }),
      ).toBeInTheDocument()
    })

    it("opens the browser's own prompt, once per offer", async () => {
      const user = userEvent.setup()
      await renderInstall()
      const { event, prompt } = offerInstall()

      await user.click(
        screen.getByRole('button', { name: 'Install on this device' }),
      )

      expect(event.defaultPrevented).toBe(true)
      expect(prompt).toHaveBeenCalledOnce()
      expect(
        screen.queryByRole('button', { name: 'Install on this device' }),
      ).not.toBeInTheDocument()
    })
  })
})
