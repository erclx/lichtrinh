// Migrates the database under LICHTRINH_STATE_ROOT, the checkout by default,
// and writes the invented accounts e2e, captures, and drives sign in with,
// plus two invented trips with their entries and costs. Every account is
// invented, so its password is public by design.

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

if (import.meta.main) {
  const state = statePath(process.env.LICHTRINH_STATE_ROOT ?? '.')
  migrate(state)
  await insertAccounts(state)
  console.log(
    `Seeded ${FIXTURE_ACCOUNTS.map(({ username }) => username).join(', ')}, ${FIXTURE_TRIPS.length} trips, and ${FIXTURE_ENTRIES.length} entries`,
  )
}
