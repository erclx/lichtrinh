import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

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

const SOURCES = ['person', 'assistant'] as const

// Calendar rows are soft-deleted, so undo restores a row rather than
// rebuilding it, and every read filters on `deleted_at is null`. Dates are
// local `YYYY-MM-DD` and times local `HH:MM`, read in the row's own zone.
export const trips = sqliteTable('trips', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  startsOn: text('starts_on').notNull(),
  endsOn: text('ends_on').notNull(),
  timeZone: text('time_zone').notNull(),
  currency: text('currency').notNull(),
  homeCurrency: text('home_currency').notNull(),
  version: integer('version').notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
})

export const entries = sqliteTable(
  'entries',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id),
    title: text('title').notNull(),
    notes: text('notes'),
    kind: text('kind', {
      enum: ['food', 'sights', 'rest', 'transport', 'activity'],
    }),
    startsOn: text('starts_on').notNull(),
    startTime: text('start_time').notNull(),
    endsOn: text('ends_on').notNull(),
    endTime: text('end_time').notNull(),
    timeZone: text('time_zone').notNull(),
    // In the trip currency's minor unit, so VND 200000 is 200000 and
    // USD 12.50 is 1250.
    costMinor: integer('cost_minor'),
    version: integer('version').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdSource: text('created_source', { enum: SOURCES }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => users.id),
    updatedSource: text('updated_source', { enum: SOURCES }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('entries_trip_id_starts_on_idx').on(table.tripId, table.startsOn),
  ],
)

// One row per write. `seq` orders the log, since two writes can share a
// millisecond. `undoes` is unique, so a change is undone at most once even
// when two undos race.
export const changes = sqliteTable(
  'changes',
  {
    id: text('id').primaryKey(),
    seq: integer('seq').notNull(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    source: text('source', { enum: SOURCES }).notNull(),
    op: text('op', { enum: ['create', 'update', 'delete', 'undo'] }).notNull(),
    entity: text('entity', { enum: ['trip', 'entry'] }).notNull(),
    entityId: text('entity_id').notNull(),
    // JSON snapshots of the fields a person sets, null on the side of the
    // change where the row is absent or deleted.
    before: text('before'),
    after: text('after'),
    undoes: text('undoes'),
    // A JSON array of the entries a trip's zone change moved with it, so
    // undoing that change moves the same entries back.
    rezonedEntryIds: text('rezoned_entry_ids'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('changes_seq_idx').on(table.seq),
    uniqueIndex('changes_undoes_idx').on(table.undoes),
    index('changes_trip_id_seq_idx').on(table.tripId, table.seq),
  ],
)

// A chat keeps the trip it was bound to when created, since the tools take
// no trip id and act on this one alone.
export const chats = sqliteTable(
  'chats',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id),
    // The start of the first message, null until one is sent.
    title: text('title'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('chats_owner_id_updated_at_idx').on(table.ownerId, table.updatedAt),
  ],
)

// A reply names the message it answers in `reply_to`, which is unique, so a
// retried send finds its saved reply and no message gets two.
export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    chatId: text('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    text: text('text').notNull(),
    status: text('status', {
      enum: ['complete', 'failed', 'stopped'],
    }).notNull(),
    model: text('model'),
    // A JSON array of the change ids the reply wrote, oldest first.
    changeIds: text('change_ids').notNull().default('[]'),
    replyTo: text('reply_to'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('chat_messages_chat_id_created_at_idx').on(
      table.chatId,
      table.createdAt,
    ),
    uniqueIndex('chat_messages_reply_to_idx').on(table.replyTo),
  ],
)
