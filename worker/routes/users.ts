import { generatePassword } from '@shared/generated-password.ts'
import { hashPassword } from '@shared/password-hash.ts'
import type {
  CreatedUser,
  OneTimePassword,
  UpdatedUser,
  UserList,
} from '@shared/users.ts'
import { createUserRequest, updateUserRequest } from '@shared/users.ts'
import { and, asc, eq, sql } from 'drizzle-orm'
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
      password,
    }
    return c.json(body, 201)
  })
  .patch('/admin/users/:id', async (c) => {
    const id = c.req.param('id')
    const changes = await parseBody(c, updateUserRequest)
    const db = createDb(c.env.DB)
    // The count sits inside the one statement, so two demotions racing past
    // a separate read cannot both pass and leave no admin.
    const keepsAnAdmin =
      changes.role === 'member'
        ? sql`not (${users.role} = ${'admin'} and (select count(*) from ${users} where ${users.role} = ${'admin'}) = 1)`
        : undefined
    const updated = await db
      .update(users)
      .set(changes)
      .where(and(eq(users.id, id), keepsAnAdmin))
      .returning()
      .get()
    if (updated === undefined) {
      const exists = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, id))
        .get()
      if (exists === undefined) {
        return c.json(fail('not_found', 'No such account'), 404)
      }
      logOutcome('user_update_refused', { userId: id, byUserId: c.var.user.id })
      return c.json(fail('last_admin', 'The app needs one admin'), 409)
    }
    logOutcome('user_updated', { userId: id, byUserId: c.var.user.id })
    const body: UpdatedUser = { user: toUser(updated) }
    return c.json(body)
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
    const body: OneTimePassword = { password }
    return c.json(body)
  })
