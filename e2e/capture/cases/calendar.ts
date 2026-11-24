import { DEMO_DAY } from '../../../scripts/seed'
import type { CaptureCase } from '../../capture-types'
import { atDemoInstantInTripZone, lightAndDark } from '../page-setup'

/** One view of the Calendar tab over the seeded trips. */
function viewCases(view: 'month' | 'week' | 'day'): CaptureCase[] {
  return lightAndDark(
    `calendar-${view}`,
    `/calendar?view=${view}&date=${DEMO_DAY.date}`,
    atDemoInstantInTripZone,
  )
}

export const CASES: CaptureCase[] = [
  ...viewCases('month'),
  ...viewCases('week'),
  ...viewCases('day'),
]
