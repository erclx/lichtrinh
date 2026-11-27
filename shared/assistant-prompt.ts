import { toolEntry } from './assistant-tools.ts'
import type { Language } from './auth.ts'
import type { TurnMessage } from './bridge-frames.ts'
import type { ChatRole } from './chats.ts'
import { minorDigits } from './currency.ts'
import type { Entry } from './entries.ts'
import type { Rate } from './rates.ts'
import { nowInZone, shiftClock } from './trip-time.ts'
import type { Trip } from './trips.ts'

/** How many earlier messages a turn sends, inside the 16,384-token alias. */
export const HISTORY_LENGTH = 20

// The only lines that name a language, so every rule below holds in both. A
// Vietnamese prompt changed by a word loses the eval score measured on it.
const OPENING: Record<Language, string> = {
  vi: `You are the planning assistant inside a shared trip calendar for a Vietnamese family.
The traveler writes in Vietnamese, often without diacritics. Read such text as the Vietnamese it stands for.
Reply in Vietnamese with full diacritics, in a few short sentences.`,
  en: `You are the planning assistant inside a shared trip calendar whose entries are in Vietnamese.
The traveler writes in English. Write every entry title and note in Vietnamese with full diacritics, since the whole family reads them.
Reply in English, in a few short sentences, whatever language earlier messages used.`,
}

const RULES = `What you answer:
- Answer questions about the plan from the trip and entries below, without calling a tool.
- Answer general travel questions, such as food, customs, and useful phrases, from your own knowledge.
- You have no internet access and what you know may be out of date. Say so plainly when it matters, and never invent live details such as prices, opening hours, or weather.
- When a request drifts far from the trip, answer politely in one sentence and steer back to the trip.

How you change the calendar:
- Change the calendar only through the tools, and only the entries listed below.
- Make a single change right away without asking for confirmation, since the traveler can undo it from the change card.
- Fill a missing detail with a sensible default and say in the reply what you chose. Leave start and end out when the traveler named no time, and the calendar takes the first free hour after the day's last entry.
- When the entry or the action is unclear, ask one short question and call no tool.
- When a message would remove several entries or a whole day, list what would go and ask for a yes before calling any tool.
- Keep proper names as the traveler wrote them, unless they match an entry, and then use the entry's title.
- After a change, confirm it in one short sentence.
- When a tool refuses, tell the traveler plainly and do not repeat the same call.`

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

export interface PromptInput {
  // The language the traveler writes and is answered in, never the entries'.
  language: Language
  trip: Trip
  entries: Entry[]
  // Earlier messages, oldest first, without the one being sent.
  history: { role: ChatRole; text: string }[]
  text: string
  at: Date
  // The admin's stored rates. Left out, the prompt says none is set.
  rates?: readonly Pick<Rate, 'from' | 'to' | 'rate'>[]
}

/**
 * The messages a turn sends the model: the instructions and the trip read
 * fresh for this turn, the recent history, and the new message last.
 */
export function buildPrompt(input: PromptInput): TurnMessage[] {
  const history = input.history
    .filter((message) => message.text.trim() !== '')
    .slice(-HISTORY_LENGTH)
    .map((message) => ({ role: message.role, content: message.text }))
  return [
    { role: 'system', content: systemText(input) },
    ...history,
    { role: 'user', content: input.text },
  ]
}

function systemText({ language, trip, entries, at, rates = [] }: PromptInput) {
  const digits = minorDigits(trip.currency)
  const now = nowInZone(at, trip.timeZone)
  const clock = `${String(Math.floor(now.minute / 60)).padStart(2, '0')}:${String(now.minute % 60).padStart(2, '0')}`
  const listed =
    entries.length === 0
      ? ['Entries: none yet']
      : [
          'Entries, one per line:',
          ...entries.map((e) => JSON.stringify(toolEntry(e, digits))),
        ]
  return [
    OPENING[language],
    '',
    RULES,
    '',
    `Trip: ${trip.name}, ${trip.startsOn} to ${trip.endsOn}, time zone ${trip.timeZone}, costs in ${trip.currency}`,
    ...homeLine(trip, rates),
    `Trip days: ${tripDays(trip).join(', ')}`,
    `Now in the trip time zone: ${now.date} ${weekday(now.date)} ${clock}`,
    ...listed,
  ].join('\n')
}

// The pair prints as the admin typed it, never inverted, since the inverse
// of a rate such as 25500 is a long decimal the model copies wrong.
function homeLine(trip: Trip, rates: NonNullable<PromptInput['rates']>) {
  const home = trip.homeCurrency
  if (home === trip.currency) return []
  const stored = rates.find(
    (each) =>
      (each.from === trip.currency && each.to === home) ||
      (each.from === home && each.to === trip.currency),
  )
  if (stored === undefined) {
    return [
      `Home currency ${home}, no rate set by the admin, so give no home total`,
    ]
  }
  return [
    `Home currency ${home}, rate set by the admin: 1 ${stored.from} = ${stored.rate} ${stored.to}, so home totals are approximate`,
  ]
}

function tripDays(trip: Trip) {
  const days: string[] = []
  let date = trip.startsOn
  while (date <= trip.endsOn) {
    days.push(`${date} ${weekday(date)}`)
    date = shiftClock({ date, time: '00:00' }, 24 * 60).date
  }
  return days
}

function weekday(date: string) {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
}
