import '@/i18n/setup'

import type { AssistantStatus } from '@shared/assistant.ts'
import type { ChatEvent, ChatMessage } from '@shared/chats.ts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { Thread } from '@/features/chat/thread'
import { applyLanguage } from '@/i18n/setup'
import {
  aChat,
  aMoveChange,
  anAddChange,
  aReply,
  aStep,
  aUserMessage,
} from '@/test/chat'
import { failure, fakeApi, json } from '@/test/fake-api'

type Routes = Parameters<typeof fakeApi>[0]

// The polite region repeats a finished reply or step for a screen reader,
// so a finder reading what the eye sees skips it.
const liveRegion = '[aria-live], script, style'

function aStatus(online: boolean): AssistantStatus {
  return { online, lastAnsweredAt: null, model: 'lichtrinh-assistant' }
}

/**
 * A send's streamed answer holding these events. An open stream never
 * ends, standing for a turn still running when the test looks.
 */
function streamed(events: ChatEvent[], { open = false } = {}): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }
      if (!open) controller.close()
    },
  })
  return new Response(body, {
    headers: { 'content-type': 'application/x-ndjson' },
  })
}

function chatApi(
  messages: ChatMessage[] | (() => ChatMessage[]),
  routes: Routes = {},
) {
  return fakeApi({
    'GET /chats/chat-today': () =>
      json({
        chat: aChat(),
        messages: typeof messages === 'function' ? messages() : messages,
      }),
    'GET /assistant/status': () => json(aStatus(true)),
    'POST /assistant/warm': () => new Response(null, { status: 202 }),
    'GET /settings': () => json({ contactName: null }),
    ...routes,
  })
}

function renderThread(layout: 'page' | 'panel' = 'panel') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false },
      mutations: { retry: false },
    },
  })
  const router = createMemoryRouter(
    [
      {
        path: '/chats/:chatId',
        element: <Thread chatId="chat-today" layout={layout} />,
      },
    ],
    { initialEntries: ['/chats/chat-today'] },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router }
}

async function send(text: string) {
  const user = userEvent.setup()
  await user.type(
    await screen.findByLabelText('Message the assistant'),
    `${text}{Enter}`,
  )
  return user
}

beforeEach(async () => {
  await applyLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Thread', () => {
  describe('a turn', () => {
    it('shows the sent message and thinking before any event', async () => {
      chatApi([], {
        'POST /chats/chat-today/messages': () => streamed([], { open: true }),
      })
      renderThread()

      await send('pho sang mai luc 7 gio')

      expect(screen.getByText('pho sang mai luc 7 gio')).toBeInTheDocument()
      expect(await screen.findByText('Thinking…')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    })

    it('shows each step in plain words while it works', async () => {
      chatApi([], {
        'POST /chats/chat-today/messages': () =>
          streamed([{ type: 'step', step: aStep() }], { open: true }),
      })
      renderThread()

      await send('pho sang mai luc 7 gio')

      expect(
        await screen.findByText('Added “Pho breakfast” at 07:00, Fri, May 16', {
          ignore: liveRegion,
        }),
      ).toBeInTheDocument()
    })

    it('shows the reply with one card and Undo per change', async () => {
      const reply = aReply({ changes: [anAddChange(), aMoveChange()] })
      chatApi([], {
        'POST /chats/chat-today/messages': () =>
          streamed([
            { type: 'delta', text: 'Done.' },
            { type: 'done', message: reply },
          ]),
      })
      renderThread()

      await send('pho sang mai luc 7 gio')

      expect(
        await screen.findByText(reply.text, { ignore: liveRegion }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Undo “Pho breakfast”' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Undo “Sunset boat trip”' }),
      ).toBeInTheDocument()
    })

    it('says nothing changed on a failure before any change, and Try again resends', async () => {
      const { requests } = chatApi([], {
        'POST /chats/chat-today/messages': () =>
          streamed([
            {
              type: 'error',
              code: 'assistant_failed',
              changed: false,
              message: aReply({ status: 'failed', text: '' }),
            },
          ]),
      })
      renderThread()
      const user = await send('ca phe luc 3 gio')

      expect(
        await screen.findByText('Nothing in the plan changed.'),
      ).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Try again' }))

      const sends = requests.filter(({ method }) => method === 'POST')
      const bodies = sends
        .filter(({ path }) => path === '/chats/chat-today/messages')
        .map(({ body }) => body)
      expect(bodies).toHaveLength(2)
      expect(bodies[1]).toMatchObject({ text: 'ca phe luc 3 gio' })
      expect(bodies[1]).not.toMatchObject({
        id: (bodies[0] as { id: string }).id,
      })
    })

    it('says some changes were made when the connection drops after one', async () => {
      chatApi([], {
        'POST /chats/chat-today/messages': () =>
          streamed([{ type: 'change', changeId: 'change-breakfast' }]),
      })
      renderThread()

      await send('pho sang mai luc 7 gio')

      expect(
        await screen.findByText(
          'Some changes were made, each shown here with Undo.',
        ),
      ).toBeInTheDocument()
    })

    it('ends stopped on Stop and keeps the change with its Undo', async () => {
      let saved: ChatMessage[] = []
      chatApi(() => saved, {
        'POST /chats/chat-today/messages': ({ body }) => {
          const { id } = body as { id: string }
          saved = [
            aUserMessage({ id }),
            aReply({ status: 'stopped', text: '', changes: [anAddChange()] }),
          ]
          return streamed([{ type: 'change', changeId: 'change-breakfast' }], {
            open: true,
          })
        },
      })
      renderThread()
      const user = await send('pho sang mai luc 7 gio')
      await screen.findByRole('button', { name: 'Stop' })

      await user.click(screen.getByRole('button', { name: 'Stop' }))

      expect(
        await screen.findByRole('button', { name: 'Undo “Pho breakfast”' }),
      ).toBeInTheDocument()
      expect(screen.getByText(/^Stopped\./)).toBeInTheDocument()
      expect(screen.queryByText(/Nothing in the plan changed/)).toBeNull()
    })

    it('reads a busy refusal as still answering, never as offline', async () => {
      chatApi([], {
        'POST /chats/chat-today/messages': () => failure('assistant_busy', 409),
      })
      renderThread()

      await send('ca phe')

      expect(
        await screen.findByText(/still answering another message/),
      ).toBeInTheDocument()
      expect(screen.queryByText('The assistant is offline')).toBeNull()
    })
  })

  describe('a chat whose trip is gone', () => {
    it('says the trip is gone and offers New chat rather than a retry', async () => {
      chatApi([], {
        'POST /chats/chat-today/messages': () => failure('no_trip', 409),
      })
      renderThread()

      await send('ca phe')

      expect(await screen.findByText(/trip is gone/)).toBeInTheDocument()
      expect(screen.queryByText(/Try again in a few minutes/)).toBeNull()
      expect(
        screen.getByRole('button', { name: 'New chat' }),
      ).toBeInTheDocument()
    })

    it('opens the new chat once New chat is pressed', async () => {
      const { requests } = chatApi([], {
        'POST /chats/chat-today/messages': () => failure('no_trip', 409),
        'POST /chats': ({ body }) =>
          json({ chat: aChat({ id: (body as { id: string }).id }) }, 201),
      })
      const { router } = renderThread('page')
      const user = await send('ca phe')

      await user.click(await screen.findByRole('button', { name: 'New chat' }))

      const created = requests.find(
        ({ method, path }) => method === 'POST' && path === '/chats',
      )
      const { id } = (created?.body ?? { id: 'none' }) as { id: string }
      await vi.waitFor(() =>
        expect(router.state.location.pathname).toBe(`/chats/${id}`),
      )
    })
  })

  describe('offline', () => {
    it('names the contact the admin set and turns the box off', async () => {
      chatApi([], {
        'GET /assistant/status': () => json(aStatus(false)),
        'GET /settings': () => json({ contactName: 'Anh cả' }),
      })
      renderThread()

      expect(
        await screen.findByText('The assistant is offline'),
      ).toBeInTheDocument()
      expect(
        await screen.findByText('Ask Anh cả to turn it back on.'),
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Message the assistant')).toBeDisabled()
    })

    it('asks the workspace PC to warm only once it reads online', async () => {
      const { requests } = chatApi([], {
        'GET /assistant/status': () => json(aStatus(false)),
      })
      renderThread()

      await screen.findByText('The assistant is offline')

      expect(requests.some(({ path }) => path === '/assistant/warm')).toBe(
        false,
      )
    })

    it('names the admin when no contact is set', async () => {
      chatApi([], { 'GET /assistant/status': () => json(aStatus(false)) })
      renderThread()

      expect(
        await screen.findByText('Ask the admin to turn it back on.'),
      ).toBeInTheDocument()
    })

    it('shows the offline card when a send finds the workspace PC off', async () => {
      let online = true
      chatApi([], {
        'GET /assistant/status': () => json(aStatus(online)),
        'POST /chats/chat-today/messages': () => {
          online = false
          return failure('assistant_unavailable', 503)
        },
      })
      renderThread()

      await send('ca phe')

      expect(
        await screen.findByText('The assistant is offline'),
      ).toBeInTheDocument()
    })
  })

  describe('a saved chat', () => {
    it('opens where it stopped, with Undone on an undone change', async () => {
      chatApi([
        aUserMessage(),
        aReply({
          changes: [anAddChange({ undoneBy: 'change-undo' }), aMoveChange()],
        }),
      ])
      renderThread()

      expect(await screen.findByText(aReply().text)).toBeInTheDocument()
      expect(screen.getByText('Undone')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Undo “Sunset boat trip”' }),
      ).toBeInTheDocument()
    })

    it('offers Try again on a failed reply that ends the chat', async () => {
      chatApi([
        aUserMessage(),
        aReply({ status: 'failed', text: '', changes: [] }),
      ])
      renderThread()

      expect(
        await screen.findByRole('button', { name: 'Try again' }),
      ).toBeInTheDocument()
    })
  })
})
