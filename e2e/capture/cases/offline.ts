import type { Page } from '@playwright/test'

import type { CaptureCase } from '../../capture-types'
import { atDemoInstantInTripZone, BASE_URL, lightAndDark } from '../page-setup'

// Loads the route once online at the demo instant, so the device saves the
// plan at 09:45 in the trip's zone, then cuts every API call before the
// harness loads it again. The context route reaches past the service worker.
async function offlineWithSavedPlan(page: Page, route: string) {
  await atDemoInstantInTripZone(page)
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

// Today read from the device's saved plan, as `canon/design/states/offline`.
export const CASES: CaptureCase[] = lightAndDark('offline-today', '/', (page) =>
  offlineWithSavedPlan(page, '/'),
)
