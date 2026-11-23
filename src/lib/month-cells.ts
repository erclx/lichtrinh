export interface MonthCell {
  /** The calendar day as `YYYY-MM-DD`, with no time or zone attached. */
  date: string
  /** False for the days of the months before and after that fill the first and last week. */
  inMonth: boolean
}

const dayMs = 86_400_000

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * The weeks of one month, Monday first, each a row of seven cells. The range
 * sheet and the calendar both lay out from this shape, so a change to it breaks
 * both. `month` runs 1 to 12, as in the date string.
 */
export function monthCells(year: number, month: number): MonthCell[][] {
  // UTC midnight on every day, so no daylight saving shift moves a cell.
  const first = Date.UTC(year, month - 1, 1)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const leading = (new Date(first).getUTCDay() + 6) % 7
  const weekCount = Math.ceil((leading + daysInMonth) / 7)
  const start = first - leading * dayMs

  return Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const index = week * 7 + weekday
      return {
        date: isoDate(start + index * dayMs),
        inMonth: index >= leading && index < leading + daysInMonth,
      }
    }),
  )
}
