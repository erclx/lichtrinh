const minutesPerDay = 24 * 60

function clock(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** Every half hour of the day as `HH:MM`, the choices behind an entry's Starts. */
export const startTimes: readonly string[] = Array.from(
  { length: minutesPerDay / 30 },
  (_, slot) => clock(slot * 30),
)

/** The lengths in minutes behind an entry's How long. */
export const lengths = [15, 30, 60, 90, 120, 180] as const

export interface EntryEnd {
  /** The clock time it ends as `HH:MM`. */
  time: string
  /** How many days after its start date it ends, 1 when it runs past midnight. */
  daysLater: number
}

/** Where an entry starting at `start` (`HH:MM`) ends after `minutes`. */
export function endFor(start: string, minutes: number): EntryEnd {
  const [hours, mins] = start.split(':').map(Number)
  const total = hours * 60 + mins + minutes
  return {
    time: clock(total % minutesPerDay),
    daysLater: Math.floor(total / minutesPerDay),
  }
}

/**
 * The How long choices, in minutes. An entry's own length joins them in order
 * when it is none of the six, since the assistant can set any length and an
 * edit must not drop it.
 */
export function lengthOptions(current?: number): number[] {
  const options: number[] = [...lengths]
  if (current === undefined || options.includes(current)) return options
  return [...options, current].sort((a, b) => a - b)
}
