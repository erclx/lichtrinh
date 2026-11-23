// Scores an alias live on fixtures/requests.json, each ask with and without
// diacritics, through the real prompt and loop over an in-memory trip. Run by
// hand on the workspace PC after an Ollama upgrade or a model change.
import { parseArgs } from 'node:util'

import type { AssistantModel } from '@shared/assistant.ts'
import { assistantModel } from '@shared/assistant.ts'
import { buildPrompt } from '@shared/assistant-prompt.ts'
import type { Entry } from '@shared/entries.ts'
import type { Trip } from '@shared/trips.ts'

import { readOllamaUrl } from './config.ts'
import fixtures from './fixtures/requests.json' with { type: 'json' }
import { turnModel } from './ollama.ts'
import type { ToolCallFrame } from './turn.ts'
import { runTurn } from './turn.ts'

const PASS_AT = 26

interface Expect {
  action: string
  target?: string
  date?: string
  start?: string
  end?: string
  cost?: number
  keywords?: string[]
  mentions?: string[]
}

type Call = { name: string; args: Record<string, unknown> }

const ACTIONS: Record<string, string> = {
  add_entry: 'add',
  move_entry: 'move',
  update_entry: 'update',
  remove_entry: 'remove',
}

/** Text with its diacritics stripped, as the traveler often types it. */
function fold(text: string) {
  return text
    .toLowerCase()
    .replaceAll('đ', 'd')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
}

const stamp = {
  displayName: 'Eval',
  source: 'person',
  at: fixtures.trip.now,
} as const

const trip: Trip = {
  id: 'trip',
  name: fixtures.trip.name,
  startsOn: fixtures.trip.startsOn,
  endsOn: fixtures.trip.endsOn,
  timeZone: fixtures.trip.timeZone,
  currency: fixtures.trip.currency,
  homeCurrency: 'USD',
  version: 1,
}

const entries: Entry[] = fixtures.trip.entries.map((e) => ({
  id: e.id,
  tripId: trip.id,
  title: e.title,
  notes: null,
  kind: null,
  startsOn: e.date,
  startTime: e.start,
  endsOn: e.date,
  endTime: e.end,
  timeZone: trip.timeZone,
  costMinor: e.cost,
  version: 1,
  addedBy: stamp,
  changedBy: stamp,
}))

function misses(expect: Expect, calls: Call[], reply: string): string[] {
  const written = calls.filter((call) => call.name in ACTIONS)
  if (expect.action === 'answer') {
    if (written.length > 0) return ['called a tool for a question']
    return (expect.mentions ?? [])
      .filter((mention) => !fold(reply).includes(fold(mention)))
      .map((mention) => `mention:${mention}`)
  }
  if (expect.action === 'ask') {
    const landed = written.length > 0
    return [
      ...(landed ? ['changed before asking'] : []),
      ...(reply.includes('?') ? [] : ['no question']),
    ]
  }
  const [first] = written
  if (first === undefined) return ['no tool call']
  if (ACTIONS[first.name] !== expect.action) return [`action:${first.name}`]
  const target = entries.find((e) => e.id === first.args.entry_id)
  const current: Record<string, unknown> = {
    target: target?.id,
    date: target?.startsOn,
    start: target?.startTime,
    end: target?.endTime,
    cost: target?.costMinor,
  }
  const got: Record<string, unknown> = {
    ...first.args,
    target: first.args.entry_id,
  }
  const wrong = (['target', 'date', 'start', 'end', 'cost'] as const)
    .filter((field) => expect[field] !== undefined)
    .filter((field) => (got[field] ?? current[field]) !== expect[field])
    .map((field) => `${field}:${String(got[field] ?? current[field])}`)
  const title = fold(String(first.args.title ?? ''))
  const keywords = (expect.keywords ?? [])
    .filter((keyword) => !title.includes(fold(keyword)))
    .map((keyword) => `title:${keyword}`)
  return [...wrong, ...keywords]
}

async function runOne(host: string, model: AssistantModel, text: string) {
  const calls: Call[] = []
  let reply = ''
  let failed = ''
  const started = Date.now()
  const turn = runTurn(
    {
      type: 'turn',
      turnId: crypto.randomUUID(),
      model,
      messages: buildPrompt({
        trip,
        entries,
        history: [],
        text,
        at: new Date(fixtures.trip.now),
      }),
    },
    {
      model: turnModel(host),
      send: (frame) => {
        if (frame.type === 'final') reply = frame.text
        if (frame.type === 'failed') failed = frame.reason
      },
      callTool: async (frame: ToolCallFrame) => {
        const args = (frame.arguments ?? {}) as Record<string, unknown>
        calls.push({ name: frame.name, args })
        const id = String(args.entry_id ?? `new-${calls.length}`)
        return { ok: true, entry: { id, ...args } }
      },
    },
  )
  await turn.done
  return { calls, reply, failed, ms: Date.now() - started }
}

async function main() {
  const { values } = parseArgs({ options: { model: { type: 'string' } } })
  const model = assistantModel.parse(values.model ?? 'lichtrinh-assistant')
  const host = readOllamaUrl(process.env)
  let passed = 0
  let total = 0
  const times: number[] = []
  for (const request of fixtures.requests) {
    for (const [variant, text] of [
      ['marks', request.text],
      ['plain', fold(request.text)],
    ] as const) {
      const run = await runOne(host, model, text)
      const missed =
        run.failed === ''
          ? misses(request.expect, run.calls, run.reply)
          : [`failed:${run.failed}`]
      total += 1
      if (missed.length === 0) passed += 1
      times.push(run.ms)
      console.log(
        `${request.id} ${variant}: ${missed.length === 0 ? 'ok' : missed.join(', ')} (${(run.ms / 1000).toFixed(1)}s)`,
      )
    }
  }
  const median = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]
  console.log(
    `${model}: ${passed}/${total}, median ${(median / 1000).toFixed(1)}s a turn, passing at ${PASS_AT}`,
  )
  process.exit(passed >= PASS_AT ? 0 : 1)
}

await main()
