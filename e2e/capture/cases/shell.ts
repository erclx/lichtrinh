import type { CaptureCase } from '../../capture-types'
import { atDemoInstant, lightAndDark } from '../page-setup'

// Today opens on the seeded trips, so the shell pins the date too.
export const CASES: CaptureCase[] = lightAndDark('shell', '/', atDemoInstant)
