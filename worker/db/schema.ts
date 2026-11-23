import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  // Null means the account cannot sign in until the admin resets it.
  passwordHash: text('password_hash'),
  canChat: integer('can_chat', { mode: 'boolean' }).notNull().default(false),
  language: text('language', { enum: ['vi', 'en'] }),
})

// The id is the SHA-256 of the cookie's token, so a read of this table
// cannot sign anyone in.
export const authSessions = sqliteTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('auth_sessions_user_id_idx').on(table.userId)],
)

// One row per counted key, being a username or a client address, each
// prefixed so the two never collide.
export const signInAttempts = sqliteTable('sign_in_attempts', {
  key: text('key').primaryKey(),
  failures: integer('failures').notNull(),
  windowStartedAt: integer('window_started_at', {
    mode: 'timestamp_ms',
  }).notNull(),
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  updatedBy: text('updated_by').references(() => users.id, {
    onDelete: 'set null',
  }),
})
