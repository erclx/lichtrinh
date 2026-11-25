import { stripVTControlCharacters } from 'node:util'

import { z } from 'zod'

import type { Service } from '../../services.ts'
import type { LogLine } from '../../state.ts'
import type { Run } from '../run.ts'

const LINES = 5
// systemd writes several lines per crash, so five shown take more read.
const READ_LINES = 60

/** Voice logs each health read, the panel's own every few seconds. */
const OWN_LINES = '^(?!.*GET /health)'
/** Ollama at a debug level logs prompts, so its lines pass an allow list. */
const OLLAMA_LINES =
  'POST +"/api/(chat|generate)"|level=(WARN|ERROR) |^ollama\\.service: |^St(art|opp)ed '
const CONNECTION_EVENTS = '"event":"(connecting|ready|closed)"'

// The journal answers bytes for a message holding a control character, and
// null for one too long to print.
const journalEntry = z.object({
  __REALTIME_TIMESTAMP: z.string().regex(/^\d+$/),
  MESSAGE: z.union([z.string(), z.array(z.int()), z.null()]),
  SYSLOG_IDENTIFIER: z.string().optional(),
  _SYSTEMD_INVOCATION_ID: z.string().optional(),
})

interface Entry {
  at: string
  message: string
  fromSystemd: boolean
  invocationId: string | null
}

export interface ConnectionEvent {
  event: 'connecting' | 'ready' | 'closed'
  at: Date
  invocationId: string | null
}

/** The last five lines of one service's unit, newest first. */
export async function recentLines(
  run: Run,
  service: Service,
): Promise<LogLine[]> {
  const entries = await read(
    run,
    service,
    service.manager === 'system' ? OLLAMA_LINES : OWN_LINES,
  )
  const lines: LogLine[] = []
  let limit: string | undefined
  for (const entry of entries) {
    if (entry.fromSystemd) {
      if (entry.message.includes('Start request repeated too quickly')) {
        limit = entry.at
        continue
      }
      // The restart the limit refused never ran.
      if (limit !== undefined && entry.message.includes('Scheduled restart')) {
        continue
      }
      const line = systemdLine(entry, limit)
      if (line === null) continue
      if (line.event === 'failed') limit = undefined
      lines.push(line)
      continue
    }
    const line =
      service.manager === 'system' ? ollamaLine(entry) : ownLine(entry)
    if (line !== null) lines.push(line)
  }
  return lines.slice(0, LINES)
}

/** A bridge's last connection events, newest first, across its runs. */
export async function connectionEvents(
  run: Run,
  service: Service,
): Promise<ConnectionEvent[]> {
  const entries = await read(run, service, CONNECTION_EVENTS)
  return entries.flatMap((entry) => {
    const event = readEvent(entry.message)?.event
    if (event !== 'connecting' && event !== 'ready' && event !== 'closed') {
      return []
    }
    return [{ event, at: new Date(entry.at), invocationId: entry.invocationId }]
  })
}

async function read(
  run: Run,
  service: Service,
  grep: string,
): Promise<Entry[]> {
  const { stdout } = await run([
    'journalctl',
    ...(service.manager === 'user' ? ['--user'] : []),
    `--unit=${service.unit}`,
    `--lines=${READ_LINES}`,
    '--reverse',
    '--output=json',
    '--output-fields=MESSAGE,SYSLOG_IDENTIFIER,_SYSTEMD_INVOCATION_ID',
    `--grep=${grep}`,
  ])
  return stdout.split('\n').flatMap((line) => {
    const parsed = journalEntry.safeParse(parseJson(line))
    if (!parsed.success) return []
    const { MESSAGE: message } = parsed.data
    const text =
      typeof message === 'string'
        ? message
        : message === null
          ? 'A line too long to show'
          : Buffer.from(message).toString('utf8')
    return [
      {
        at: new Date(
          Number(parsed.data.__REALTIME_TIMESTAMP) / 1000,
        ).toISOString(),
        message: stripVTControlCharacters(text).trim(),
        fromSystemd: parsed.data.SYSLOG_IDENTIFIER === 'systemd',
        invocationId: parsed.data._SYSTEMD_INVOCATION_ID ?? null,
      },
    ]
  })
}

/** One of systemd's own lines, or null for a step that says nothing new. */
function systemdLine(entry: Entry, limit: string | undefined): LogLine | null {
  const { at, message } = entry
  const exited = /Main process exited, code=(\w+), status=(\S+)/.exec(message)
  if (exited !== null) {
    const [, code, status = ''] = exited
    const how =
      code === 'exited' ? `exit ${parseInt(status, 10)}` : `${code} ${status}`
    return limit === undefined
      ? { at, event: 'failed', text: how }
      : { at: limit, event: 'failed', text: `${how}, restart limit reached` }
  }
  const restart = /restart counter is at (\d+)/.exec(message)
  if (restart !== null)
    return { at, event: null, text: `restart ${restart[1]}` }
  if (/^Started /.test(message)) return { at, event: 'started', text: '' }
  if (/^Stopped /.test(message)) return { at, event: 'stopped', text: '' }
  return null
}

/** A line of the bridge or of voice. One that names no event stays as it is. */
function ownLine({ at, message }: Entry): LogLine | null {
  if (message === '') return null
  const named = readEvent(message)
  if (named === null) return { at, event: null, text: message }
  const text = Object.entries(named.fields)
    .map(([name, value]) => (name === 'ms' ? `${value} ms` : `${value}`))
    .join(' ')
  return { at, event: named.event, text }
}

/** A request Ollama ended or a fault it named, or null for any other line. */
function ollamaLine({ at, message }: Entry): LogLine | null {
  const request =
    /^\[GIN\].*\| (\d+) \|\s+(\S+) \|.*POST\s+"(\/api\/(?:chat|generate))"/.exec(
      message,
    )
  if (request !== null) {
    const [, status, took, path] = request
    return { at, event: null, text: `${path} ${status} ${took}` }
  }
  const fault =
    /level=(?:WARN|ERROR) .*?msg=(?:"((?:[^"\\]|\\.)*)"|(\S+))/.exec(message)
  if (fault === null) return null
  return { at, event: null, text: fault[1] ?? fault[2] ?? '' }
}

const eventLine = z
  .object({ event: z.string() })
  .catchall(z.union([z.string(), z.number(), z.boolean()]))

function readEvent(message: string) {
  const parsed = eventLine.safeParse(parseJson(message))
  if (!parsed.success) return null
  const { event, ...fields } = parsed.data
  return { event, fields }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
