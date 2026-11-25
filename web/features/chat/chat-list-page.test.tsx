import '@/i18n/setup'

import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyLanguage } from '@/i18n/setup'
import { aChat, aReply } from '@/test/chat'
import { aUser, fakeApi, json } from '@/test/fake-api'
import { renderRoute } from '@/test/render-route'

type Routes = Parameters<typeof fakeApi>[0]

const traveler = aUser({ id: 'user-traveler', canChat: true })

function travelerApi(routes: Routes = {}) {
  return fakeApi({
    'GET /auth/me': () => json(traveler),
    'GET /trips': () => json({ trips: [] }),
    'GET /assistant/status': () =>
      json({
        online: true,
        lastAnsweredAt: null,
        model: 'lichtrinh-assistant',
      }),
    'POST /assistant/warm': () => new Response(null, { status: 202 }),
    'GET /settings': () => json({ contactName: null }),
    ...routes,
  })
}

function idOf(body: unknown): string {
  return typeof body === 'object' && body !== null && 'id' in body
    ? String(body.id)
    : ''
}

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('ChatListPage', () => {
  it('lists the chats most recently active first', async () => {
    travelerApi({
      'GET /chats': () =>
        json({
          chats: [
            aChat({
              id: 'older',
              title: 'Moving dinner',
              updatedAt: '2031-05-14T12:00:00.000Z',
            }),
            aChat({
              id: 'newer',
              title: 'Plan for today',
              updatedAt: '2031-05-15T03:00:00.000Z',
            }),
          ],
        }),
    })

    renderRoute('/chats')

    const rows = within(await screen.findByRole('list')).getAllByRole('link')
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      '/chats/newer',
      '/chats/older',
    ])
  })

  it("shows each chat's last message under its title", async () => {
    travelerApi({
      'GET /chats': () =>
        json({
          chats: [
            aChat({
              title: 'Moving dinner',
              lastMessage: 'Dinner is at 20:00.',
            }),
          ],
        }),
    })

    renderRoute('/chats')

    const row = await screen.findByRole('link', { name: /Moving dinner/ })
    expect(within(row).getByText('Dinner is at 20:00.')).toBeInTheDocument()
  })

  it.each([
    ['has no message yet', { lastMessage: null }],
    ['comes from an answer without the field', {}],
  ])('shows the title and the time alone when a chat %s', async (_, chat) => {
    vi.setSystemTime(new Date('2031-06-20T05:00:00.000Z'))
    travelerApi({
      'GET /chats': () =>
        json({
          chats: [
            aChat({
              title: 'Moving dinner',
              updatedAt: '2031-05-15T12:00:00.000Z',
              ...chat,
            }),
          ],
        }),
    })

    renderRoute('/chats')

    const row = await screen.findByRole('link', { name: /Moving dinner/ })
    expect(row).toHaveTextContent(/^Moving dinner5\/15$/)
  })

  it('shows the new last message on the way back from a send', async () => {
    const user = userEvent.setup()
    let lastMessage = 'Invented first reply'
    travelerApi({
      'GET /chats': () => json({ chats: [aChat({ lastMessage })] }),
      'GET /chats/chat-today': () => json({ chat: aChat(), messages: [] }),
      'POST /chats/chat-today/messages': () => {
        lastMessage = 'Invented second reply'
        return new Response(
          `${JSON.stringify({ type: 'done', message: aReply({ text: lastMessage }) })}\n`,
          { headers: { 'content-type': 'application/x-ndjson' } },
        )
      },
    })
    const { router } = renderRoute('/chats')
    await user.click(await screen.findByRole('link', { name: /first reply/ }))
    await user.type(
      await screen.findByLabelText('Message the assistant'),
      'pho sang mai{Enter}',
    )
    await screen.findByText('Invented second reply', {
      ignore: '[aria-live], script, style',
    })

    await act(() => router.navigate('/chats'))

    expect(
      await screen.findByRole('link', { name: /second reply/ }),
    ).toBeInTheDocument()
  })

  it('offers New chat when there are no chats yet', async () => {
    travelerApi({ 'GET /chats': () => json({ chats: [] }) })

    renderRoute('/chats')

    const empty = await screen.findByRole('region', { name: 'No chats yet' })

    expect(
      within(empty).getByRole('button', { name: 'New chat' }),
    ).toBeInTheDocument()
  })

  it('opens the new chat once New chat is pressed', async () => {
    const user = userEvent.setup()
    const { requests } = travelerApi({
      'GET /chats': () => json({ chats: [] }),
      'POST /chats': ({ body }) =>
        json({ chat: aChat({ id: idOf(body), title: null }) }, 201),
    })
    const { router } = renderRoute('/chats')
    const empty = await screen.findByRole('region', { name: 'No chats yet' })

    await user.click(within(empty).getByRole('button', { name: 'New chat' }))

    const created = idOf(requests.find(({ method }) => method === 'POST')?.body)
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(`/chats/${created}`),
    )
  })

  it('shows the not-found page to an account that cannot chat', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ canChat: false })) })

    renderRoute('/chats')

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
  })

  it('shows the not-found page at a chat typed by hand without chat', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser({ canChat: false })) })

    renderRoute('/chats/chat-today')

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
  })
})

describe('the Talk bar', () => {
  it('shows on Today for an account that can chat', async () => {
    travelerApi()

    renderRoute('/')

    expect(
      await screen.findByRole('button', { name: 'Talk to the assistant' }),
    ).toBeInTheDocument()
  })

  it('stays away for an account that cannot chat', async () => {
    fakeApi({
      'GET /auth/me': () => json(aUser({ canChat: false })),
      'GET /trips': () => json({ trips: [] }),
    })

    renderRoute('/')
    await screen.findByRole('heading', { name: 'Today' })

    expect(
      screen.queryByRole('button', { name: 'Talk to the assistant' }),
    ).toBeNull()
  })

  it('opens the most recent chat on a phone', async () => {
    const user = userEvent.setup()
    travelerApi({
      'GET /chats': () =>
        json({
          chats: [
            aChat({ id: 'older', updatedAt: '2031-05-14T12:00:00.000Z' }),
            aChat({ id: 'newer', updatedAt: '2031-05-15T03:00:00.000Z' }),
          ],
        }),
      'GET /chats/newer': () => json({ chat: aChat(), messages: [] }),
    })
    const { router } = renderRoute('/')

    await user.click(
      await screen.findByRole('button', { name: 'Talk to the assistant' }),
    )

    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/chats/newer'),
    )
  })
})
