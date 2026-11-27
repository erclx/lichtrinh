import { describe, expect, it } from 'vitest'

import type { PromptInput } from './assistant-prompt.ts'
import { buildPrompt, HISTORY_LENGTH } from './assistant-prompt.ts'
import type { Entry } from './entries.ts'
import type { Trip } from './trips.ts'

const trip: Trip = {
  id: 'trip-1',
  name: 'Invented Coast Trip',
  startsOn: '2031-04-10',
  endsOn: '2031-04-12',
  timeZone: 'Asia/Ho_Chi_Minh',
  currency: 'USD',
  homeCurrency: 'VND',
  version: 1,
}

const stamp = {
  displayName: 'Invented Tester',
  source: 'person',
  at: '2031-04-01T00:00:00.000Z',
} as const

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-1',
    tripId: trip.id,
    title: 'Invented Harbor Walk',
    notes: null,
    kind: null,
    startsOn: '2031-04-11',
    startTime: '09:00',
    endsOn: '2031-04-11',
    endTime: '10:30',
    timeZone: trip.timeZone,
    costMinor: 1250,
    version: 3,
    addedBy: stamp,
    changedBy: stamp,
    ...overrides,
  }
}

function input(overrides: Partial<PromptInput> = {}): PromptInput {
  return {
    trip,
    entries: [entry()],
    history: [],
    language: 'vi',
    text: 'Invented request',
    // 09:05 on Friday 11 April in Ho Chi Minh City.
    at: new Date('2031-04-11T02:05:00Z'),
    ...overrides,
  }
}

function system(prompt: ReturnType<typeof buildPrompt>) {
  const [first] = prompt
  expect(first.role).toBe('system')
  return first.content
}

describe('buildPrompt, the turn context', () => {
  it('names now in the trip zone, not in UTC', () => {
    expect(system(buildPrompt(input()))).toContain(
      'Now in the trip time zone: 2031-04-11 Friday, Thứ Sáu, 09:05',
    )
  })

  it('lists every trip day with its weekday in English and Vietnamese', () => {
    expect(system(buildPrompt(input()))).toContain(
      'Trip days: 2031-04-10 Thursday, Thứ Năm; 2031-04-11 Friday, Thứ Sáu; 2031-04-12 Saturday, Thứ Bảy',
    )
  })

  it('names Sunday as Chủ Nhật rather than a numbered day', () => {
    const sunday = { ...trip, startsOn: '2031-04-13', endsOn: '2031-04-13' }

    expect(system(buildPrompt(input({ trip: sunday })))).toContain(
      'Trip days: 2031-04-13 Sunday, Chủ Nhật',
    )
  })

  it('lists each entry with its id and its cost in the trip currency', () => {
    expect(system(buildPrompt(input()))).toContain(
      '{"id":"entry-1","title":"Invented Harbor Walk","date":"2031-04-11","start":"09:00","end":"10:30","cost":12.5,"notes":null,"kind":null}',
    )
  })

  it('names the stored rate from the trip currency to home', () => {
    const rates = [{ from: 'USD', to: 'VND', rate: '25500' }]

    expect(system(buildPrompt(input({ rates })))).toContain(
      'Home currency VND, rate set by the admin: 1 USD = 25500 VND, so home totals are approximate',
    )
  })

  it('names a rate stored the other way round as the admin typed it', () => {
    const rates = [{ from: 'VND', to: 'USD', rate: '0.0000392' }]

    expect(system(buildPrompt(input({ rates })))).toContain(
      'rate set by the admin: 1 VND = 0.0000392 USD,',
    )
  })

  it('says no rate is set when no stored pair matches the trip', () => {
    const rates = [{ from: 'EUR', to: 'VND', rate: '27000' }]

    expect(system(buildPrompt(input({ rates })))).toContain(
      'Home currency VND, no rate set by the admin, so give no home total',
    )
  })

  it('names no home currency when the trip already costs in it', () => {
    const sameCurrency = { ...trip, homeCurrency: 'USD' }

    expect(
      system(buildPrompt(input({ trip: sameCurrency, rates: [] }))),
    ).not.toContain('Home currency')
  })

  it('says so when the trip has no entries yet', () => {
    expect(system(buildPrompt(input({ entries: [] })))).toContain(
      'Entries: none yet',
    )
  })

  it('sends the last 20 messages and then the new one', () => {
    const history = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      text: `message ${i}`,
    }))

    const prompt = buildPrompt(input({ history, text: 'the new one' }))

    expect(prompt).toHaveLength(1 + HISTORY_LENGTH + 1)
    expect(prompt[1]).toEqual({ role: 'assistant', content: 'message 5' })
    expect(prompt.at(-1)).toEqual({ role: 'user', content: 'the new one' })
  })

  it('leaves out a reply that broke off with no text', () => {
    const history = [
      { role: 'user' as const, text: 'first' },
      { role: 'assistant' as const, text: '' },
    ]

    const prompt = buildPrompt(input({ history }))

    expect(prompt.map((m) => m.content)).toEqual([
      expect.any(String),
      'first',
      'Invented request',
    ])
  })
})

describe('buildPrompt, the scope rules', () => {
  const rules = system(buildPrompt(input()))

  it('answers plan questions from the trip data without a tool', () => {
    expect(rules).toContain(
      'Answer questions about the plan from the trip and entries below, without calling a tool.',
    )
  })

  it('answers general travel questions from its own knowledge', () => {
    expect(rules).toContain(
      'Answer general travel questions, such as food, customs, and useful phrases, from your own knowledge.',
    )
  })

  it('says it has no internet and never invents live details', () => {
    expect(rules).toContain('You have no internet access')
    expect(rules).toContain(
      'never invent live details such as prices, opening hours, or weather',
    )
  })

  it('steers a far off-topic request back to the trip', () => {
    expect(rules).toContain('steer back to the trip')
  })
})

describe('buildPrompt, the approval rules', () => {
  const rules = system(buildPrompt(input()))

  it('makes a single change without asking', () => {
    expect(rules).toContain(
      'Make a single change right away without asking for confirmation',
    )
  })

  it('fills a missing time from the calendar and says so', () => {
    expect(rules).toContain(
      'Leave start and end out when the traveler named no time',
    )
    expect(rules).toContain('say in the reply what you chose')
  })

  it('asks one short question when the target or action is unclear', () => {
    expect(rules).toContain(
      'When the entry or the action is unclear, ask one short question and call no tool.',
    )
  })

  it('asks for a yes before removing several entries or a whole day', () => {
    expect(rules).toContain(
      'When a message would remove several entries or a whole day, list what would go and ask for a yes before calling any tool.',
    )
  })

  it('reads text without diacritics and keeps proper names as typed', () => {
    expect(rules).toContain('often without diacritics')
    expect(rules).toContain('Keep proper names as the traveler wrote them')
  })
})

describe('buildPrompt, the language', () => {
  const vietnamese = system(buildPrompt(input({ language: 'vi' }))).split('\n')
  const english = system(buildPrompt(input({ language: 'en' }))).split('\n')

  it('opens the Vietnamese prompt with the lines the eval was scored on', () => {
    expect(vietnamese.slice(0, 3)).toEqual([
      'You are the planning assistant inside a shared trip calendar for a Vietnamese family.',
      'The traveler writes in Vietnamese, often without diacritics. Read such text as the Vietnamese it stands for.',
      'Reply in Vietnamese with full diacritics, in a few short sentences.',
    ])
  })

  it('asks for an English reply whatever earlier messages used', () => {
    const rules = english.join('\n')

    expect(rules).toContain('Reply in English, in a few short sentences')
    expect(rules).toContain('whatever language earlier messages used')
    expect(rules).not.toContain('Reply in Vietnamese')
  })

  it('asks for Vietnamese titles and notes on an English account', () => {
    expect(english.join('\n')).toContain(
      'Write every entry title and note in Vietnamese with full diacritics',
    )
  })

  it('shares every rule and the whole trip between the two', () => {
    const rulesFrom = (lines: string[]) =>
      lines.slice(lines.indexOf('What you answer:'))

    expect(rulesFrom(english)).toEqual(rulesFrom(vietnamese))
    expect(rulesFrom(english).length).toBeGreaterThan(15)
  })
})
