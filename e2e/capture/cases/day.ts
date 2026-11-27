import type { Page } from '@playwright/test'

import { DEMO_DAY } from '../../../scripts/seed'
import type { CaptureCase } from '../../capture-types'
import { atDemoInstant, lightAndDark, TRIP_PATH } from '../page-setup'

const route = `${TRIP_PATH}/days/${DEMO_DAY.date}`

// Body at 23px is the iPhone's largest standard Text Size, which the root
// stands in for here, so the 320 reflow check fails on a sideways scroll or
// a clipped control at the size the traveler can reach without the
// accessibility sizes.
async function atLargestText(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = 'html { font-size: 23px !important }'
      document.head.append(style)
    })
  })
  await atDemoInstant(page)
}

export const CASES: CaptureCase[] = [
  ...lightAndDark('day', route, atDemoInstant),
  {
    section: 'day-largest-text',
    theme: 'default',
    route,
    evidence: true,
    setup: atLargestText,
  },
]
