import type { Page } from '@playwright/test'

import { FIXTURE_ACCOUNTS } from '../../scripts/seed'
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

export const CASES: CaptureCase[] = [
  { section: 'home', theme: 'default', route: '/', evidence: true },
  { section: 'home', theme: 'dark', route: '/', evidence: true, setup: dark },
  {
    section: 'shell',
    theme: 'default',
    route: '/',
    evidence: true,
    setup: asAdmin,
  },
  {
    section: 'shell',
    theme: 'dark',
    route: '/',
    evidence: true,
    setup: async (page) => {
      await dark(page)
      await asAdmin(page)
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
]
