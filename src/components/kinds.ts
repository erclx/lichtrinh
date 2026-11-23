import type { EntryKind } from '@shared/changes.ts'

/**
 * Each kind's pastel fill and ink, written out whole so Tailwind finds every
 * class. A pastel names a kind and nothing else, per `canon/DESIGN.md`, so an
 * entry of no kind takes the neutral `none` tone.
 */
export const kindTone: Record<EntryKind | 'none', string> = {
  food: 'bg-food text-food-ink',
  sights: 'bg-sights text-sights-ink',
  rest: 'bg-rest text-rest-ink',
  transport: 'bg-transport text-transport-ink',
  activity: 'bg-activity text-activity-ink',
  none: 'bg-muted text-muted-foreground',
}

/** Each kind's label key. `entries.activity` names an entry, so the kind takes its own. */
export const kindLabelKey = {
  food: 'entries.food',
  sights: 'entries.sights',
  rest: 'entries.rest',
  transport: 'entries.transport',
  activity: 'entries.activityKind',
} as const satisfies Record<EntryKind, string>
