import type { Page } from '@playwright/test'

import { FIXTURE_RATES } from '../../../scripts/seed'
import type { CaptureCase } from '../../capture-types'
import { atDemoInstantInTripZone, BASE_URL, lightAndDark } from '../page-setup'

// Loads the route once online at the demo instant, so the device saves the
// plan at 09:45 in the trip's zone, then cuts every API call before the
// harness loads it again. The context route reaches past the service worker.
async function offlineWithSavedPlan(page: Page, route: string) {
  await atDemoInstantInTripZone(page)
  await page.goto(`${BASE_URL}${route}`)
  await page.waitForFunction(
    (saved) => {
      const plan = localStorage.getItem('lichtrinh.calendarCache') ?? ''
      return saved.every((part) => plan.includes(part))
    },
    // The entries and the rate save apart, and the total needs both.
    ['Sunset boat trip', `"rate":"${FIXTURE_RATES[0].rate}"`],
    { timeout: 10_000 },
  )
  await page
    .context()
    .route('**/api/**', (request) => request.abort('internetdisconnected'))
}

// Today read from the device's saved plan, as `canon/design/states/offline`.
export const CASES: CaptureCase[] = lightAndDark('offline-today', '/', (page) =>
  offlineWithSavedPlan(page, '/'),
)
