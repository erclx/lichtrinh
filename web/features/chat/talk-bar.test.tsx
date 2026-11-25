import '@/i18n/setup'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { TalkBar } from '@/features/chat/talk-bar'
import { applyLanguage } from '@/i18n/setup'
import { OfflineCard } from '@/offline/offline-card'
import { aChat } from '@/test/chat'
import { fakeApi, json } from '@/test/fake-api'

/** Wide enough for the sheet, or a phone, which opens the chat's page. */
function renderBar({ roomy = false } = {}) {
  vi.stubGlobal('matchMedia', () => ({
    matches: roomy,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  const onOpenPanel = vi.fn()
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <>
            <OfflineCard />
            <TalkBar
              onOpenPanel={onOpenPanel}
              talkRef={createRef<HTMLButtonElement>()}
            />
          </>
        ),
      },
      { path: '/chats/:chatId', element: null },
    ],
    { initialEntries: ['/'] },
  )
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { onOpenPanel, router }
}

beforeEach(async () => {
  await applyLanguage('en')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('TalkBar', () => {
  it('opens the latest chat on a phone', async () => {
    const user = userEvent.setup()
    fakeApi({ 'GET /chats': () => json({ chats: [aChat()] }) })
    const { router } = renderBar()

    await user.click(
      screen.getByRole('button', { name: 'Talk to the assistant' }),
    )

    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/chats/chat-today'),
    )
  })

  it('opens the sheet where there is room for it', async () => {
    const user = userEvent.setup()
    fakeApi({})
    const { onOpenPanel } = renderBar({ roomy: true })

    await user.click(
      screen.getByRole('button', { name: 'Talk to the assistant' }),
    )

    expect(onOpenPanel).toHaveBeenCalledOnce()
  })

  describe('with no connection', () => {
    beforeEach(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    })

    it('says it needs one, with the reason the card gives', () => {
      renderBar()

      const bar = screen.getByRole('button', { name: 'Needs a connection' })
      expect(bar).toHaveAttribute('aria-disabled', 'true')
      expect(bar).toHaveAccessibleDescription(/once the connection is back/)
    })

    it('says so in Vietnamese', async () => {
      await applyLanguage('vi')

      renderBar()

      expect(
        screen.getByRole('button', { name: 'Cần có mạng' }),
      ).toBeInTheDocument()
    })

    it('opens nothing on a press', async () => {
      const user = userEvent.setup()
      const { requests } = fakeApi({})
      const { onOpenPanel, router } = renderBar({ roomy: true })

      await user.click(
        screen.getByRole('button', { name: 'Needs a connection' }),
      )

      expect(onOpenPanel).not.toHaveBeenCalled()
      expect(router.state.location.pathname).toBe('/')
      expect(requests).toEqual([])
    })
  })
})
