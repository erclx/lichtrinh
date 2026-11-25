import '@/i18n/setup'

import type { NoticeSetting } from '@shared/notices.ts'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

import { NotifyMe } from '@/features/assistant-settings/notify-me'
import { applyLanguage } from '@/i18n/setup'
import { failure, fakeApi, json, offline } from '@/test/fake-api'
import {
  aPushDevice,
  fakeIphoneTab,
  fakePush,
  removeFakePush,
} from '@/test/push'

function aSetting(overrides: Partial<NoticeSetting> = {}): NoticeSetting {
  return {
    reachable: false,
    push: { publicKey: 'public-key', deviceOn: false },
    email: { address: null },
    ...overrides,
  }
}

const pushSaved = aSetting({
  reachable: true,
  push: { publicKey: 'public-key', deviceOn: true },
})

function emailSaved(address = 'admin@example.com') {
  return aSetting({ reachable: true, email: { address } })
}

function renderSection(saved: NoticeSetting) {
  render(
    <MemoryRouter>
      <NotifyMe saved={saved} />
    </MemoryRouter>,
  )
}

/** The On or Off button of one row. */
function choice(row: string, name: string) {
  return within(screen.getByRole('group', { name: row })).getByRole('button', {
    name,
  })
}

beforeEach(async () => {
  await applyLanguage('en')
})

afterEach(() => {
  removeFakePush()
})

const COPY = [
  {
    language: 'en' as const,
    heading: 'Notify me by',
    push: 'Push',
    on: 'On',
    off: 'Off',
    address: 'Email address',
    save: 'Save',
    none: 'No one gets a notice now. The traveler is told whom to ask instead.',
    deviceOn:
      'On for this device. Each phone or computer is turned on separately.',
    asking: 'Choose Allow on the question this device shows.',
    blocked:
      'Notifications are blocked for this app on this device. Allow them in the device settings, then choose On again.',
    install:
      'On an iPhone or iPad, add the app to the home screen first, then turn this on there.',
    addToHome: 'Add to home screen',
    unsupported:
      'This browser cannot show notices. Turn this on from another device.',
    invalid: 'Enter an email address like name@example.com',
    unconfirmed:
      'Confirm this address in Cloudflare first, then choose Save again',
    saved: 'Saved. A test email is on its way.',
    testFailed:
      'The test email did not go out, so the address was not saved. Try again later.',
  },
  {
    language: 'vi' as const,
    heading: 'Báo cho tôi qua',
    push: 'Thông báo đẩy',
    on: 'Bật',
    off: 'Tắt',
    address: 'Địa chỉ email',
    save: 'Lưu',
    none: 'Hiện không ai nhận thông báo. Người đi chỉ thấy nên nhờ ai.',
    deviceOn:
      'Đang bật trên thiết bị này. Mỗi điện thoại hay máy tính bật riêng.',
    asking: 'Chọn Cho phép ở câu hỏi máy vừa hiện.',
    blocked:
      'Máy đang chặn thông báo của ứng dụng này. Cho phép trong cài đặt của máy rồi chọn Bật lại.',
    install:
      'Trên iPhone hoặc iPad, thêm ứng dụng vào màn hình chính trước, rồi bật ở đó.',
    addToHome: 'Thêm vào màn hình chính',
    unsupported:
      'Trình duyệt này không hiện được thông báo. Hãy bật trên thiết bị khác.',
    invalid: 'Nhập địa chỉ email như name@example.com',
    unconfirmed:
      'Hãy xác nhận địa chỉ này trong Cloudflare trước, rồi bấm Lưu lại',
    saved: 'Đã lưu. Một email thử đang được gửi.',
    testFailed:
      'Chưa gửi được email thử nên địa chỉ chưa được lưu. Bạn thử lại sau nhé.',
  },
]

describe.each(COPY)('NotifyMe in $language', (copy) => {
  beforeEach(async () => {
    await applyLanguage(copy.language)
  })

  it('reads both off and says no one gets a notice', async () => {
    fakePush()

    renderSection(aSetting())

    expect(
      screen.getByRole('region', { name: copy.heading }),
    ).toBeInTheDocument()
    expect(choice(copy.push, copy.off)).toHaveAttribute('aria-pressed', 'true')
    expect(choice('Email', copy.off)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(copy.none)).toBeInTheDocument()
  })

  it('reads push on for a device turned on before', async () => {
    fakePush({ permission: 'granted', subscribed: true })

    renderSection(pushSaved)

    expect(await screen.findByText(copy.deviceOn)).toBeInTheDocument()
    expect(choice(copy.push, copy.on)).toHaveAttribute('aria-pressed', 'true')
  })

  it('says to choose Allow while the device asks', async () => {
    const user = userEvent.setup()
    fakePush()
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: () => new Promise(() => undefined),
    })
    renderSection(aSetting())

    await user.click(choice(copy.push, copy.on))

    expect(await screen.findByText(copy.asking)).toBeInTheDocument()
    expect(choice(copy.push, copy.on)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(copy.none)).toBeNull()
  })

  it('reads off and says how to unblock when the device blocks it', async () => {
    const user = userEvent.setup()
    fakePush({ answer: 'denied' })
    renderSection(aSetting())

    await user.click(choice(copy.push, copy.on))

    expect(await screen.findByRole('alert')).toHaveTextContent(copy.blocked)
    expect(choice(copy.push, copy.off)).toHaveAttribute('aria-pressed', 'true')
  })

  it('sends an iPhone tab to the home screen page', async () => {
    const user = userEvent.setup()
    fakeIphoneTab()
    renderSection(aSetting())

    await user.click(choice(copy.push, copy.on))

    expect(await screen.findByRole('alert')).toHaveTextContent(copy.install)
    expect(screen.getByRole('link', { name: copy.addToHome })).toHaveAttribute(
      'href',
      '/settings/install',
    )
  })

  it('says a browser with no push cannot show notices', async () => {
    const user = userEvent.setup()
    renderSection(aSetting())

    await user.click(choice(copy.push, copy.on))

    expect(await screen.findByRole('alert')).toHaveTextContent(copy.unsupported)
  })

  it('saves an email and says a test is on its way', async () => {
    const user = userEvent.setup()
    const { requests } = fakeApi({
      'PUT /admin/notices/email': () => json(emailSaved()),
    })
    renderSection(aSetting())

    await user.click(choice('Email', copy.on))
    await user.type(screen.getByLabelText(copy.address), 'admin@example.com')
    await user.click(screen.getByRole('button', { name: copy.save }))

    expect(await screen.findByText(copy.saved)).toBeInTheDocument()
    expect(requests.at(-1)?.body).toEqual({
      address: 'admin@example.com',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
  })

  it('says how to write an address that is not one, and sends nothing', async () => {
    const user = userEvent.setup()
    const { requests } = fakeApi({})
    renderSection(aSetting())
    await user.click(choice('Email', copy.on))
    const field = screen.getByLabelText(copy.address)

    await user.type(field, 'admin@example')
    await user.click(screen.getByRole('button', { name: copy.save }))

    expect(field).toHaveAccessibleDescription(copy.invalid)
    expect(field).toHaveFocus()
    expect(requests).toEqual([])
  })

  it('says to confirm an address Cloudflare refuses', async () => {
    const user = userEvent.setup()
    fakeApi({
      'PUT /admin/notices/email': () => failure('email_unconfirmed', 409),
    })
    renderSection(aSetting())
    await user.click(choice('Email', copy.on))
    const field = screen.getByLabelText(copy.address)

    await user.type(field, 'admin@example.com')
    await user.click(screen.getByRole('button', { name: copy.save }))

    expect(await screen.findByText(copy.unconfirmed)).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
  })

  it('says the test did not go out when sending fails', async () => {
    const user = userEvent.setup()
    fakeApi({ 'PUT /admin/notices/email': () => failure('notice_failed', 502) })
    renderSection(aSetting())
    await user.click(choice('Email', copy.on))

    await user.type(screen.getByLabelText(copy.address), 'admin@example.com')
    await user.click(screen.getByRole('button', { name: copy.save }))

    expect(await screen.findByRole('alert')).toHaveTextContent(copy.testFailed)
  })
})

describe('NotifyMe', () => {
  it('leaves out the row this copy of the app cannot send by', () => {
    renderSection(aSetting({ email: null }))

    expect(screen.getByRole('group', { name: 'Push' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Email' })).toBeNull()
  })

  it('leaves out the whole section with no way to send', () => {
    renderSection(aSetting({ push: null, email: null }))

    expect(screen.queryByRole('region', { name: 'Notify me by' })).toBeNull()
  })

  it('says nobody is unreached while another device or admin is on', () => {
    renderSection(aSetting({ reachable: true }))

    expect(screen.queryByText(/No one gets a notice/)).toBeNull()
  })

  it('asks no permission with no service worker to push to', async () => {
    const user = userEvent.setup()
    const { asked } = fakePush({ registered: false })
    renderSection(aSetting())

    await user.click(choice('Push', 'On'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This browser cannot show notices.',
    )
    expect(asked).toEqual([])
  })

  it('saves the device once the question is allowed', async () => {
    const user = userEvent.setup()
    fakePush()
    const { requests } = fakeApi({
      'PUT /admin/notices/device': () => json(pushSaved),
    })
    renderSection(aSetting())

    await user.click(choice('Push', 'On'))

    expect(await screen.findByText(/On for this device/)).toBeInTheDocument()
    expect(requests).toEqual([
      {
        method: 'PUT',
        path: '/admin/notices/device',
        body: aPushDevice(),
      },
    ])
    expect(screen.queryByText(/No one gets a notice/)).toBeNull()
  })

  it('reads off again when the device cannot be saved', async () => {
    const user = userEvent.setup()
    fakePush()
    fakeApi({ 'PUT /admin/notices/device': offline })
    renderSection(aSetting())

    await user.click(choice('Push', 'On'))

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't connect")
    expect(choice('Push', 'Off')).toHaveAttribute('aria-pressed', 'true')
  })

  it('turns push off and drops the subscription', async () => {
    const user = userEvent.setup()
    const { asked } = fakePush({ permission: 'granted', subscribed: true })
    const { requests } = fakeApi({
      'DELETE /admin/notices/device': () => json(aSetting()),
    })
    renderSection(pushSaved)
    await screen.findByText(/On for this device/)

    await user.click(choice('Push', 'Off'))

    expect(
      await screen.findByText(/No one gets a notice now/),
    ).toBeInTheDocument()
    expect(requests.map(({ method }) => method)).toEqual(['DELETE'])
    await vi.waitFor(() => expect(asked).toEqual(['unsubscribe']))
  })

  it('stays on when turning push off fails', async () => {
    const user = userEvent.setup()
    const { asked } = fakePush({ permission: 'granted', subscribed: true })
    fakeApi({
      'DELETE /admin/notices/device': () => failure('internal_error', 500),
    })
    renderSection(pushSaved)
    await screen.findByText(/On for this device/)

    await user.click(choice('Push', 'Off'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong',
    )
    expect(choice('Push', 'On')).toHaveAttribute('aria-pressed', 'true')
    expect(asked).toEqual([])
  })

  it('reads a saved email on, with its address', () => {
    renderSection(emailSaved())

    expect(choice('Email', 'On')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'admin@example.com',
    )
  })

  it('turns a saved email off', async () => {
    const user = userEvent.setup()
    const { requests } = fakeApi({
      'DELETE /admin/notices/email': () => json(aSetting()),
    })
    renderSection(emailSaved())

    await user.click(choice('Email', 'Off'))

    await vi.waitFor(() =>
      expect(screen.queryByLabelText('Email address')).toBeNull(),
    )
    expect(requests.map(({ method }) => method)).toEqual(['DELETE'])
  })

  it('closes an email never saved without a call', async () => {
    const user = userEvent.setup()
    const { requests } = fakeApi({})
    renderSection(aSetting())
    await user.click(choice('Email', 'On'))

    await user.click(choice('Email', 'Off'))

    expect(screen.queryByLabelText('Email address')).toBeNull()
    expect(requests).toEqual([])
  })

  it('clears the error as soon as the address reads right', async () => {
    const user = userEvent.setup()
    renderSection(aSetting())
    await user.click(choice('Email', 'On'))
    const field = screen.getByLabelText('Email address')
    await user.type(field, 'admin@example')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await user.type(field, '.com')

    expect(field).toHaveAttribute('aria-invalid', 'false')
  })
})
