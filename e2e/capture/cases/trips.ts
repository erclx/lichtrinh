import type { CaptureCase } from '../../capture-types'
import { atDemoInstant, lightAndDark, TRIP_PATH } from '../page-setup'

export const CASES: CaptureCase[] = [
  ...lightAndDark('trips', '/trips', atDemoInstant),
  ...lightAndDark('trip-overview', TRIP_PATH, atDemoInstant),
]
