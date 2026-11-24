import type { CaptureCase } from '../../capture-types'
import { atDemoInstantInTripZone, lightAndDark } from '../page-setup'

export const CASES: CaptureCase[] = lightAndDark(
  'rates',
  '/admin/rates',
  atDemoInstantInTripZone,
)
