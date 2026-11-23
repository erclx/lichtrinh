import { languageUpdate, signInRequest } from '@shared/auth.ts'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import {
  addressKey,
  blockedForSeconds,
  clearFailures,
  recordFailure,
  usernameKey,
} from '../auth/attempts.ts'
import type { AuthEnv } from '../auth/guard.ts'
import { verifyPassword } from '../auth/password.ts'
import { endSession, startSession } from '../auth/session.ts'
import { createDb } from '../db/client.ts'
import { users } from '../db/schema.ts'
import { toUser } from '../db/users.ts'
import { fail, parseBody } from '../envelope.ts'
import { logOutcome } from '../log.ts'

export const authRoutes = new Hono<AuthEnv>()
  .post('/auth/sign-in', async (c) => {
    const body = await parseBody(c, signInRequest)
    const now = Date.now()
    const db = createDb(c.env.DB)
    // Only Cloudflare's edge sets this, so every local attempt shares one key.
    const address = c.req.header('cf-connecting-ip') ?? 'local'
    const byName = usernameKey(body.username)
    const keys = [byName, addressKey(address)]

    const waitSeconds = await blockedForSeconds(db, keys, now)
    if (waitSeconds > 0) {
      logOutcome('sign_in_rate_limited')
      c.header('Retry-After', String(waitSeconds))
      return c.json(fail('rate_limited', 'Too many failed sign-ins'), 429)
    }

    const account = await db
      .select()
      .from(users)
      .where(eq(users.username, body.username))
      .get()
    // Derives once even with no account, so an unknown name answers as slowly.
    const valid = await verifyPassword(
      body.password,
      account?.passwordHash ?? null,
    )
    if (account === undefined || !valid) {
      await recordFailure(db, keys, now)
      logOutcome('sign_in_refused', { userId: account?.id })
      return c.json(
        fail('invalid_credentials', 'Wrong username or password'),
        401,
      )
    }

    await clearFailures(db, byName)
    await startSession(c, db, account.id, now)
    logOutcome('signed_in', { userId: account.id })
    return c.json(toUser(account))
  })
  .post('/auth/sign-out', async (c) => {
    await endSession(c, createDb(c.env.DB), c.var.sessionId)
    logOutcome('signed_out', { userId: c.var.user.id })
    return c.body(null, 204)
  })
  .get('/auth/me', (c) => c.json(c.var.user))
  // The row is the session's own, never one the body names.
  .patch('/auth/me', async (c) => {
    const { language } = await parseBody(c, languageUpdate)
    const updated = await createDb(c.env.DB)
      .update(users)
      .set({ language })
      .where(eq(users.id, c.var.user.id))
      .returning()
      .get()
    if (updated === undefined) {
      return c.json(fail('unauthenticated', 'Sign in first'), 401)
    }
    logOutcome('language_set', { userId: updated.id })
    return c.json(toUser(updated))
  })
