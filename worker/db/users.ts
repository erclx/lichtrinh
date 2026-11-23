import type { User } from '@shared/auth.ts'
import type { UpdateUserRequest } from '@shared/users.ts'
import { and, eq, sql } from 'drizzle-orm'

import type { createDb } from './client.ts'
import { users } from './schema.ts'

/** The API's view of a users row, which never carries the password hash. */
export function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    canChat: row.canChat,
    language: row.language,
  }
}

/**
 * Applies the changes and returns the row, or undefined when no account holds
 * the id or a demotion would leave no admin. The count sits in this one
 * statement, so racing demotions cannot both pass a read taken before it.
 */
export function updateUserKeepingAnAdmin(
  db: ReturnType<typeof createDb>,
  id: string,
  changes: UpdateUserRequest,
) {
  const keepsAnAdmin =
    changes.role === 'member'
      ? sql`not (${users.role} = ${'admin'} and (select count(*) from ${users} where ${users.role} = ${'admin'}) = 1)`
      : undefined
  return db
    .update(users)
    .set(changes)
    .where(and(eq(users.id, id), keepsAnAdmin))
    .returning()
    .get()
}
