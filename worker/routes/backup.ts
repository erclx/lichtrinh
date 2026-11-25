import { Hono } from 'hono'

import type { AuthEnv } from '../auth/guard.ts'
import { readBackup } from '../calendar/backup.ts'
import { createDb } from '../db/client.ts'
import { logOutcome } from '../log.ts'

// Mounted under `/admin`, which the app guards with requireAdmin.
export const backupRoutes = new Hono<AuthEnv>().get(
  '/admin/backup',
  async (c) => {
    const body = await readBackup(createDb(c.env.DB), new Date())
    logOutcome('backup_read', {
      trips: body.trips.length,
      entries: body.trips.reduce((sum, { entries }) => sum + entries.length, 0),
    })
    c.header('Cache-Control', 'no-store')
    return c.json(body)
  },
)
