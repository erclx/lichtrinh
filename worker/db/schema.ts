import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Identity only. Credentials and sessions arrive with sign-in.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
