import type { CaptureCase } from '../../capture-types'
import { atDemoInstantInTripZone, lightAndDark, TRIP_PATH } from '../page-setup'

export const CASES: CaptureCase[] = lightAndDark(
  'budget',
  `${TRIP_PATH}/budget`,
  atDemoInstantInTripZone,
)
