import type { Page } from '@playwright/test'
import type { NoticeKind, NoticeSetting } from '@shared/notices.ts'

import { DEMO_INSTANT } from '../../../scripts/seed'
import type { CaptureCase } from '../../capture-types'
import {
  asAdmin,
  assistantOnline,
  asTraveler,
  flowSticky,
  inTripZone,
  lightAndDark,
} from '../page-setup'

const CHAT = '/chats/fixture-chat-today'

// Five minutes before the demo instant, so the line reads 09:40.
const SENT_AT = new Date(Date.parse(DEMO_INSTANT) - 5 * 60_000).toISOString()

interface CardScript {
  kind: NoticeKind
  /** Who sent the outage's notice, or left out with none sent. */
  sentBy?: 'me' | 'someone'
  /** Presses Notify, answered by a failure or never. */
  press?: 'fails' | 'waits'
  /** Reads as an admin who chats, which no seeded account is. */
  admin?: boolean
}

// The preview holds no bridge, no keys, and no sender, so each state is
// answered here, and nothing is ever sent.
async function cardScript(page: Page, script: CardScript) {
  const { kind, sentBy, press, admin = false } = script
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({
      json: {
        online: kind === 'voice',
        lastAnsweredAt: null,
        model: 'lichtrinh-assistant',
        voice: { online: false, model: 'qwen3-asr-1.7b' },
      },
    }),
  )
  await page.route('**/api/assistant/warm', (route) =>
    route.fulfill({ status: 202 }),
  )
  await page.route('**/api/notices', async (route) => {
    if (route.request().method() === 'POST') {
      // Held for good, so the frame stays on the sending line.
      if (press === 'waits') return
      await route.fulfill({
        status: 502,
        json: { error: { code: 'notice_failed', message: 'No notice' } },
      })
      return
    }
    const sent =
      sentBy === undefined
        ? null
        : { sentAt: SENT_AT, byName: 'Người nhà', byMe: sentBy === 'me' }
    await route.fulfill({
      json: { reachable: true, assistant: null, voice: null, [kind]: sent },
    })
  })
  if (admin) {
    await page.route('**/api/auth/me', async (route) => {
      const response = await route.fetch()
      const me = (await response.json()) as Record<string, unknown>
      await route.fulfill({ response, json: { ...me, role: 'admin' } })
    })
  }
  if (press !== undefined) await pressOnce(page, 'Notify the admin')
}

// The harness has no hook after the load, so the page presses by itself.
async function pressOnce(page: Page, ...labels: string[]) {
  await page.addInitScript((queue) => {
    const timer = setInterval(() => {
      const label = queue[0]
      if (label === undefined) {
        clearInterval(timer)
        return
      }
      for (const button of document.querySelectorAll('button')) {
        if (button.innerText.trim() !== label) continue
        queue.shift()
        button.click()
        return
      }
    }, 50)
  }, labels)
}

function cardCases(section: string, script: CardScript): CaptureCase[] {
  return lightAndDark(section, CHAT, async (page) => {
    await inTripZone(page)
    await page.clock.setFixedTime(new Date(DEMO_INSTANT))
    await flowSticky(page)
    await cardScript(page, script)
    await asTraveler(page)
  })
}

interface SettingScript {
  setting: NoticeSetting
  /** How this device answers, as a browser that holds a subscription or not. */
  device?: 'on' | 'asks' | 'blocks' | 'iphone'
  /** Turns the row's On, after the page shows it. */
  turnOn?: 'Push' | 'Email'
  /** Types an address and saves it, answered as `refuses` says. */
  saves?: { address: string; refuses?: boolean }
}

const nothing: NoticeSetting = {
  reachable: false,
  push: { publicKey: 'invented', deviceOn: false },
  email: { address: null },
}

const pushOn: NoticeSetting = {
  ...nothing,
  reachable: true,
  push: { publicKey: 'invented', deviceOn: true },
}

const bothOn: NoticeSetting = {
  ...pushOn,
  email: { address: 'admin@example.com' },
}

async function settingScript(page: Page, script: SettingScript) {
  const { setting, device = 'asks', turnOn, saves } = script
  await page.route('**/api/admin/notices', (route) =>
    route.fulfill({ json: setting }),
  )
  await page.route('**/api/admin/notices/email', (route) =>
    saves?.refuses === true
      ? route.fulfill({
          status: 409,
          json: { error: { code: 'email_unconfirmed', message: 'Confirm' } },
        })
      : route.fulfill({ json: bothOn }),
  )
  await page.addInitScript((answers) => {
    const worker = { getRegistration: async () => registration }
    const registration = {
      pushManager: {
        getSubscription: async () => (answers === 'on' ? {} : null),
      },
    }
    Object.defineProperty(navigator, 'serviceWorker', { value: worker })
    Object.defineProperty(window, 'Notification', {
      value: {
        permission: answers === 'on' ? 'granted' : 'default',
        requestPermission: () =>
          answers === 'blocks'
            ? Promise.resolve('denied')
            : new Promise(() => undefined),
      },
    })
    if (answers === 'iphone') {
      Reflect.deleteProperty(window, 'PushManager')
      Object.defineProperty(navigator, 'standalone', { value: false })
    }
  }, device)
  await page.addInitScript(
    ({ row, typed }) => {
      let turned = row === undefined
      let saved = typed === undefined
      const timer = setInterval(() => {
        if (!turned) {
          for (const group of document.querySelectorAll('[role="group"]')) {
            const label = document.getElementById(
              group.getAttribute('aria-labelledby') ?? '',
            )
            if (label?.innerText.trim() !== row) continue
            group.querySelector('button')?.click()
            turned = true
          }
          return
        }
        if (!saved) {
          const field = document.querySelector<HTMLInputElement>(
            'input[type="email"]',
          )
          if (field === null) return
          // React reads a value set through the prototype's own setter.
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
          )?.set?.call(field, typed)
          field.dispatchEvent(new Event('input', { bubbles: true }))
          field.form?.requestSubmit()
          saved = true
          return
        }
        clearInterval(timer)
      }, 50)
    },
    { row: turnOn, typed: saves?.address },
  )
}

function settingCases(section: string, script: SettingScript): CaptureCase[] {
  return lightAndDark(section, '/admin/assistant', async (page) => {
    await assistantOnline(page)
    await settingScript(page, script)
    await asAdmin(page)
  })
}

// The browser says it has no network, while the preview answers, so a plan
// and a chat already on screen read as they do when the network drops.
function noNetworkCases(
  section: string,
  route: string,
  chatClosed: boolean,
): CaptureCase[] {
  return lightAndDark(section, route, async (page) => {
    await inTripZone(page)
    await page.clock.setFixedTime(new Date(DEMO_INSTANT))
    await flowSticky(page)
    await page.addInitScript((closed) => {
      Object.defineProperty(navigator, 'onLine', { get: () => false })
      if (closed) localStorage.setItem('lichtrinh.chatClosed', 'true')
    }, chatClosed)
    await assistantOnline(page)
    await asTraveler(page)
  })
}

// A state that only swaps a line reads the same at every width.
function onPhone(cases: CaptureCase[]): CaptureCase[] {
  return cases.map((one) => ({
    ...one,
    excludeViewports: ['768', '1280', '1536'],
  }))
}

export const CASES: CaptureCase[] = [
  ...cardCases('notify-ready', { kind: 'assistant' }),
  ...onPhone(
    cardCases('notify-sending', { kind: 'assistant', press: 'waits' }),
  ),
  ...cardCases('notify-sent', { kind: 'assistant', sentBy: 'me' }),
  ...cardCases('notify-failed', { kind: 'assistant', press: 'fails' }),
  ...onPhone(
    cardCases('notify-told', { kind: 'assistant', sentBy: 'someone' }),
  ),
  ...onPhone(
    cardCases('notify-own-account', { kind: 'assistant', admin: true }),
  ),
  ...cardCases('notify-voice-ready', { kind: 'voice' }),
  ...onPhone(cardCases('notify-voice-sent', { kind: 'voice', sentBy: 'me' })),
  ...onPhone(
    cardCases('notify-voice-own-account', { kind: 'voice', admin: true }),
  ),
  ...settingCases('notify-me-none', { setting: nothing }),
  ...onPhone(
    settingCases('notify-me-asking', {
      setting: nothing,
      turnOn: 'Push',
    }),
  ),
  ...onPhone(settingCases('notify-me-push', { setting: pushOn, device: 'on' })),
  ...onPhone(
    settingCases('notify-me-blocked', {
      setting: nothing,
      device: 'blocks',
      turnOn: 'Push',
    }),
  ),
  ...onPhone(
    settingCases('notify-me-install', {
      setting: nothing,
      device: 'iphone',
      turnOn: 'Push',
    }),
  ),
  ...settingCases('notify-me-both', {
    setting: pushOn,
    device: 'on',
    turnOn: 'Email',
    saves: { address: 'admin@example.com' },
  }),
  ...onPhone(
    settingCases('notify-me-email-bad', {
      setting: nothing,
      turnOn: 'Email',
      saves: { address: 'admin@example' },
    }),
  ),
  ...onPhone(
    settingCases('notify-me-email-unconfirmed', {
      setting: nothing,
      turnOn: 'Email',
      saves: { address: 'admin@example.com', refuses: true },
    }),
  ),
  ...noNetworkCases('offline-talk', '/', true),
  ...noNetworkCases('offline-chat', CHAT, false),
]
