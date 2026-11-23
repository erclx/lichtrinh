import type { Page } from '@playwright/test'

import { DEMO_DAY, DEMO_INSTANT, FIXTURE_ACCOUNTS } from '../../scripts/seed'
import type { CaptureCase } from '../capture-types'

/** Where a case flagged `evidence: true` writes its committed frames. */
export const EVIDENCE_ROOT = 'e2e/evidence'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:4173'

async function dark(page: Page) {
  await page.emulateMedia({ colorScheme: 'dark' })
}

// Signs in as the seeded admin before the page loads. The request shares the
// page's cookie jar, so the load that follows opens signed in.
async function asAdmin(page: Page) {
  const admin = FIXTURE_ACCOUNTS.find(({ role }) => role === 'admin')
  if (admin === undefined) throw new Error('The seed holds no admin')
  const response = await page.request.post(`${BASE_URL}/api/auth/sign-in`, {
    data: { username: admin.username, password: admin.password },
  })
  if (!response.ok()) {
    throw new Error(`Sign-in for the capture failed with ${response.status()}`)
  }
}

// The preview carries no bridge secret, so no socket can bring the workspace
// PC online. The status read is answered here instead, at a fixed time of day
// so the frame holds still between runs.
async function assistantOnline(page: Page) {
  const answeredAt = new Date()
  answeredAt.setHours(10, 14, 0, 0)
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({
      json: {
        online: true,
        lastAnsweredAt: answeredAt.toISOString(),
        model: 'lichtrinh-assistant',
      },
    }),
  )
}

// Pins the date inside the demo day's flower market, so Today, the now card,
// and every trip's countdown read the same on every run. Timers keep real
// time, so the page still loads and refreshes.
async function atDemoInstant(page: Page) {
  await page.clock.setFixedTime(new Date(DEMO_INSTANT))
  await flowTabs(page)
  await asAdmin(page)
}

// A full-page frame draws the phone tab bar where the window ends, over the
// middle of a long page, so it flows to the page's end as it reads at the
// bottom of a scroll.
async function flowTabs(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = 'nav.sticky.bottom-0 { position: static !important }'
      document.head.append(style)
    })
  })
}

const tripPath = `/trips/${DEMO_DAY.tripId}`

// Signs in as the seeded traveler, the one account that can chat, and opens
// in English like every other frame, since the traveler's own is Vietnamese.
async function asTraveler(page: Page) {
  const traveler = FIXTURE_ACCOUNTS.find(({ canChat }) => canChat)
  if (traveler === undefined) throw new Error('The seed holds no traveler')
  await page.addInitScript(() =>
    localStorage.setItem('lichtrinh.language', 'en'),
  )
  const response = await page.request.post(`${BASE_URL}/api/auth/sign-in`, {
    data: { username: traveler.username, password: traveler.password },
  })
  if (!response.ok()) {
    throw new Error(`Sign-in for the capture failed with ${response.status()}`)
  }
}

// The chat pages pin the composer and the Talk bar to the window's foot as
// well as the tabs, so a full-page frame flows every pinned part to where
// it reads at the bottom of a scroll, as `flowTabs` does for the tabs.
async function flowSticky(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '.sticky { position: static !important }'
      document.head.append(style)
    })
  })
}

// Films in the invented trip's zone rather than the machine's, so the chat
// list's times read the same on every machine. The harness runs Chromium,
// which takes the override through its protocol.
async function inTripZone(page: Page) {
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setTimezoneOverride', {
    timezoneId: 'Asia/Ho_Chi_Minh',
  })
}

/**
 * A chat route as the traveler at the demo instant, light and dark. `online`
 * answers the status read, since the preview has no bridge, and left off it
 * films the offline card.
 */
function chatCases(
  section: string,
  route: string,
  online: boolean,
): CaptureCase[] {
  const setup = async (page: Page) => {
    await inTripZone(page)
    await page.clock.setFixedTime(new Date(DEMO_INSTANT))
    await flowSticky(page)
    if (online) await assistantOnline(page)
    await asTraveler(page)
  }
  return [
    { section, theme: 'default', route, evidence: true, setup },
    {
      section,
      theme: 'dark',
      route,
      evidence: true,
      setup: async (page) => {
        await dark(page)
        await setup(page)
      },
    },
  ]
}

interface TalkScript {
  /** Whether the status read says the voice server answers. */
  voice: boolean
  /** The buttons pressed once the composer shows, in order. */
  presses: readonly ('Talk' | 'Stop and write it down')[]
  /** The clip's words, or null to hold the clip at transcribing. */
  words: string | null
}

const TALK_CHAT = '/chats/fixture-chat-today'

// The harness has no microphone and no hook after the load, so the page
// gets a tone for a microphone, answers its own clip, and presses the mic
// itself. The thread reads empty, as the talk frames draw it.
async function talkScript(page: Page, script: TalkScript) {
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({
      json: {
        online: true,
        lastAnsweredAt: null,
        model: 'lichtrinh-assistant',
        voice: { online: script.voice, model: 'qwen3-asr-1.7b' },
      },
    }),
  )
  await page.route(`**/api${TALK_CHAT}`, async (route) => {
    const response = await route.fetch()
    const thread = (await response.json()) as Record<string, unknown>
    await route.fulfill({ response, json: { ...thread, messages: [] } })
  })
  await page.addInitScript(({ presses, words }) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext()
      const tone = context.createOscillator()
      const out = context.createMediaStreamDestination()
      tone.connect(out)
      tone.start()
      return out.stream
    }
    const realFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes('/api/voice/transcriptions/')) {
        if (words === null) return new Promise<Response>(() => undefined)
        const id = url.split('/').pop() ?? ''
        return Promise.resolve(
          Response.json({
            id,
            text: words,
            model: 'qwen3-asr-1.7b',
            audioMs: 2100,
            ms: 900,
          }),
        )
      }
      if (url.endsWith('/api/assistant/warm')) {
        return Promise.resolve(new Response(null, { status: 202 }))
      }
      return realFetch(input, init)
    }
    const queue = [...presses]
    const timer = setInterval(() => {
      const label = queue[0]
      if (label === undefined) {
        clearInterval(timer)
        return
      }
      const button = document.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      )
      if (button === null) return
      queue.shift()
      button.click()
    }, 50)
  }, script)
}

/** One talk state on the chat page as the traveler, light and dark. */
function talkCases(section: string, script: TalkScript): CaptureCase[] {
  const setup = async (page: Page) => {
    await inTripZone(page)
    await page.clock.setFixedTime(new Date(DEMO_INSTANT))
    await flowSticky(page)
    await talkScript(page, script)
    await asTraveler(page)
  }
  return [
    { section, theme: 'default', route: TALK_CHAT, evidence: true, setup },
    {
      section,
      theme: 'dark',
      route: TALK_CHAT,
      evidence: true,
      setup: async (page) => {
        await dark(page)
        await setup(page)
      },
    },
  ]
}

const STOP = 'Stop and write it down'

/** A calendar route as the admin at the demo instant, light and dark. */
function calendarCases(section: string, route: string): CaptureCase[] {
  return [
    { section, theme: 'default', route, evidence: true, setup: atDemoInstant },
    {
      section,
      theme: 'dark',
      route,
      evidence: true,
      setup: async (page) => {
        await dark(page)
        await atDemoInstant(page)
      },
    },
  ]
}

/**
 * A budget route as the admin at the demo instant in the invented trip's
 * zone, so the rates page's set date reads the same on every machine.
 */
function budgetCases(section: string, route: string): CaptureCase[] {
  const setup = async (page: Page) => {
    await inTripZone(page)
    await atDemoInstant(page)
  }
  return [
    { section, theme: 'default', route, evidence: true, setup },
    {
      section,
      theme: 'dark',
      route,
      evidence: true,
      setup: async (page) => {
        await dark(page)
        await setup(page)
      },
    },
  ]
}

/**
 * A Calendar tab route as the admin at the demo instant, light and dark, in
 * the invented trip's zone, since the unfiltered month takes today from the
 * device's clock rather than a trip's.
 */
function calendarViewCases(section: string, route: string): CaptureCase[] {
  const setup = async (page: Page) => {
    await inTripZone(page)
    await atDemoInstant(page)
  }
  return [
    { section, theme: 'default', route, evidence: true, setup },
    {
      section,
      theme: 'dark',
      route,
      evidence: true,
      setup: async (page) => {
        await dark(page)
        await setup(page)
      },
    },
  ]
}

// Loads the route once online at the demo instant, so the device saves the
// plan at 09:45 in the trip's zone, then cuts every API call before the
// harness loads it again. The context route reaches past the service worker.
async function offlineWithSavedPlan(page: Page, route: string) {
  await inTripZone(page)
  await atDemoInstant(page)
  await page.goto(`${BASE_URL}${route}`)
  await page.waitForFunction(() =>
    (localStorage.getItem('lichtrinh.calendarCache') ?? '').includes(
      'Sunset boat trip',
    ),
  )
  await page
    .context()
    .route('**/api/**', (request) => request.abort('internetdisconnected'))
}

/** A calendar route read offline from the saved plan, light and dark. */
function offlineCases(section: string, route: string): CaptureCase[] {
  return [
    {
      section,
      theme: 'default',
      route,
      evidence: true,
      setup: (page) => offlineWithSavedPlan(page, route),
    },
    {
      section,
      theme: 'dark',
      route,
      evidence: true,
      setup: async (page) => {
        await dark(page)
        await offlineWithSavedPlan(page, route)
      },
    },
  ]
}

export const CASES: CaptureCase[] = [
  { section: 'home', theme: 'default', route: '/', evidence: true },
  { section: 'home', theme: 'dark', route: '/', evidence: true, setup: dark },
  {
    section: 'shell',
    theme: 'default',
    route: '/',
    evidence: true,
    // Today opens on the seeded trips, so the shell pins the date too.
    setup: atDemoInstant,
  },
  {
    section: 'shell',
    theme: 'dark',
    route: '/',
    evidence: true,
    setup: async (page) => {
      await dark(page)
      await atDemoInstant(page)
    },
  },
  {
    section: 'accounts',
    theme: 'default',
    route: '/admin/accounts',
    evidence: true,
    setup: asAdmin,
  },
  {
    section: 'accounts',
    theme: 'dark',
    route: '/admin/accounts',
    evidence: true,
    setup: async (page) => {
      await dark(page)
      await asAdmin(page)
    },
  },
  {
    section: 'accounts-new',
    theme: 'default',
    route: '/admin/accounts/new',
    evidence: true,
    setup: asAdmin,
  },
  {
    section: 'accounts-new',
    theme: 'dark',
    route: '/admin/accounts/new',
    evidence: true,
    setup: async (page) => {
      await dark(page)
      await asAdmin(page)
    },
  },
  {
    section: 'accounts-edit',
    theme: 'default',
    route: '/admin/accounts/fixture-traveler',
    evidence: true,
    setup: asAdmin,
  },
  {
    section: 'accounts-edit',
    theme: 'dark',
    route: '/admin/accounts/fixture-traveler',
    evidence: true,
    setup: async (page) => {
      await dark(page)
      await asAdmin(page)
    },
  },
  {
    section: 'accounts-edit-own',
    theme: 'default',
    route: '/admin/accounts/fixture-admin',
    evidence: true,
    setup: asAdmin,
  },
  {
    section: 'settings',
    theme: 'default',
    route: '/settings',
    evidence: true,
    setup: asAdmin,
  },
  {
    section: 'settings',
    theme: 'dark',
    route: '/settings',
    evidence: true,
    setup: async (page) => {
      await dark(page)
      await asAdmin(page)
    },
  },
  {
    section: 'assistant',
    theme: 'default',
    route: '/admin/assistant',
    evidence: true,
    setup: async (page) => {
      await assistantOnline(page)
      await asAdmin(page)
    },
  },
  {
    section: 'assistant',
    theme: 'dark',
    route: '/admin/assistant',
    evidence: true,
    setup: async (page) => {
      await dark(page)
      await assistantOnline(page)
      await asAdmin(page)
    },
  },
  {
    section: 'assistant-offline',
    theme: 'default',
    route: '/admin/assistant',
    evidence: true,
    setup: asAdmin,
  },
  {
    section: 'assistant-offline',
    theme: 'dark',
    route: '/admin/assistant',
    evidence: true,
    setup: async (page) => {
      await dark(page)
      await asAdmin(page)
    },
  },
  ...calendarCases('trips', '/trips'),
  ...calendarCases('trip-overview', tripPath),
  ...calendarCases('day', `${tripPath}/days/${DEMO_DAY.date}`),
  ...calendarCases(
    'entry-add',
    `/entries/new?trip=${DEMO_DAY.tripId}&date=${DEMO_DAY.date}`,
  ),
  // The dock beside Today from 1024 wide, and the Talk bar below that.
  ...chatCases('chat-today', '/', true),
  ...chatCases('chat-list', '/chats', true),
  ...chatCases('chat-thread', '/chats/fixture-chat-today', true),
  ...chatCases('chat-offline', '/chats/fixture-chat-today', false),
  ...chatCases('chat-failed', '/chats/fixture-chat-dinner', true),
  ...budgetCases('budget', `${tripPath}/budget`),
  ...budgetCases('rates', '/admin/rates'),
  // The Calendar tab's three views over the seeded trips.
  ...calendarViewCases(
    'calendar-month',
    `/calendar?view=month&date=${DEMO_DAY.date}`,
  ),
  ...calendarViewCases(
    'calendar-week',
    `/calendar?view=week&date=${DEMO_DAY.date}`,
  ),
  ...calendarViewCases(
    'calendar-day',
    `/calendar?view=day&date=${DEMO_DAY.date}`,
  ),
  // Today read from the device's saved plan, as `canon/design/states/offline`.
  ...offlineCases('offline-today', '/'),
  // The talk states, each reached by the page pressing the mic itself.
  ...talkCases('talk-ready', { voice: true, presses: [], words: null }),
  ...talkCases('talk-listening', {
    voice: true,
    presses: ['Talk'],
    words: null,
  }),
  ...talkCases('talk-transcribing', {
    voice: true,
    presses: ['Talk', STOP],
    words: null,
  }),
  ...talkCases('talk-review', {
    voice: true,
    presses: ['Talk', STOP],
    words: 'doi an toi sang 8 gio',
  }),
  ...talkCases('talk-retry', {
    voice: true,
    presses: ['Talk', STOP],
    words: '',
  }),
  ...talkCases('talk-voice-off', { voice: false, presses: [], words: null }),
]
