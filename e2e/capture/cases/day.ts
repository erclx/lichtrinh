import { DEMO_DAY } from '../../../scripts/seed'
import type { CaptureCase } from '../../capture-types'
import { atDemoInstant, lightAndDark, TRIP_PATH } from '../page-setup'

export const CASES: CaptureCase[] = lightAndDark(
  'day',
  `${TRIP_PATH}/days/${DEMO_DAY.date}`,
  atDemoInstant,
)
