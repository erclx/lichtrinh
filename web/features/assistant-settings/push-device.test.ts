import {
  readPushAnswer,
  subscribeDevice,
  unsubscribeDevice,
} from '@/features/assistant-settings/push-device'
import {
  aPushDevice,
  fakeIphoneTab,
  fakePush,
  removeFakePush,
} from '@/test/push'

afterEach(() => {
  removeFakePush()
})

describe('readPushAnswer', () => {
  it('reads on with a saved device, the permission, and a subscription', async () => {
    fakePush({ permission: 'granted', subscribed: true })

    expect(await readPushAnswer(true)).toBe('on')
  })

  it('reads off on a phone that signed in again', async () => {
    fakePush({ permission: 'granted', subscribed: true })

    expect(await readPushAnswer(false)).toBe('off')
  })

  it('reads off once the browser dropped the subscription', async () => {
    fakePush({ permission: 'granted', subscribed: false })

    expect(await readPushAnswer(true)).toBe('off')
  })

  it('reads blocked once the device blocked the app', async () => {
    fakePush({ permission: 'denied', subscribed: true })

    expect(await readPushAnswer(true)).toBe('blocked')
  })

  it('reads install in an iPhone tab', async () => {
    fakeIphoneTab()

    expect(await readPushAnswer(false)).toBe('install')
  })

  it('reads unsupported in a browser with no push', async () => {
    expect(await readPushAnswer(false)).toBe('unsupported')
  })

  it('reads unsupported with no service worker, as on the dev server', async () => {
    fakePush({ permission: 'granted', registered: false })

    expect(await readPushAnswer(true)).toBe('unsupported')
  })
})

describe('subscribeDevice', () => {
  it('asks, then subscribes under the key of this copy', async () => {
    const { asked } = fakePush()

    expect(await subscribeDevice('public-key')).toEqual(aPushDevice())
    expect(asked).toEqual(['permission', 'subscribe public-key'])
  })

  it('drops a subscription made under an older key first', async () => {
    const { asked } = fakePush({ subscribed: true })

    await subscribeDevice('public-key')

    expect(asked).toEqual(['permission', 'unsubscribe', 'subscribe public-key'])
  })

  it('answers blocked when the question is refused', async () => {
    fakePush({ answer: 'denied' })

    expect(await subscribeDevice('public-key')).toBe('blocked')
  })

  it('answers off when the question is dismissed', async () => {
    fakePush({ answer: 'default' })

    expect(await subscribeDevice('public-key')).toBe('off')
  })

  it('asks nothing in an iPhone tab', async () => {
    fakeIphoneTab()

    expect(await subscribeDevice('public-key')).toBe('install')
  })
})

describe('unsubscribeDevice', () => {
  it('drops the subscription the browser holds', async () => {
    const { asked } = fakePush({ permission: 'granted', subscribed: true })

    await unsubscribeDevice()

    expect(asked).toEqual(['unsubscribe'])
  })

  it('does nothing in a browser with no push', async () => {
    await expect(unsubscribeDevice()).resolves.toBeUndefined()
  })
})
