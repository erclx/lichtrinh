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
  await asAdmin(page)
}

const tripPath = `/trips/${DEMO_DAY.tripId}`

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
]
