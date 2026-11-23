const dayMs = 86_400_000

/** Every `YYYY-MM-DD` date from `from` to `to`, both included. */
export function datesBetween(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  const dates: string[] = []
  for (let day = start; day <= end; day += dayMs) {
    dates.push(new Date(day).toISOString().slice(0, 10))
  }
  return dates
}

/** How many days a span covers, both ends included. */
export function daysIn(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / dayMs) + 1
}

/** Whole days from `from` until `to`, negative when `to` came first. */
export function daysUntil(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / dayMs)
}
