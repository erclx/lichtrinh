import type { Health } from '@shared/health.ts'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'

import { createDb } from '../db/client.ts'

export const healthRoutes = new Hono<{ Bindings: Env }>().get(
  '/health',
  async (c) => {
    await createDb(c.env.DB).run(sql`select 1`)
    const body: Health = { status: 'ok' }
    return c.json(body)
  },
)
