import { z } from 'zod'

import type { Entry } from './entries.ts'
import { clockTime, localDate } from './trip-time.ts'

// The four calendar tools the model may call, and nothing else. Every tool
// acts on the chat's own trip, so none takes a trip id, and the Worker runs
// each call as the chat's owner. Argument names are snake_case because the
// scored harness offered them that way.

const entryId = z
  .string()
  .min(1)
  .describe('The id of an entry listed in the trip')
const title = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .describe('Short title in Vietnamese with full diacritics')
const date = localDate.describe('YYYY-MM-DD, a day of the trip')
const time = clockTime.describe('HH:MM, 24-hour')
const cost = z
  .number()
  .min(0)
  .max(1e12)
  .describe('Estimated cost in the trip currency, as a plain number')
const notes = z.string().trim().max(2000).describe('A short description')

export const addEntryArgs = z.strictObject({
  title,
  date,
  // Left out, they take the first free hour and run one hour, which the
  // result names so the reply can say so.
  start: time
    .optional()
    .describe('HH:MM, 24-hour. Leave out when the traveler named no time'),
  end: time
    .optional()
    .describe('HH:MM, 24-hour. Leave out when the traveler named no end'),
  cost: cost.optional(),
  notes: notes.optional(),
})

export const moveEntryArgs = z
  .strictObject({
    entry_id: entryId,
    date: date.optional(),
    start: time.optional(),
    end: time.optional(),
  })
  .refine(
    (args) => [args.date, args.start, args.end].some((v) => v !== undefined),
    { message: 'Name a new date, start, or end' },
  )

export const updateEntryArgs = z
  .strictObject({
    entry_id: entryId,
    title: title.optional(),
    cost: cost.nullable().optional(),
    notes: notes.nullable().optional(),
  })
  .refine(
    (args) => [args.title, args.cost, args.notes].some((v) => v !== undefined),
    { message: 'Name a title, cost, or notes to change' },
  )

export const removeEntryArgs = z.strictObject({ entry_id: entryId })

const TOOLS = {
  add_entry: {
    description: 'Add an entry to the trip calendar.',
    args: addEntryArgs,
  },
  move_entry: {
    description:
      'Move an existing entry to a new date or time. An omitted end keeps its length.',
    args: moveEntryArgs,
  },
  update_entry: {
    description:
      'Change the title, cost, or notes of an existing entry. A null cost or notes clears it.',
    args: updateEntryArgs,
  },
  remove_entry: {
    description: 'Remove an existing entry.',
    args: removeEntryArgs,
  },
} as const

export type ToolName = keyof typeof TOOLS

export type ToolCall = {
  [N in ToolName]: { name: N; args: z.output<(typeof TOOLS)[N]['args']> }
}[ToolName]

export const toolName = z.enum(Object.keys(TOOLS) as [ToolName, ...ToolName[]])

/** A tool as Ollama's chat API takes it, with its JSON Schema. */
export interface OfferedTool {
  type: 'function'
  function: {
    name: ToolName
    description: string
    parameters: {
      type: 'object'
      required?: string[]
      properties?: Record<string, { type?: string; description?: string }>
    }
  }
}

export const assistantTools: OfferedTool[] = toolName.options.map((name) => {
  const { $schema: _, ...parameters } = z.toJSONSchema(TOOLS[name].args, {
    io: 'input',
  })
  return {
    type: 'function',
    function: {
      name,
      description: TOOLS[name].description,
      parameters: parameters as OfferedTool['function']['parameters'],
    },
  }
})

export type ParsedToolCall =
  | { ok: true; call: ToolCall }
  | { ok: false; error: 'unknown_tool' | 'invalid_arguments' }

/**
 * A tool call the model made, parsed against its schema. The bridge parses
 * to answer the model without a round trip, and the Worker parses again,
 * since what the socket carries is input to it.
 */
export function parseToolCall(name: string, args: unknown): ParsedToolCall {
  const known = toolName.safeParse(name)
  if (!known.success) return { ok: false, error: 'unknown_tool' }
  const parsed = TOOLS[known.data].args.safeParse(args)
  if (!parsed.success) return { ok: false, error: 'invalid_arguments' }
  return { ok: true, call: { name: known.data, args: parsed.data } as ToolCall }
}

/** An entry as the model reads it back, its cost in the trip currency. */
export type ToolEntry = {
  id: string
  title: string
  date: string
  start: string
  end: string
  cost: number | null
  notes: string | null
}

export function toolEntry(entry: Entry, digits: number): ToolEntry {
  return {
    id: entry.id,
    title: entry.title,
    date: entry.startsOn,
    start: entry.startTime,
    end: entry.endTime,
    cost: entry.costMinor === null ? null : entry.costMinor / 10 ** digits,
    notes: entry.notes,
  }
}
