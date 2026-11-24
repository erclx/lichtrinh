import type { Page } from '@playwright/test'

import { DEMO_DAY, DEMO_INSTANT, FIXTURE_ACCOUNTS } from '../../scripts/seed'
import type { CaptureCase } from '../capture-types'

export const BASE_URL =
  process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:4173'

export const TRIP_PATH = `/trips/${DEMO_DAY.tripId}`

/** A route's evidence frames, light and dark, `setup` running before the load. */
export function lightAndDark(
  section: string,
  route: string,
  setup?: (page: Page) => Promise<void>,
): CaptureCase[] {
  return [
    { section, theme: 'default', route, evidence: true, setup },
    {
      section,
      theme: 'dark',
      route,
      evidence: true,
      setup: async (page) => {
        await page.emulateMedia({ colorScheme: 'dark' })
        await setup?.(page)
      },
    },
  ]
}

// Signs in as the seeded admin before the page loads. The request shares the
// page's cookie jar, so the load that follows opens signed in.
export async function asAdmin(page: Page) {
  const admin = FIXTURE_ACCOUNTS.find(({ role }) => role === 'admin')
  if (admin === undefined) throw new Error('The seed holds no admin')
  const response = await page.request.post(`${BASE_URL}/api/auth/sign-in`, {
    data: { username: admin.username, password: admin.password },
  })
  if (!response.ok()) {
    throw new Error(`Sign-in for the capture failed with ${response.status()}`)
  }
}

// Signs in as the seeded traveler, the one account that can chat, and opens
// in English like every other frame, since the traveler's own is Vietnamese.
export async function asTraveler(page: Page) {
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

// The preview carries no bridge, so the status read is answered here instead,
// at a fixed time of day so the frame holds still between runs.
export async function assistantOnline(page: Page) {
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

// Pins the date inside the demo day's flower market, so every countdown holds
// still between runs. Timers keep real time, so the page still loads.
export async function atDemoInstant(page: Page) {
  await page.clock.setFixedTime(new Date(DEMO_INSTANT))
  await flowTabs(page)
  await asAdmin(page)
}

// For a page that reads the device's own clock or prints when a thing was set.
export async function atDemoInstantInTripZone(page: Page) {
  await inTripZone(page)
  await atDemoInstant(page)
}

// A full-page frame draws the phone tab bar over the middle of a long page,
// so it flows to the page's end as it reads at the bottom of a scroll.
async function flowTabs(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = 'nav.sticky.bottom-0 { position: static !important }'
      document.head.append(style)
    })
  })
}

// The chat pages pin the composer and the Talk bar to the window's foot too,
// so every pinned part flows as `flowTabs` flows the tabs.
export async function flowSticky(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '.sticky { position: static !important }'
      document.head.append(style)
    })
  })
}

// Films in the invented trip's zone, so times read the same on every machine.
// The harness runs Chromium, which takes the override through its protocol.
export async function inTripZone(page: Page) {
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setTimezoneOverride', {
    timezoneId: 'Asia/Ho_Chi_Minh',
  })
}
