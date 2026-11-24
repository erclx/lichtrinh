import type { CaptureCase } from '../../capture-types'
import { asAdmin, lightAndDark } from '../page-setup'

export const CASES: CaptureCase[] = lightAndDark(
  'settings',
  '/settings',
  asAdmin,
)
