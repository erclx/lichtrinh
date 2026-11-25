import { stripVTControlCharacters } from 'node:util'

import { z } from 'zod'

import type { Service, ServiceId } from '../../services.ts'
import { serviceOf } from '../../services.ts'
import type { LogLine } from '../../state.ts'
import type { Run } from '../run.ts'
import { NOT_STARTED, ReadFailed } from '../run.ts'

const LINES = 5
// systemd writes several lines per crash, so five shown take more read.
const READ_LINES = 60
// How far the first read looks back, since journalctl scans every line
// between and the health reads it passes over never end.
const LOOK_BACK_MS = 3 * 24 * 60 * 60_000
// Covers a line the journal took in after a read ended.
const OVERLAP_MS = 5_000

/** Voice logs each health read, the panel's own every few seconds. */
const OWN_LINES = '^(?!.*GET /health)'
/** Ollama at a debug level logs prompts, so its lines pass an allow list. */
const OLLAMA_LINES =
  'POST +"/api/(chat|generate)"|level=(WARN|ERROR) |^ollama\\.service: |^St(art|opp)ed '
const CONNECTION_EVENTS = '"event":"(connecting|ready|closed)"'

// The journal answers bytes for a message holding a control character, and
// null for one too long to print.
const journalEntry = z.object({
  __CURSOR: z.string(),
  __REALTIME_TIMESTAMP: z.string().regex(/^\d+$/),
  MESSAGE: z.union([z.string(), z.array(z.int()), z.null()]),
  SYSLOG_IDENTIFIER: z.string().optional(),
  _SYSTEMD_INVOCATION_ID: z.string().optional(),
})

interface Entry {
  cursor: string
  /** Microseconds, as the journal counts them. */
  time: number
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

/** Each service's log, read once and then followed from the last read. */
export function createJournalReader(run: Run, now: () => Date) {
  const follow = (id: ServiceId, grep: string) =>
    follower(run, now, serviceOf(id), grep)
  const lines: Record<ServiceId, Follow> = {
    voice: follow('voice', OWN_LINES),
    model: follow('model', OLLAMA_LINES),
    bridge: follow('bridge', OWN_LINES),
    staging: follow('staging', OWN_LINES),
  }
  const connections = {
    bridge: follow('bridge', CONNECTION_EVENTS),
    staging: follow('staging', CONNECTION_EVENTS),
  }
  return {
    /** The last five lines of one service's unit, newest first. */
    recentLines: async (id: ServiceId): Promise<LogLine[]> =>
      readLines(serviceOf(id), await lines[id](null)),
    /** A bridge's last connection events, newest first, back to its run. */
    connectionEvents: async (
      id: 'bridge' | 'staging',
      runSince: Date | null,
    ): Promise<ConnectionEvent[]> =>
      (await connections[id](runSince)).flatMap(connectionEvent),
  }
}

function readLines(service: Service, entries: readonly Entry[]): LogLine[] {
  const lines: LogLine[] = []
  let pastLimit = false
  for (const [index, entry] of entries.entries()) {
    if (entry.fromSystemd) {
      if (entry.message.includes('Start request repeated too quickly')) {
        pastLimit = true
        continue
      }
      // The restart the limit refused never ran.
      if (pastLimit && isRestart(entry)) continue
      // A restart's own line says it started.
      const before = entries[index + 1]
      if (isStart(entry) && before !== undefined && isRestart(before)) continue
      const line = systemdLine(entry, pastLimit)
      if (line === null) continue
      if (line.event === 'failed') pastLimit = false
      lines.push(line)
      continue
    }
    const line =
      service.manager === 'system' ? ollamaLine(entry) : ownLine(entry)
    if (line !== null) lines.push(line)
  }
  return lines.slice(0, LINES)
}

function connectionEvent(entry: Entry): ConnectionEvent[] {
  const event = readEvent(entry.message)?.event
  if (event !== 'connecting' && event !== 'ready' && event !== 'closed') {
    return []
  }
  return [{ event, at: new Date(entry.at), invocationId: entry.invocationId }]
}

/** Matching entries newest first, from a time or as far as a first read goes. */
type Follow = (from: Date | null) => Promise<readonly Entry[]>

function follower(
  run: Run,
  now: () => Date,
  service: Service,
  grep: string,
): Follow {
  let readTo = -Infinity
  let kept: Entry[] = []

  return async (from) => {
    const asked = now().getTime()
    const start = Math.max(readTo, from?.getTime() ?? asked - LOOK_BACK_MS)
    const result = await run(command(service, grep, start - OVERLAP_MS))
    // A cut read holds some of the log, with no word on which.
    if (result.code === NOT_STARTED) {
      throw new ReadFailed(`journalctl exited ${result.code}`)
    }
    // No match exits 1 too and says nothing, where a fault names itself.
    if (result.code === 0 || result.stderr === '') readTo = asked
    kept = merge(parse(result.stdout), kept)
    return kept
  }
}

function merge(fresh: readonly Entry[], kept: readonly Entry[]): Entry[] {
  const byCursor = new Map(
    [...fresh, ...kept].map((entry) => [entry.cursor, entry]),
  )
  // Two reads may end out of order, and lines of one time keep theirs.
  return [...byCursor.values()]
    .sort((one, other) => other.time - one.time)
    .slice(0, READ_LINES)
}

function command(service: Service, grep: string, fromMs: number) {
  return [
    'journalctl',
    '--quiet',
    ...(service.manager === 'user' ? ['--user'] : []),
    `--unit=${service.unit}`,
    `--since=@${Math.floor(fromMs / 1000)}`,
    `--lines=${READ_LINES}`,
    '--reverse',
    '--output=json',
    '--output-fields=MESSAGE,SYSLOG_IDENTIFIER,_SYSTEMD_INVOCATION_ID',
    `--grep=${grep}`,
  ]
}

function parse(stdout: string): Entry[] {
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
    const time = Number(parsed.data.__REALTIME_TIMESTAMP)
    return [
      {
        cursor: parsed.data.__CURSOR,
        time,
        at: new Date(time / 1000).toISOString(),
        message: stripVTControlCharacters(text).trim(),
        fromSystemd: parsed.data.SYSLOG_IDENTIFIER === 'systemd',
        invocationId: parsed.data._SYSTEMD_INVOCATION_ID ?? null,
      },
    ]
  })
}

function isRestart({ fromSystemd, message }: Entry) {
  return fromSystemd && message.includes('Scheduled restart')
}

function isStart({ fromSystemd, message }: Entry) {
  return fromSystemd && message.startsWith('Started ')
}

/** One of systemd's own lines, or null for a step that says nothing new. */
function systemdLine(entry: Entry, pastLimit: boolean): LogLine | null {
  const { at, message } = entry
  const exited = /Main process exited, code=(\w+), status=(\S+)/.exec(message)
  if (exited !== null) {
    const [, code, status = ''] = exited
    const how =
      code === 'exited' ? `exit ${parseInt(status, 10)}` : `${code} ${status}`
    const text = pastLimit ? `${how}, restart limit reached` : how
    return { at, event: 'failed', text }
  }
  const restart = /restart counter is at (\d+)/.exec(message)
  if (restart !== null)
    return { at, event: null, text: `restart ${restart[1]}` }
  if (isStart(entry)) return { at, event: 'started', text: '' }
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
