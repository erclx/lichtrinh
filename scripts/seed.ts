// Migrates the database under LICHTRINH_STATE_ROOT, the checkout by default,
// and writes the invented accounts, trips, and entries e2e, captures, and
// drives read. Every account is invented, so its password is public.

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

import type { Language, Role } from '@shared/auth.ts'
import { hashPassword } from '@shared/password-hash.ts'

export interface FixtureAccount {
  id: string
  username: string
  displayName: string
  role: Role
  canChat: boolean
  language: Language
  password: string
}

export const FIXTURE_ACCOUNTS: readonly FixtureAccount[] = [
  {
    id: 'fixture-admin',
    username: 'admin',
    displayName: 'Admin',
    role: 'admin',
    canChat: false,
    language: 'en',
    password: 'seed-admin-pass',
  },
  {
    id: 'fixture-traveler',
    username: 'traveler',
    displayName: 'Du khách',
    role: 'member',
    canChat: true,
    language: 'vi',
    password: 'seed-family-pass',
  },
]

export interface FixtureTrip {
  id: string
  name: string
  startsOn: string
  endsOn: string
  timeZone: string
  currency: string
  homeCurrency: string
}

// Invented places and dates in 2031, per the privacy rule, since a real trip
// tells a stranger when a home stands empty.
export const FIXTURE_TRIPS: readonly FixtureTrip[] = [
  {
    id: 'fixture-trip-river',
    name: 'Trip to Sông Mây',
    startsOn: '2031-05-13',
    endsOn: '2031-05-20',
    timeZone: 'Asia/Ho_Chi_Minh',
    currency: 'VND',
    homeCurrency: 'USD',
  },
  {
    id: 'fixture-trip-island',
    name: 'Summer on Đảo Lam',
    startsOn: '2031-07-02',
    endsOn: '2031-07-09',
    timeZone: 'Asia/Ho_Chi_Minh',
    currency: 'VND',
    homeCurrency: 'USD',
  },
]

export interface FixtureEntry {
  id: string
  tripId: string
  title: string
  notes: string | null
  kind: 'food' | 'sights' | 'rest' | 'transport' | 'activity' | null
  startsOn: string
  startTime: string
  endsOn: string
  endTime: string
  costMinor: number | null
  addedBy: string
}

const river = 'fixture-trip-river'

/** The demo day, which holds a done, a now, and an upcoming entry at `DEMO_INSTANT`. */
export const DEMO_DAY = { tripId: river, date: '2031-05-15' } as const

/** 09:45 on the demo day in the trip's zone, inside the flower market. */
export const DEMO_INSTANT = '2031-05-15T02:45:00Z'

function onRiver(
  id: string,
  startsOn: string,
  fields: Omit<FixtureEntry, 'id' | 'tripId' | 'startsOn' | 'endsOn'> & {
    endsOn?: string
  },
): FixtureEntry {
  return {
    id,
    tripId: river,
    startsOn,
    ...fields,
    endsOn: fields.endsOn ?? startsOn,
  }
}

export const FIXTURE_ENTRIES: readonly FixtureEntry[] = [
  onRiver('fixture-entry-arrive', '2031-05-13', {
    title: 'Bus to the river town',
    notes: null,
    kind: 'transport',
    startTime: '08:00',
    endTime: '11:00',
    costMinor: 180_000,
    addedBy: 'fixture-traveler',
  }),
  onRiver('fixture-entry-noodles', '2031-05-13', {
    title: 'Noodles by the bridge',
    notes: null,
    kind: 'food',
    startTime: '12:00',
    endTime: '13:00',
    costMinor: 120_000,
    addedBy: 'fixture-traveler',
  }),
  onRiver('fixture-entry-temple', '2031-05-14', {
    title: 'Hill temple walk',
    notes: null,
    kind: 'sights',
    startTime: '08:30',
    endTime: '11:00',
    costMinor: 50_000,
    addedBy: 'fixture-admin',
  }),
  // No kind, for the budget's Uncategorized row.
  onRiver('fixture-entry-postcards', '2031-05-14', {
    title: 'Postcards and stamps',
    notes: null,
    kind: null,
    startTime: '15:00',
    endTime: '15:30',
    costMinor: 60_000,
    addedBy: 'fixture-traveler',
  }),
  onRiver('fixture-entry-massage', '2031-05-17', {
    title: 'Foot massage by the river',
    notes: null,
    kind: 'rest',
    startTime: '16:00',
    endTime: '17:00',
    costMinor: 250_000,
    addedBy: 'fixture-admin',
  }),
  onRiver('fixture-entry-breakfast', '2031-05-15', {
    title: 'Pho breakfast near the hotel',
    notes: null,
    kind: 'food',
    startTime: '07:00',
    endTime: '08:00',
    costMinor: 90_000,
    addedBy: 'fixture-traveler',
  }),
  onRiver('fixture-entry-market', '2031-05-15', {
    title: 'Sông Mây flower market',
    notes: 'Bring a cloth bag. Busiest around 10.',
    kind: 'sights',
    startTime: '09:00',
    endTime: '11:30',
    costMinor: 200_000,
    addedBy: 'fixture-admin',
  }),
  onRiver('fixture-entry-lunch', '2031-05-15', {
    title: 'Lunch with the family',
    notes: null,
    kind: 'food',
    startTime: '12:00',
    endTime: '13:30',
    costMinor: 350_000,
    addedBy: 'fixture-traveler',
  }),
  onRiver('fixture-entry-rest', '2031-05-15', {
    title: 'Rest at the hotel',
    notes: null,
    kind: 'rest',
    startTime: '14:00',
    endTime: '16:00',
    costMinor: null,
    addedBy: 'fixture-traveler',
  }),
  onRiver('fixture-entry-boat', '2031-05-15', {
    title: 'Sunset boat trip',
    notes: null,
    kind: 'activity',
    startTime: '17:00',
    endTime: '18:30',
    costMinor: 450_000,
    addedBy: 'fixture-admin',
  }),
  {
    id: 'fixture-entry-ferry',
    tripId: 'fixture-trip-island',
    title: 'Ferry to the island',
    notes: null,
    kind: 'transport',
    startsOn: '2031-07-02',
    startTime: '07:30',
    endsOn: '2031-07-02',
    endTime: '09:30',
    costMinor: 300_000,
    addedBy: 'fixture-traveler',
  },
]

function addDays(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10)
}

/**
 * An invented trip around `today`, for the owner's own runs and staging alone,
 * so the home screen has a now and a next. Every test and capture reads the
 * 2031 fixtures, which this leaves alone. `key` prefixes each id, so a trip
 * gone stale keeps its rows beside a fresh one.
 */
export function todayFixtures(
  today: string,
  key = 'dev',
): {
  trip: FixtureTrip
  entries: FixtureEntry[]
} {
  const tripId = `${key}-trip-today`
  const entry = (
    id: string,
    offset: number,
    fields: Pick<
      FixtureEntry,
      'title' | 'kind' | 'startTime' | 'endTime' | 'costMinor'
    >,
  ): FixtureEntry => ({
    id: `${key}-entry-${id}`,
    tripId,
    notes: null,
    startsOn: addDays(today, offset),
    endsOn: addDays(today, offset),
    addedBy: 'fixture-traveler',
    ...fields,
  })
  return {
    trip: {
      id: tripId,
      name: 'A week on Đồi Sương',
      startsOn: addDays(today, -2),
      endsOn: addDays(today, 4),
      timeZone: 'Asia/Ho_Chi_Minh',
      currency: 'VND',
      homeCurrency: 'USD',
    },
    entries: [
      entry('arrive', -2, {
        title: 'Train up the hill',
        kind: 'transport',
        startTime: '09:00',
        endTime: '12:00',
        costMinor: 220_000,
      }),
      entry('breakfast', 0, {
        title: 'Bánh mì at the hostel',
        kind: 'food',
        startTime: '07:00',
        endTime: '08:00',
        costMinor: 40_000,
      }),
      entry('walk', 0, {
        title: 'Tea terrace walk',
        kind: 'sights',
        startTime: '08:30',
        endTime: '11:30',
        costMinor: 60_000,
      }),
      entry('lunch', 0, {
        title: 'Lunch by the lake',
        kind: 'food',
        startTime: '12:00',
        endTime: '13:00',
        costMinor: 150_000,
      }),
      entry('rest', 0, {
        title: 'Rest at the hostel',
        kind: 'rest',
        startTime: '13:30',
        endTime: '16:00',
        costMinor: null,
      }),
      entry('dinner', 0, {
        title: 'Hot pot dinner',
        kind: 'food',
        startTime: '18:00',
        endTime: '20:00',
        costMinor: 300_000,
      }),
      entry('market', 0, {
        title: 'Night market',
        kind: 'activity',
        startTime: '20:30',
        endTime: '22:00',
        costMinor: 100_000,
      }),
      entry('waterfall', 1, {
        title: 'Waterfall day trip',
        kind: 'activity',
        startTime: '08:00',
        endTime: '15:00',
        costMinor: 400_000,
      }),
    ],
  }
}

export interface FixtureRate {
  from: string
  to: string
  rate: string
}

/** The river trip's pair, set by the admin, so the home figure shows. */
export const FIXTURE_RATES: readonly FixtureRate[] = [
  { from: 'USD', to: 'VND', rate: '25500' },
]

/** The assistant's add in the seeded chat, which its card undoes. */
export const FIXTURE_ASSISTANT_ENTRY = onRiver(
  'fixture-entry-pho-tomorrow',
  '2031-05-16',
  {
    title: 'Phở sáng',
    notes: null,
    kind: 'food',
    startTime: '07:00',
    endTime: '08:00',
    costMinor: null,
    addedBy: 'fixture-traveler',
  },
)

function riverEntry(id: string): FixtureEntry {
  const entry = FIXTURE_ENTRIES.find((fixture) => fixture.id === id)
  if (entry === undefined) throw new Error(`The seed holds no entry ${id}`)
  return entry
}

const market = riverEntry('fixture-entry-market')
const boat = riverEntry('fixture-entry-boat')
const lunch = riverEntry('fixture-entry-lunch')

/** Already removed by the assistant, so only its change still shows it. */
export const FIXTURE_REMOVED_ENTRY = onRiver(
  'fixture-entry-taxi',
  '2031-05-15',
  {
    title: 'Taxi to the boat pier',
    notes: null,
    kind: 'transport',
    startTime: '16:15',
    endTime: '16:45',
    costMinor: 80_000,
    addedBy: 'fixture-traveler',
  },
)

export interface FixtureChange {
  id: string
  by: string
  source: 'person' | 'assistant'
  op: 'create' | 'update' | 'delete'
  before: FixtureEntry | null
  after: FixtureEntry | null
  /** Epoch milliseconds, before the demo instant on the demo day. */
  at: number
}

// Oldest first, as the log numbers them. Each `after` is what the entry
// holds now, so a drive can undo any of them.
export const FIXTURE_CHANGES: readonly FixtureChange[] = [
  {
    id: 'fixture-change-market',
    by: 'fixture-admin',
    source: 'person',
    op: 'create',
    before: null,
    after: market,
    at: Date.UTC(2031, 4, 15, 1, 12),
  },
  {
    id: 'fixture-change-boat',
    by: 'fixture-traveler',
    source: 'assistant',
    op: 'update',
    before: { ...boat, startTime: '16:30', endTime: '18:00' },
    after: boat,
    at: Date.UTC(2031, 4, 15, 1, 30),
  },
  {
    id: 'fixture-change-lunch',
    by: 'fixture-traveler',
    source: 'person',
    op: 'update',
    before: { ...lunch, costMinor: 300_000 },
    after: lunch,
    at: Date.UTC(2031, 4, 15, 1, 41),
  },
  {
    id: 'fixture-change-taxi',
    by: 'fixture-traveler',
    source: 'assistant',
    op: 'delete',
    before: FIXTURE_REMOVED_ENTRY,
    after: null,
    at: Date.UTC(2031, 4, 15, 1, 52),
  },
]

export interface FixtureMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  status: 'complete' | 'failed'
  /** Minutes after the chat opened, so each frame reads the same order. */
  minute: number
  changeIds?: string[]
}

export interface FixtureChat {
  id: string
  title: string
  /** When the chat opened, as epoch milliseconds. */
  openedAt: number
  messages: FixtureMessage[]
}

const assistantChange = 'fixture-change-pho-tomorrow'

// Invented asks typed without diacritics, as the traveler types them, and
// invented replies. The second chat ends on a dropped reply, for the failed
// card's frame.
export const FIXTURE_CHATS: readonly FixtureChat[] = [
  {
    id: 'fixture-chat-today',
    title: 'pho sang mai luc 7 gio',
    openedAt: Date.UTC(2031, 4, 15, 2, 0),
    messages: [
      {
        id: 'fixture-message-ask-pho',
        role: 'user',
        text: 'pho sang mai luc 7 gio',
        status: 'complete',
        minute: 0,
      },
      {
        id: 'fixture-message-added-pho',
        role: 'assistant',
        text: 'Xong. Mình đã thêm phở sáng mai, thứ Sáu 16/5, lúc 7 giờ.',
        status: 'complete',
        minute: 1,
        changeIds: [assistantChange],
      },
      {
        id: 'fixture-message-ask-free',
        role: 'user',
        text: 'chieu nay con trong luc nao',
        status: 'complete',
        minute: 30,
      },
      {
        id: 'fixture-message-free',
        role: 'assistant',
        text: 'Chiều nay bạn rảnh từ 16:00 đến 17:00, trước chuyến thuyền.',
        status: 'complete',
        minute: 31,
      },
    ],
  },
  {
    id: 'fixture-chat-dinner',
    title: 'doi bua toi sang 8 gio',
    openedAt: Date.UTC(2031, 4, 14, 11, 0),
    messages: [
      {
        id: 'fixture-message-ask-dinner',
        role: 'user',
        text: 'doi bua toi sang 8 gio',
        status: 'complete',
        minute: 0,
      },
      {
        id: 'fixture-message-dropped',
        role: 'assistant',
        text: '',
        status: 'failed',
        minute: 1,
      },
    ],
  },
]

/** Where the Vite plugin, wrangler, and this script keep local state. */
export function statePath(root: string): string {
  return join(resolve(root), '.wrangler', 'state')
}

function migrate(state: string) {
  // CI set, so wrangler applies without asking for a confirmation.
  const { status } = spawnSync(
    'bunx',
    [
      'wrangler',
      'd1',
      'migrations',
      'apply',
      'DB',
      '--local',
      '--persist-to',
      state,
    ],
    { stdio: 'inherit', env: { ...process.env, CI: '1' } },
  )
  if (status !== 0) throw new Error(`Migrations exited with ${status}`)
}

/** The part of the D1 binding the seed's statements are written against. */
export interface SeedDatabase<Statement = unknown> {
  prepare(query: string): { bind(...values: unknown[]): Statement }
}

interface LocalDatabase extends SeedDatabase {
  batch(statements: unknown[]): Promise<unknown>
}

/** The date where every fixture trip is, whatever this machine's zone. */
export function fixtureToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(now)
}

export interface Calendar {
  trips: readonly FixtureTrip[]
  entries: readonly FixtureEntry[]
}

async function insertAccounts(state: string, calendar: Calendar) {
  // Loaded here, so the e2e specs reading the fixtures never load wrangler.
  const { getPlatformProxy } = await import('wrangler')
  const proxy = await getPlatformProxy<{ DB: LocalDatabase }>({
    persist: { path: join(state, 'v3') },
    remoteBindings: false,
  })
  try {
    const hashes = await Promise.all(
      FIXTURE_ACCOUNTS.map(({ password }) => hashPassword(password)),
    )
    await proxy.env.DB.batch(
      accountRows(proxy.env.DB, Date.now(), (_account, index) => hashes[index]),
    )
    await proxy.env.DB.batch(calendarRows(proxy.env.DB, calendar))
    await proxy.env.DB.batch(historyRows(proxy.env.DB))
    await proxy.env.DB.batch(chatRows(proxy.env.DB))
    await proxy.env.DB.batch(rateRows(proxy.env.DB))
  } finally {
    await proxy.dispose()
  }
}

/**
 * A rerun skips existing accounts, keeping any password changed since. An
 * account with a null hash refuses every sign-in until the admin resets it.
 */
export function accountRows<Statement>(
  db: SeedDatabase<Statement>,
  at: number,
  hashOf: (account: FixtureAccount, index: number) => string | null,
): Statement[] {
  const insert = db.prepare(
    `INSERT INTO users
       (id, username, display_name, role, created_at, password_hash, can_chat, language)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (username) DO NOTHING`,
  )
  return FIXTURE_ACCOUNTS.map((account, index) =>
    insert.bind(
      account.id,
      account.username,
      account.displayName,
      account.role,
      at,
      hashOf(account, index),
      account.canChat ? 1 : 0,
      account.language,
    ),
  )
}

// Written straight into the tables rather than through the calendar rules,
// which need the Worker's types the e2e specs importing this file lack. The
// rows carry no history of their own, beyond what `historyRows` adds.
export function calendarRows<Statement>(
  db: SeedDatabase<Statement>,
  { trips, entries }: Calendar,
): Statement[] {
  const at = Date.UTC(2031, 4, 1)
  const trip = db.prepare(
    `INSERT INTO trips
       (id, name, starts_on, ends_on, time_zone, currency, home_currency, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT (id) DO NOTHING`,
  )
  const entry = db.prepare(
    `INSERT INTO entries
       (id, trip_id, title, notes, kind, starts_on, start_time, ends_on, end_time,
        time_zone, cost_minor, version, created_by, created_source, created_at,
        updated_by, updated_source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'person', ?, ?, 'person', ?)
     ON CONFLICT (id) DO NOTHING`,
  )
  const zones = new Map(trips.map(({ id, timeZone }) => [id, timeZone]))
  return [
    ...trips.map((fixture) =>
      trip.bind(
        fixture.id,
        fixture.name,
        fixture.startsOn,
        fixture.endsOn,
        fixture.timeZone,
        fixture.currency,
        fixture.homeCurrency,
      ),
    ),
    ...entries.map((fixture) =>
      entry.bind(
        fixture.id,
        fixture.tripId,
        fixture.title,
        fixture.notes,
        fixture.kind,
        fixture.startsOn,
        fixture.startTime,
        fixture.endsOn,
        fixture.endTime,
        zones.get(fixture.tripId),
        fixture.costMinor,
        fixture.addedBy,
        at,
        fixture.addedBy,
        at,
      ),
    ),
  ]
}

// Under the `rate:<FROM>:<TO>` key the rates route reads.
export function rateRows<Statement>(db: SeedDatabase<Statement>): Statement[] {
  const rate = db.prepare(
    `INSERT INTO settings (key, value, updated_at, updated_by)
     VALUES (?, ?, ?, 'fixture-admin')
     ON CONFLICT (key) DO NOTHING`,
  )
  const at = Date.UTC(2031, 4, 1)
  return FIXTURE_RATES.map((fixture) =>
    rate.bind(`rate:${fixture.from}:${fixture.to}`, fixture.rate, at),
  )
}

// The shape `shared/changes.ts` reads back.
function snapshotOf(fixture: FixtureEntry) {
  return JSON.stringify({
    tripId: fixture.tripId,
    title: fixture.title,
    notes: fixture.notes,
    kind: fixture.kind,
    startsOn: fixture.startsOn,
    startTime: fixture.startTime,
    endsOn: fixture.endsOn,
    endTime: fixture.endTime,
    timeZone: zoneOf(fixture),
    costMinor: fixture.costMinor,
  })
}

function zoneOf(fixture: FixtureEntry) {
  return FIXTURE_TRIPS.find(({ id }) => id === fixture.tripId)?.timeZone
}

function changeRow<Statement>(
  db: SeedDatabase<Statement>,
  fixture: FixtureChange,
): Statement {
  const entry = fixture.after ?? fixture.before
  if (entry === null) throw new Error(`${fixture.id} changes no entry`)
  return db
    .prepare(
      `INSERT INTO changes
         (id, seq, trip_id, user_id, source, op, entity, entity_id, before, after, created_at)
       VALUES (?, (SELECT coalesce(max(seq), 0) + 1 FROM changes), ?, ?, ?, ?, 'entry', ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .bind(
      fixture.id,
      entry.tripId,
      fixture.by,
      fixture.source,
      fixture.op,
      entry.id,
      fixture.before && snapshotOf(fixture.before),
      fixture.after && snapshotOf(fixture.after),
      fixture.at,
    )
}

// The removed entry keeps its row, marked deleted, so its undo can restore it.
export function historyRows<Statement>(
  db: SeedDatabase<Statement>,
): Statement[] {
  const removed = FIXTURE_REMOVED_ENTRY
  const at = Date.UTC(2031, 4, 1)
  const removedAt = FIXTURE_CHANGES.at(-1)?.at ?? at
  const entry = db
    .prepare(
      `INSERT INTO entries
         (id, trip_id, title, notes, kind, starts_on, start_time, ends_on, end_time,
          time_zone, cost_minor, version, created_by, created_source, created_at,
          updated_by, updated_source, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?, 'person', ?, ?, 'assistant', ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .bind(
      removed.id,
      removed.tripId,
      removed.title,
      removed.notes,
      removed.kind,
      removed.startsOn,
      removed.startTime,
      removed.endsOn,
      removed.endTime,
      zoneOf(removed),
      removed.costMinor,
      removed.addedBy,
      at,
      removed.addedBy,
      removedAt,
      removedAt,
    )
  return [entry, ...FIXTURE_CHANGES.map((change) => changeRow(db, change))]
}

// The assistant's entry carries its change, so the seeded chat's card can
// undo it.
export function chatRows<Statement>(db: SeedDatabase<Statement>): Statement[] {
  const traveler = 'fixture-traveler'
  const added = FIXTURE_ASSISTANT_ENTRY
  const addedAt = (FIXTURE_CHATS[0]?.openedAt ?? 0) + 60_000
  const entry = db.prepare(
    `INSERT INTO entries
       (id, trip_id, title, notes, kind, starts_on, start_time, ends_on, end_time,
        time_zone, cost_minor, version, created_by, created_source, created_at,
        updated_by, updated_source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'assistant', ?, ?, 'assistant', ?)
     ON CONFLICT (id) DO NOTHING`,
  )
  const chat = db.prepare(
    `INSERT INTO chats (id, owner_id, trip_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
  )
  const message = db.prepare(
    `INSERT INTO chat_messages
       (id, chat_id, role, text, status, model, change_ids, reply_to, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
  )
  return [
    entry.bind(
      added.id,
      added.tripId,
      added.title,
      added.notes,
      added.kind,
      added.startsOn,
      added.startTime,
      added.endsOn,
      added.endTime,
      zoneOf(added),
      added.costMinor,
      traveler,
      addedAt,
      traveler,
      addedAt,
    ),
    changeRow(db, {
      id: assistantChange,
      by: traveler,
      source: 'assistant',
      op: 'create',
      before: null,
      after: added,
      at: addedAt,
    }),
    ...FIXTURE_CHATS.flatMap((fixture) => {
      const at = (minute: number) => fixture.openedAt + minute * 60_000
      const last = fixture.messages.at(-1)?.minute ?? 0
      return [
        chat.bind(
          fixture.id,
          traveler,
          river,
          fixture.title,
          fixture.openedAt,
          at(last),
        ),
        ...fixture.messages.map((fixtureMessage, index) =>
          message.bind(
            fixtureMessage.id,
            fixture.id,
            fixtureMessage.role,
            fixtureMessage.text,
            fixtureMessage.status,
            fixtureMessage.role === 'assistant' ? 'lichtrinh-assistant' : null,
            JSON.stringify(fixtureMessage.changeIds ?? []),
            fixtureMessage.role === 'assistant'
              ? (fixture.messages[index - 1]?.id ?? null)
              : null,
            at(fixtureMessage.minute),
          ),
        ),
      ]
    }),
  ]
}

if (import.meta.main) {
  const state = statePath(process.env.LICHTRINH_STATE_ROOT ?? '.')
  const calendar = { trips: [...FIXTURE_TRIPS], entries: [...FIXTURE_ENTRIES] }
  // `--today` is for the owner's own runs, never for a test or a capture.
  if (process.argv.includes('--today')) {
    const around = todayFixtures(fixtureToday(new Date()))
    calendar.trips.push(around.trip)
    calendar.entries.push(...around.entries)
  }
  migrate(state)
  await insertAccounts(state, calendar)
  console.log(
    `Seeded ${FIXTURE_ACCOUNTS.map(({ username }) => username).join(', ')}, ${calendar.trips.length} trips, and ${calendar.entries.length} entries`,
  )
}
