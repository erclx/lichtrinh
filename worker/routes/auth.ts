import { signInRequest } from '@shared/auth.ts'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthEnv } from '../auth/guard.ts'
import { verifyPassword } from '../auth/password.ts'
import { endSession, startSession } from '../auth/session.ts'
import { createDb } from '../db/client.ts'
import { users } from '../db/schema.ts'
import { toUser } from '../db/users.ts'
import { fail, parseBody } from '../envelope.ts'

// Logs carry the account id and the outcome alone, never the username typed,
// which can be a password entered in the wrong field.
function logOutcome(outcome: string, userId?: string) {
  console.log(JSON.stringify({ outcome, userId }))
}

export const authRoutes = new Hono<AuthEnv>()
  .post('/auth/sign-in', async (c) => {
    const body = await parseBody(c, signInRequest)
    const now = Date.now()
    const db = createDb(c.env.DB)

    const account = await db
      .select()
      .from(users)
      .where(eq(users.username, body.username))
      .get()
    // Runs one derive whether or not the account exists, so an unknown name
    // answers in the time a wrong password does.
    const valid = await verifyPassword(
      body.password,
      account?.passwordHash ?? null,
    )
    if (account === undefined || !valid) {
      logOutcome('sign_in_refused', account?.id)
      return c.json(
        fail('invalid_credentials', 'Wrong username or password'),
        401,
      )
    }

    await startSession(c, db, account.id, now)
    logOutcome('signed_in', account.id)
    return c.json(toUser(account))
  })
  .post('/auth/sign-out', async (c) => {
    await endSession(c, createDb(c.env.DB), c.var.sessionId)
    logOutcome('signed_out', c.var.user.id)
    return c.body(null, 204)
  })
  .get('/auth/me', (c) => c.json(c.var.user))
