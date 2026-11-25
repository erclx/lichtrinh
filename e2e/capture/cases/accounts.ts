import type { Page } from '@playwright/test'

import type { CaptureCase } from '../../capture-types'
import { asAdmin, atDemoInstant, lightAndDark } from '../page-setup'

// The section stacks the same at every width, so one shows each state.
const PHONE_ONLY = { excludeViewports: ['768', '1280', '1536'] }

type BackupAnswer = 'saved' | 'failed' | 'held'

// The harness has no hook after the load, so the page answers its own
// download and presses the button itself. The file's date is pinned, since
// the saved line shows it.
async function downloaded(page: Page, answer: BackupAnswer) {
  await page.addInitScript((answer) => {
    const realFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (!url.endsWith('/api/admin/backup')) return realFetch(input, init)
      if (answer === 'held') return new Promise<Response>(() => undefined)
      if (answer === 'failed') {
        return Promise.reject(new TypeError('Failed to fetch'))
      }
      return Promise.resolve(
        Response.json({
          format: 'lichtrinh-backup',
          formatVersion: 1,
          exportedAt: '2031-05-15T02:45:00.000Z',
          trips: [],
        }),
      )
    }
    const timer = setInterval(() => {
      const button = [...document.querySelectorAll('button')].find(
        ({ innerText }) => innerText.includes('Download backup'),
      )
      if (button === undefined) return
      clearInterval(timer)
      button.click()
    }, 50)
  }, answer)
  await atDemoInstant(page)
}

async function inVietnamese(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem('lichtrinh.language', 'vi'),
  )
  await atDemoInstant(page)
}

function phoneCases(
  section: string,
  setup: (page: Page) => Promise<void>,
): CaptureCase[] {
  return lightAndDark(section, '/admin/accounts', setup).map((one) => ({
    ...one,
    ...PHONE_ONLY,
  }))
}

export const CASES: CaptureCase[] = [
  ...lightAndDark('accounts', '/admin/accounts', atDemoInstant),
  ...phoneCases('accounts-vi', inVietnamese),
  ...phoneCases('accounts-backup-saved', (page) => downloaded(page, 'saved')),
  ...phoneCases('accounts-backup-failed', (page) => downloaded(page, 'failed')),
  ...phoneCases('accounts-backup-held', (page) => downloaded(page, 'held')),
  ...lightAndDark('accounts-new', '/admin/accounts/new', asAdmin),
  ...lightAndDark('accounts-edit', '/admin/accounts/fixture-traveler', asAdmin),
  {
    section: 'accounts-edit-own',
    theme: 'default',
    route: '/admin/accounts/fixture-admin',
    evidence: true,
    setup: asAdmin,
  },
]
