import { generatePassword, groupInFours } from '@shared/generated-password.ts'
import { hashPassword } from '@shared/password-hash.ts'
import type { CreatedUser, OneTimePassword, UserList } from '@shared/users.ts'
import { createUserRequest } from '@shared/users.ts'
import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthEnv } from '../auth/guard.ts'
import { endAllSessions } from '../auth/session.ts'
import { createDb } from '../db/client.ts'
import { users } from '../db/schema.ts'
import { toUser } from '../db/users.ts'
import { fail, parseBody } from '../envelope.ts'
import { logOutcome } from '../log.ts'

// Mounted under `/admin`, which the app guards with requireAdmin.
export const userRoutes = new Hono<AuthEnv>()
  .get('/admin/users', async (c) => {
    const rows = await createDb(c.env.DB)
      .select()
      .from(users)
      .orderBy(asc(users.username))
    const body: UserList = { users: rows.map(toUser) }
    return c.json(body)
  })
  // A retry after a lost response finds the name taken, so the first
  // password never arrives. The admin recovers with a reset.
  .post('/admin/users', async (c) => {
    const request = await parseBody(c, createUserRequest)
    const password = generatePassword()
    const created = await createDb(c.env.DB)
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: request.username,
        displayName: request.displayName,
        role: request.role,
        canChat: request.canChat,
        language: request.language,
        createdAt: new Date(),
        passwordHash: await hashPassword(password),
      })
      .onConflictDoNothing({ target: users.username })
      .returning()
      .get()
    if (created === undefined) {
      return c.json(fail('username_taken', 'That username is taken'), 409)
    }
    logOutcome('user_created', { userId: created.id, byUserId: c.var.user.id })
    const body: CreatedUser = {
      user: toUser(created),
      password: groupInFours(password),
    }
    return c.json(body, 201)
  })
  .post('/admin/users/:id/password', async (c) => {
    const id = c.req.param('id')
    const password = generatePassword()
    const db = createDb(c.env.DB)
    // One batch, so the new hash and the ended sessions land together or not.
    const [updated] = await db.batch([
      db
        .update(users)
        .set({ passwordHash: await hashPassword(password) })
        .where(eq(users.id, id))
        .returning({ id: users.id }),
      endAllSessions(db, id),
    ])
    if (updated.length === 0) {
      return c.json(fail('not_found', 'No such account'), 404)
    }
    logOutcome('password_reset', { userId: id, byUserId: c.var.user.id })
    const body: OneTimePassword = { password: groupInFours(password) }
    return c.json(body)
  })
