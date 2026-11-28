import type { Page } from '@playwright/test'

import type { CaptureCase } from '../../capture-types'
import { atDemoInstant, lightAndDark, TRIP_PATH } from '../page-setup'

// The layout chosen on this device before the load, against each width's default.
function withLayout(layout: 'grid' | 'list') {
  return async (page: Page) => {
    await page.addInitScript(
      (choice) => localStorage.setItem('lichtrinh.trips-layout', choice),
      layout,
    )
    await atDemoInstant(page)
  }
}

export const CASES: CaptureCase[] = [
  ...lightAndDark('trips', '/trips', atDemoInstant),
  ...lightAndDark('trips-grid', '/trips', withLayout('grid')),
  ...lightAndDark('trips-list', '/trips', withLayout('list')),
  ...lightAndDark('trip-overview', TRIP_PATH, atDemoInstant),
]
