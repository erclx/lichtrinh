import '@/i18n/setup'

import type { NoticeKind, NoticeState, SentNotice } from '@shared/notices.ts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { NotifyAction } from '@/features/chat/notify-action'
import { applyLanguage } from '@/i18n/setup'
import { failure, fakeApi, json, offline } from '@/test/fake-api'

type Routes = Parameters<typeof fakeApi>[0]

const now = new Date(2031, 4, 15, 10, 30)

/** A notice sent at 10:20 on the device's own clock. */
function aNotice(overrides: Partial<SentNotice> = {}): SentNotice {
  return {
    sentAt: new Date(2031, 4, 15, 10, 20).toISOString(),
    byName: 'Người nhà',
    byMe: true,
    ...overrides,
  }
}

function aState(overrides: Partial<NoticeState> = {}): NoticeState {
  return { reachable: true, assistant: null, voice: null, ...overrides }
}

function noticesApi(state: NoticeState, routes: Routes = {}) {
  return fakeApi({ 'GET /notices': () => json(state), ...routes })
}

function renderAction(
  kind: NoticeKind = 'assistant',
  {
    contactName = null,
    admin = false,
  }: { contactName?: string | null; admin?: boolean } = {},
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  render(
    <QueryClientProvider client={client}>
      <NotifyAction kind={kind} contactName={contactName} admin={admin} />
    </QueryClientProvider>,
  )
  return client
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  await applyLanguage('en')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const COPY = [
  {
    language: 'en' as const,
    ready: 'Notify the admin',
    hint: 'The admin gets a notice to turn the computer back on.',
    sending: 'Sending the notice…',
    sent: 'Notice sent to the admin at 10:20',
    sentOn: 'Notice sent to the admin on 5/14 at 10:20',
    told: 'Người nhà sent a notice at 10:20',
    back: 'The assistant comes back here by itself once the computer is on.',
    voiceBack: 'The mic comes back by itself once voice is on.',
    failed: 'The notice did not go out. Try again, or ask the admin yourself.',
    retry: 'Try again',
    ask: 'Ask the admin to turn it back on.',
    askVoice: 'Ask the admin to turn voice back on.',
    self: 'Turn the home computer on to bring it back.',
    voiceSelf: 'Turn voice on at the home computer to bring it back.',
  },
  {
    language: 'vi' as const,
    ready: 'Báo cho quản trị viên',
    hint: 'Quản trị viên sẽ nhận thông báo để bật lại máy.',
    sending: 'Đang gửi thông báo…',
    sent: 'Đã gửi thông báo cho quản trị viên lúc 10:20',
    sentOn: 'Đã gửi thông báo cho quản trị viên ngày 14/5 lúc 10:20',
    told: 'Người nhà đã gửi thông báo lúc 10:20',
    back: 'Khi máy bật lại, trợ lý sẽ tự trở lại ở đây.',
    voiceBack: 'Khi giọng nói bật lại, nút nói sẽ tự sáng lên.',
    failed:
      'Chưa gửi được thông báo. Bạn thử lại, hoặc tự nhắn quản trị viên nhé.',
    retry: 'Thử lại',
    ask: 'Nhờ quản trị viên bật lại máy.',
    askVoice: 'Nhờ quản trị viên bật lại giọng nói.',
    self: 'Bật máy ở nhà để trợ lý trở lại.',
    voiceSelf: 'Bật giọng nói trên máy ở nhà để dùng lại.',
  },
]

describe.each(COPY)('NotifyAction in $language', (copy) => {
  beforeEach(async () => {
    await applyLanguage(copy.language)
  })

  it('offers Notify with what it does', async () => {
    noticesApi(aState())

    renderAction()

    expect(
      await screen.findByRole('button', { name: copy.ready }),
    ).toBeInTheDocument()
    expect(screen.getByText(copy.hint)).toBeInTheDocument()
  })

  it('says it is sending until the answer lands', async () => {
    const user = userEvent.setup()
    noticesApi(aState(), {
      'POST /notices': () => new Promise<Response>(() => undefined),
    })
    renderAction()

    await user.click(await screen.findByRole('button', { name: copy.ready }))

    const button = await screen.findByRole('button', { name: copy.sending })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByText(copy.hint)).toBeNull()
  })

  it('says the notice went out, and when', async () => {
    const user = userEvent.setup()
    noticesApi(aState(), { 'POST /notices': () => json(aNotice()) })
    renderAction()

    await user.click(await screen.findByRole('button', { name: copy.ready }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(copy.sent)
    expect(status).toHaveTextContent(copy.back)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says the mic comes back on the voice card', async () => {
    noticesApi(aState({ voice: aNotice() }))

    renderAction('voice')

    expect(await screen.findByRole('status')).toHaveTextContent(copy.voiceBack)
  })

  it('names the day of a notice sent before today', async () => {
    noticesApi(
      aState({
        assistant: aNotice({
          sentAt: new Date(2031, 4, 14, 10, 20).toISOString(),
        }),
      }),
    )

    renderAction()

    expect(await screen.findByRole('status')).toHaveTextContent(copy.sentOn)
  })

  it('names someone else who sent it first', async () => {
    noticesApi(aState({ assistant: aNotice({ byMe: false }) }))

    renderAction()

    expect(await screen.findByRole('status')).toHaveTextContent(copy.told)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says a failed notice did not go out and offers another try', async () => {
    const user = userEvent.setup()
    noticesApi(aState(), {
      'POST /notices': () => failure('notice_failed', 502),
    })
    renderAction()

    await user.click(await screen.findByRole('button', { name: copy.ready }))

    expect(await screen.findByRole('alert')).toHaveTextContent(copy.failed)
    expect(screen.getByRole('button', { name: copy.retry })).toBeInTheDocument()
  })

  it('names whom to ask with no way to notify set', async () => {
    noticesApi(aState({ reachable: false }))

    renderAction()

    expect(await screen.findByText(copy.ask)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('names whom to ask for voice', async () => {
    noticesApi(aState({ reachable: false }))

    renderAction('voice')

    expect(await screen.findByText(copy.askVoice)).toBeInTheDocument()
  })

  it.each([
    ['assistant' as const, copy.self],
    ['voice' as const, copy.voiceSelf],
  ])("tells the admin's own account to turn %s on", (kind, line) => {
    const { requests } = noticesApi(aState())

    renderAction(kind, { admin: true })

    expect(screen.getByText(line)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(requests).toEqual([])
  })
})

describe('NotifyAction', () => {
  it('sends the kind it stands for', async () => {
    const user = userEvent.setup()
    const { requests } = noticesApi(aState(), {
      'POST /notices': () => json(aNotice()),
    })
    renderAction('voice')

    await user.click(
      await screen.findByRole('button', { name: 'Notify the admin' }),
    )

    await screen.findByRole('status')
    expect(requests.filter(({ method }) => method === 'POST')).toEqual([
      { method: 'POST', path: '/notices', body: { kind: 'voice' } },
    ])
  })

  it('sends once for a second press while sending', async () => {
    const user = userEvent.setup()
    const { requests } = noticesApi(aState(), {
      'POST /notices': () => new Promise<Response>(() => undefined),
    })
    renderAction()
    await user.click(
      await screen.findByRole('button', { name: 'Notify the admin' }),
    )

    await user.click(
      await screen.findByRole('button', { name: 'Sending the notice…' }),
    )

    expect(requests.filter(({ method }) => method === 'POST')).toHaveLength(1)
  })

  it('keeps the keyboard on the line that replaced the button', async () => {
    const user = userEvent.setup()
    noticesApi(aState(), { 'POST /notices': () => json(aNotice()) })
    renderAction()

    await user.click(
      await screen.findByRole('button', { name: 'Notify the admin' }),
    )

    const status = await screen.findByRole('status')
    await waitFor(() => expect(status).toHaveFocus())
  })

  it('sends again after a failure', async () => {
    const user = userEvent.setup()
    let tries = 0
    noticesApi(aState(), {
      'POST /notices': () => {
        tries += 1
        return tries === 1 ? failure('notice_failed', 502) : json(aNotice())
      },
    })
    renderAction()
    await user.click(
      await screen.findByRole('button', { name: 'Notify the admin' }),
    )

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Notice sent')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('calls nothing failed when the service came back first', async () => {
    const user = userEvent.setup()
    noticesApi(aState(), { 'POST /notices': () => failure('not_down', 409) })
    renderAction()

    await user.click(
      await screen.findByRole('button', { name: 'Notify the admin' }),
    )

    expect(
      await screen.findByRole('button', { name: 'Notify the admin' }),
    ).toHaveAttribute('aria-disabled', 'false')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows no ending until the notices are read', () => {
    noticesApi(aState(), {
      'GET /notices': () => new Promise<Response>(() => undefined),
    })

    renderAction()

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/turn it back on/)).toBeNull()
  })

  it('names whom to ask when the notices cannot be read', async () => {
    noticesApi(aState(), { 'GET /notices': offline })

    renderAction('assistant', { contactName: 'Anh cả' })

    expect(
      await screen.findByText('Ask Anh cả to turn it back on.'),
    ).toBeInTheDocument()
  })

  it('shows a name with markup as text', async () => {
    noticesApi(
      aState({ assistant: aNotice({ byMe: false, byName: '<b>An</b>' }) }),
    )

    renderAction()

    expect(await screen.findByRole('status')).toHaveTextContent(
      '<b>An</b> sent a notice at 10:20',
    )
  })
})
