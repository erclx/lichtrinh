import type { ContactSettings } from '@shared/settings.ts'
import { contactSettings } from '@shared/settings.ts'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthEnv } from '../auth/guard.ts'
import { createDb } from '../db/client.ts'
import { settings } from '../db/schema.ts'
import { parseBody } from '../envelope.ts'
import { logOutcome } from '../log.ts'

const CONTACT_NAME = 'contact_name'

// Reading is open to anyone signed in, and writing sits under `/admin`, which
// the app guards with requireAdmin.
export const settingsRoutes = new Hono<AuthEnv>()
  .get('/settings', async (c) => {
    const row = await createDb(c.env.DB)
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, CONTACT_NAME))
      .get()
    const body: ContactSettings = { contactName: row?.value ?? null }
    return c.json(body)
  })
  .put('/admin/settings', async (c) => {
    const { contactName } = await parseBody(c, contactSettings)
    const db = createDb(c.env.DB)
    if (contactName === null) {
      await db.delete(settings).where(eq(settings.key, CONTACT_NAME))
    } else {
      const change = {
        value: contactName,
        updatedAt: new Date(),
        updatedBy: c.var.user.id,
      }
      await db
        .insert(settings)
        .values({ key: CONTACT_NAME, ...change })
        .onConflictDoUpdate({ target: settings.key, set: change })
    }
    logOutcome('contact_set', { byUserId: c.var.user.id })
    const body: ContactSettings = { contactName }
    return c.json(body)
  })
