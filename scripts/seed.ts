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

/** The part of the D1 binding the seed calls. */
interface SeedDatabase {
  prepare(query: string): { bind(...values: unknown[]): unknown }
  batch(statements: unknown[]): Promise<unknown>
}

async function insertAccounts(state: string) {
  // Loaded here, so the e2e specs reading the fixtures never load wrangler.
  const { getPlatformProxy } = await import('wrangler')
  const proxy = await getPlatformProxy<{ DB: SeedDatabase }>({
    persist: { path: join(state, 'v3') },
    remoteBindings: false,
  })
  try {
    // A rerun skips existing accounts, keeping any password a drive changed.
    const insert = proxy.env.DB.prepare(
      `INSERT INTO users
         (id, username, display_name, role, created_at, password_hash, can_chat, language)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (username) DO NOTHING`,
    )
    const rows = await Promise.all(
      FIXTURE_ACCOUNTS.map(async (account) =>
        insert.bind(
          account.id,
          account.username,
          account.displayName,
          account.role,
          Date.now(),
          await hashPassword(account.password),
          account.canChat ? 1 : 0,
          account.language,
        ),
      ),
    )
    await proxy.env.DB.batch(rows)
    await proxy.env.DB.batch(calendarRows(proxy.env.DB))
    await proxy.env.DB.batch(chatRows(proxy.env.DB))
    await proxy.env.DB.batch(rateRows(proxy.env.DB))
  } finally {
    await proxy.dispose()
  }
}

// Written straight into the tables rather than through the calendar rules,
// which need the Worker's types the e2e specs importing this file lack. The
// rows carry no history, so a drive can undo its own changes but not these.
function calendarRows(db: SeedDatabase) {
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
  const zoneOf = new Map(
    FIXTURE_TRIPS.map(({ id, timeZone }) => [id, timeZone]),
  )
  return [
    ...FIXTURE_TRIPS.map((fixture) =>
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
    ...FIXTURE_ENTRIES.map((fixture) =>
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
        zoneOf.get(fixture.tripId),
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
function rateRows(db: SeedDatabase) {
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

// The assistant's entry carries its change, so the seeded chat's card can
// undo it. Its snapshot is the shape `shared/changes.ts` reads back.
function chatRows(db: SeedDatabase) {
  const traveler = 'fixture-traveler'
  const added = FIXTURE_ASSISTANT_ENTRY
  const timeZone = FIXTURE_TRIPS.find(({ id }) => id === added.tripId)?.timeZone
  const firstChat = FIXTURE_CHATS[0]
  const addedAt = (firstChat?.openedAt ?? 0) + 60_000
  const snapshot = {
    tripId: added.tripId,
    title: added.title,
    notes: added.notes,
    kind: added.kind,
    startsOn: added.startsOn,
    startTime: added.startTime,
    endsOn: added.endsOn,
    endTime: added.endTime,
    timeZone,
    costMinor: added.costMinor,
  }
  const entry = db.prepare(
    `INSERT INTO entries
       (id, trip_id, title, notes, kind, starts_on, start_time, ends_on, end_time,
        time_zone, cost_minor, version, created_by, created_source, created_at,
        updated_by, updated_source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'assistant', ?, ?, 'assistant', ?)
     ON CONFLICT (id) DO NOTHING`,
  )
  const change = db.prepare(
    `INSERT INTO changes
       (id, seq, trip_id, user_id, source, op, entity, entity_id, before, after, created_at)
     VALUES (?, (SELECT coalesce(max(seq), 0) + 1 FROM changes), ?, ?, 'assistant', 'create', 'entry', ?, NULL, ?, ?)
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
      timeZone,
      added.costMinor,
      traveler,
      addedAt,
      traveler,
      addedAt,
    ),
    change.bind(
      assistantChange,
      added.tripId,
      traveler,
      added.id,
      JSON.stringify(snapshot),
      addedAt,
    ),
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
  migrate(state)
  await insertAccounts(state)
  console.log(
    `Seeded ${FIXTURE_ACCOUNTS.map(({ username }) => username).join(', ')}, ${FIXTURE_TRIPS.length} trips, and ${FIXTURE_ENTRIES.length} entries`,
  )
}
