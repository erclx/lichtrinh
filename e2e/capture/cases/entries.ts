import { DEMO_DAY } from '../../../scripts/seed'
import type { CaptureCase } from '../../capture-types'
import { atDemoInstant, lightAndDark } from '../page-setup'

export const CASES: CaptureCase[] = lightAndDark(
  'entry-add',
  `/entries/new?trip=${DEMO_DAY.tripId}&date=${DEMO_DAY.date}`,
  atDemoInstant,
)
