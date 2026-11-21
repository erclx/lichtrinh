import type { CaptureCase } from '../capture-types'

/** Where a case flagged `evidence: true` writes its committed frames. */
export const EVIDENCE_ROOT = 'e2e/evidence'

export const CASES: CaptureCase[] = [
  {
    section: 'home',
    theme: 'default',
    route: '/',
    evidence: true,
  },
  {
    section: 'home',
    theme: 'dark',
    route: '/',
    evidence: true,
    setup: async (page) => {
      await page.emulateMedia({ colorScheme: 'dark' })
    },
  },
]
