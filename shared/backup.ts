import { z } from 'zod'

import { tripWithEntries } from './trips.ts'

/**
 * The backup file: every live trip in the trip list's order, its live entries
 * in the range read's. An optional field added to a trip or an entry keeps
 * `formatVersion`, and a renamed or removed one raises it.
 */
export const backup = z.strictObject({
  format: z.literal('lichtrinh-backup'),
  formatVersion: z.literal(1),
  exportedAt: z.iso.datetime(),
  trips: z.array(tripWithEntries),
})
export type Backup = z.infer<typeof backup>
