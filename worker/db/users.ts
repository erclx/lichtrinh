import type { User } from '@shared/auth.ts'

import type { users } from './schema.ts'

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
