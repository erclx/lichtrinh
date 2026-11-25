import type { Page } from '@playwright/test'

import type { CaptureCase } from '../../capture-types'
import { atDemoInstant, lightAndDark } from '../page-setup'

const INSTALL_PATH = '/settings/install'

// The state cases reflow as the steps do, so one width shows each.
const PHONE_ONLY = { excludeViewports: ['768', '1280', '1536'] }

async function inVietnamese(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem('lichtrinh.language', 'vi'),
  )
  await atDemoInstant(page)
}

// The browser decides on its own when to offer, so the page is handed one.
async function offered(page: Page) {
  await page.addInitScript(() => {
    window.addEventListener('load', () => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      window.dispatchEvent(
        Object.assign(event, { prompt: () => Promise.resolve() }),
      )
    })
  })
  await atDemoInstant(page)
}

async function installed(page: Page) {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'standalone', { value: true }),
  )
  await atDemoInstant(page)
}

function phoneOnly(captureCase: CaptureCase): CaptureCase {
  return { ...captureCase, ...PHONE_ONLY }
}

export const CASES: CaptureCase[] = [
  ...lightAndDark('install', INSTALL_PATH, atDemoInstant),
  ...lightAndDark('install-vi', INSTALL_PATH, inVietnamese).map(phoneOnly),
  ...lightAndDark('install-offered', INSTALL_PATH, offered).map(phoneOnly),
  ...lightAndDark('install-done', INSTALL_PATH, installed).map(phoneOnly),
]
