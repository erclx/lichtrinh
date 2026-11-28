import type { CaptureCase } from '../../capture-types'
import { atDemoInstantInTripZone, lightAndDark, TRIP_PATH } from '../page-setup'

export const CASES: CaptureCase[] = [
  ...lightAndDark('budget', `${TRIP_PATH}/budget`, atDemoInstantInTripZone),
  // The bars view, chosen on this device before the load.
  ...lightAndDark('budget-bars', `${TRIP_PATH}/budget`, async (page) => {
    await page.addInitScript(() =>
      localStorage.setItem('lichtrinh.budget-chart', 'bars'),
    )
    await atDemoInstantInTripZone(page)
  }),
]
