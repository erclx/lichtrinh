import type { CaptureCase } from '../capture-types'

/** Where a case flagged `evidence: true` writes its committed frames. */
export const EVIDENCE_ROOT = 'e2e/evidence'

/**
 * Empty, since each feature's cases sit in its own `cases/<feature>.ts`. The
 * file stays because `canon tooling sync` seeds a starter one when it is gone.
 */
export const CASES: CaptureCase[] = []
