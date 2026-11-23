import type { EntryKind } from './changes.ts'

interface Costed {
  kind: EntryKind | null
  startsOn: string
  costMinor: number | null
}

interface Span {
  startsOn: string
  endsOn: string
}

/** One kind's share of a trip, `null` being the entries of no kind. */
export interface KindTotal {
  kind: EntryKind | null
  totalMinor: number
}

/** One trip day's total, zero on a day with nothing costed. */
export interface DayTotal {
  date: string
  totalMinor: number
}

export interface TripBudget {
  totalMinor: number
  /** Every kind holding a cost, in the order the budget frame lists them. */
  byKind: KindTotal[]
  byDay: DayTotal[]
  /** How many entries carry no cost yet, so a reader knows the total is partial. */
  uncosted: number
}

// The order `canon/design/budget/` lists kinds in, with no kind last.
const KIND_ORDER: readonly (EntryKind | null)[] = [
  'food',
  'sights',
  'activity',
  'transport',
  'rest',
  null,
]

const DAY_MS = 86_400_000

function datesOf({ startsOn, endsOn }: Span): string[] {
  const end = Date.parse(`${endsOn}T00:00:00Z`)
  const dates: string[] = []
  for (
    let day = Date.parse(`${startsOn}T00:00:00Z`);
    day <= end;
    day += DAY_MS
  ) {
    dates.push(new Date(day).toISOString().slice(0, 10))
  }
  return dates
}

/** The sum of the entries' costs, or null when none of them carries one. */
export function sumCosts(entries: readonly Pick<Costed, 'costMinor'>[]) {
  const costs = entries.flatMap(({ costMinor }) =>
    costMinor === null ? [] : [costMinor],
  )
  return costs.length === 0 ? null : costs.reduce((sum, cost) => sum + cost, 0)
}

/**
 * A trip's estimated cost in its own currency's minor unit: the total, each
 * kind's share, and each trip day's share, an entry counting on the day it
 * starts even when it runs past midnight.
 */
export function tripBudget(trip: Span, entries: readonly Costed[]): TripBudget {
  const byKind = new Map<EntryKind | null, number>()
  const byDay = new Map(datesOf(trip).map((date) => [date, 0]))
  let totalMinor = 0
  let uncosted = 0
  for (const { kind, startsOn, costMinor } of entries) {
    if (costMinor === null) {
      uncosted += 1
      continue
    }
    totalMinor += costMinor
    byKind.set(kind, (byKind.get(kind) ?? 0) + costMinor)
    const onDay = byDay.get(startsOn)
    if (onDay !== undefined) byDay.set(startsOn, onDay + costMinor)
  }
  return {
    totalMinor,
    byKind: KIND_ORDER.flatMap((kind) => {
      const total = byKind.get(kind)
      return total === undefined ? [] : [{ kind, totalMinor: total }]
    }),
    byDay: [...byDay].map(([date, total]) => ({ date, totalMinor: total })),
    uncosted,
  }
}
