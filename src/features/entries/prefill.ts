import { type Entry, firstFreeHour } from '@shared/entries.ts'

export interface Prefill {
  /** `HH:MM`, always one of the half-hour start times. */
  startTime: string
  minutes: number
}

/**
 * Where a new entry on a day starts, for one hour. The start is the rule the
 * assistant's tool reads too, so a hand add and an assistant add agree.
 */
export function prefillFor(dayEntries: Entry[]): Prefill {
  return { startTime: firstFreeHour(dayEntries), minutes: 60 }
}
