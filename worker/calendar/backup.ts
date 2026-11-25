import type { Backup } from '@shared/backup.ts'
import type { Entry } from '@shared/entries.ts'

import { liveEntries } from './entries.ts'
import type { Db } from './record.ts'
import { listTrips } from './trips.ts'

/**
 * Every live trip with its live entries, in two queries whatever the trip
 * count, since the free plan caps the queries one request may make.
 */
export async function readBackup(db: Db, at: Date): Promise<Backup> {
  const [trips, entries] = await Promise.all([listTrips(db), liveEntries(db)])
  const byTrip = new Map<string, Entry[]>(trips.map(({ id }) => [id, []]))
  for (const entry of entries) byTrip.get(entry.tripId)?.push(entry)
  return {
    format: 'lichtrinh-backup',
    formatVersion: 1,
    exportedAt: at.toISOString(),
    trips: trips.map((trip) => ({ trip, entries: byTrip.get(trip.id) ?? [] })),
  }
}
