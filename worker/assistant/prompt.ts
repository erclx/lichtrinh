import type { TurnMessage } from '@shared/bridge-frames.ts'
import type { ChatRole } from '@shared/chats.ts'
import { minorDigits } from '@shared/currency.ts'
import type { Entry } from '@shared/entries.ts'
import { nowInZone, shiftClock } from '@shared/trip-time.ts'
import type { Trip } from '@shared/trips.ts'

import { toolEntry } from './tools.ts'

/** How many earlier messages a turn sends, inside the 16,384-token alias. */
export const HISTORY_LENGTH = 20

const INSTRUCTIONS = `You are the planning assistant inside a shared trip calendar for a Vietnamese family.
The traveler writes in Vietnamese, often without diacritics. Read such text as the Vietnamese it stands for.
Reply in Vietnamese with full diacritics, in a few short sentences.

What you answer:
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
  trip: Trip
  entries: Entry[]
  // Earlier messages, oldest first, without the one being sent.
  history: { role: ChatRole; text: string }[]
  text: string
  at: Date
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

function systemText({ trip, entries, at }: PromptInput) {
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
    INSTRUCTIONS,
    '',
    `Trip: ${trip.name}, ${trip.startsOn} to ${trip.endsOn}, time zone ${trip.timeZone}, costs in ${trip.currency}`,
    `Trip days: ${tripDays(trip).join(', ')}`,
    `Now in the trip time zone: ${now.date} ${weekday(now.date)} ${clock}`,
    ...listed,
  ].join('\n')
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
