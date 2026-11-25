import type { CaptureCase } from '../../capture-types'
import { atDemoInstant, lightAndDark } from '../page-setup'

export const CASES: CaptureCase[] = lightAndDark(
  'settings',
  '/settings',
  atDemoInstant,
)
