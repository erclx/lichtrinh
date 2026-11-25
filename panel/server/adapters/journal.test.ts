import { describe, expect, it } from 'vitest'

import type { ServiceId } from '../../services.ts'
import type { CommandResult } from '../run.ts'
import { ReadFailed } from '../run.ts'
import { createJournalReader } from './journal.ts'

const START = Date.parse('2031-11-22T14:06:00Z')
const NOW = new Date('2031-11-22T14:24:00Z')
const LOOK_BACK = Date.parse('2031-11-19T14:23:55Z') / 1000

interface RawLine {
  __CURSOR?: string
  MESSAGE: string | number[] | null
  SYSLOG_IDENTIFIER?: string
  _SYSTEMD_INVOCATION_ID?: string
}

/** The journal's own answer, given newest first and one second apart. */
function journal(...lines: RawLine[]): Partial<CommandResult> {
  const stdout = lines
    .map((line, index) =>
      JSON.stringify({
        __CURSOR: `line-${index}`,
        __REALTIME_TIMESTAMP: String((START - index * 1000) * 1000),
        _BOOT_ID: 'invented',
        ...line,
      }),
    )
    .join('\n')
  return { stdout: `${stdout}\n` }
}

function answering(result: Partial<CommandResult>) {
  const commands: string[][] = []
  return {
    commands,
    run: async (command: readonly string[]) => {
      commands.push([...command])
      return { code: 0, stdout: '', stderr: '', ...result }
    },
  }
}

const systemd = (MESSAGE: string): RawLine => ({
  MESSAGE,
  SYSLOG_IDENTIFIER: 'systemd',
})

/** A reader over a journal that answers each read in turn, then nothing. */
function following(...results: Partial<CommandResult>[]) {
  const clock = { now: NOW }
  const asked: string[] = []
  const reader = createJournalReader(
    async (command) => {
      asked.push(command.find((part) => part.startsWith('--since=')) ?? '')
      const next = results.shift() ?? { code: 1 }
      return { code: 0, stdout: '', stderr: '', ...next }
    },
    () => clock.now,
  )
  return {
    ...reader,
    asked,
    wait: (seconds: number) => {
      clock.now = new Date(clock.now.getTime() + seconds * 1000)
    },
  }
}

async function recentLines(
  run: ReturnType<typeof answering>['run'],
  service: ServiceId,
) {
  return createJournalReader(run, () => NOW).recentLines(service)
}

async function connectionEvents(result: Partial<CommandResult>) {
  const reader = createJournalReader(answering(result).run, () => NOW)
  return reader.connectionEvents('bridge', null)
}

async function texts(
  result: Partial<CommandResult>,
  service: ServiceId = 'voice',
) {
  const lines = await recentLines(answering(result).run, service)
  return lines.map((line) => [line.event, line.text])
}

describe('recentLines', () => {
  it('reads the user journal newest first, past the panel own health reads', async () => {
    const machine = answering({})

    await recentLines(machine.run, 'voice')

    expect(machine.commands).toEqual([
      [
        'journalctl',
        '--quiet',
        '--user',
        '--unit=lichtrinh-voice.service',
        `--since=@${LOOK_BACK}`,
        '--lines=60',
        '--reverse',
        '--output=json',
        '--output-fields=MESSAGE,SYSLOG_IDENTIFIER,_SYSTEMD_INVOCATION_ID',
        '--grep=^(?!.*GET /health)',
      ],
    ])
  })

  it('reads the system journal for the model', async () => {
    const machine = answering({})

    await recentLines(machine.run, 'model')

    expect(machine.commands[0]?.slice(0, 3)).toEqual([
      'journalctl',
      '--quiet',
      '--unit=ollama.service',
    ])
  })

  it('names an event with its ids and its duration', async () => {
    const result = journal({
      MESSAGE: '{"event":"turn_ended","turnId":"7f2e","ms":2400}',
    })

    const lines = await recentLines(answering(result).run, 'bridge')

    expect(lines).toEqual([
      {
        at: '2031-11-22T14:06:00.000Z',
        event: 'turn_ended',
        text: '7f2e 2400 ms',
      },
    ])
  })

  it.each([
    ['a crash trace', '  at connect (bridge/index.ts:81)'],
    ['broken JSON', '{"event":"ready"'],
    ['JSON naming no event', '{"turnId":"7f2e"}'],
    ['JSON that is no object', '42'],
  ])('shows %s as it is', async (_, message) => {
    expect(await texts(journal({ MESSAGE: message }), 'bridge')).toEqual([
      [null, message.trim()],
    ])
  })

  it('reads a message the journal answers as bytes, without its color', async () => {
    const colored = [...Buffer.from('\u001b[31mout of memory\u001b[0m')]

    expect(await texts(journal({ MESSAGE: colored }))).toEqual([
      [null, 'out of memory'],
    ])
  })

  it('says a line is too long where the journal answers none', async () => {
    expect(await texts(journal({ MESSAGE: null }))).toEqual([
      [null, 'A line too long to show'],
    ])
  })

  it('folds a restart limit into one line, so the reason stays in view', async () => {
    const result = journal(
      systemd('Failed to start lichtrinh-voice.service - Voice.'),
      systemd("lichtrinh-voice.service: Failed with result 'exit-code'."),
      systemd('lichtrinh-voice.service: Start request repeated too quickly.'),
      systemd(
        'lichtrinh-voice.service: Scheduled restart job, restart counter is at 3.',
      ),
      systemd("lichtrinh-voice.service: Failed with result 'exit-code'."),
      systemd(
        'lichtrinh-voice.service: Main process exited, code=exited, status=1/FAILURE',
      ),
      { MESSAGE: 'ERROR: address already in use' },
      systemd('Started lichtrinh-voice.service - Voice.'),
      systemd(
        'lichtrinh-voice.service: Scheduled restart job, restart counter is at 2.',
      ),
      systemd(
        'lichtrinh-voice.service: Main process exited, code=killed, status=9/KILL',
      ),
      { MESSAGE: 'a sixth line' },
    )

    const lines = await recentLines(answering(result).run, 'voice')

    expect(lines.map((line) => [line.event, line.text])).toEqual([
      ['failed', 'exit 1, restart limit reached'],
      [null, 'ERROR: address already in use'],
      [null, 'restart 2'],
      ['failed', 'killed 9/KILL'],
      [null, 'a sixth line'],
    ])
    expect(lines[0]?.at).toBe('2031-11-22T14:05:55.000Z')
  })

  it('shows a start no restart explains', async () => {
    const result = journal(
      systemd('Started lichtrinh-voice.service - Voice.'),
      systemd('Stopped lichtrinh-voice.service - Voice.'),
    )

    expect(await texts(result)).toEqual([
      ['started', ''],
      ['stopped', ''],
    ])
  })

  it('shows Ollama requests and named faults, and never another of its lines', async () => {
    const result = journal(
      {
        MESSAGE:
          '[GIN] 2031/11/22 - 14:21:09 | 200 |  1.131051264s |       127.0.0.1 | POST     "/api/chat"',
      },
      {
        MESSAGE:
          'time=2031-11-22T14:20:00 level=WARN source=server.go:1 msg="truncating input" prompt="an invented message"',
      },
      {
        MESSAGE:
          'time=2031-11-22T14:19:00 level=DEBUG msg="chat request" prompt="an invented message"',
      },
    )

    expect(await texts(result, 'model')).toEqual([
      [null, '/api/chat 200 1.131051264s'],
      [null, 'truncating input'],
    ])
  })

  it.each([
    ['empty output', { code: 1, stdout: '' }],
    ['a failed exit', { code: 1, stderr: 'No journal files were opened' }],
    ['output that is not JSON', { stdout: '-- No entries --\n' }],
  ])('reads no lines from %s', async (_, result) => {
    expect(await texts(result)).toEqual([])
  })
})

describe('following a log', () => {
  const line = (cursor: string, MESSAGE: string) =>
    journal({ __CURSOR: cursor, MESSAGE })

  it('scans only what came since the last read, a match or none', async () => {
    const log = following(line('a', 'an old line'), { code: 1 })

    await log.recentLines('voice')
    log.wait(3)
    await log.recentLines('voice')
    log.wait(3)
    await log.recentLines('voice')

    expect(log.asked).toEqual([
      `--since=@${LOOK_BACK}`,
      `--since=@${Date.parse('2031-11-22T14:23:55Z') / 1000}`,
      `--since=@${Date.parse('2031-11-22T14:23:58Z') / 1000}`,
    ])
  })

  it('keeps the lines a later read no longer covers, each once', async () => {
    const first = line('a', 'an old line')
    const log = following(first, first, { code: 1 })

    await log.recentLines('voice')
    await log.recentLines('voice')

    expect(await log.recentLines('voice')).toMatchObject([
      { text: 'an old line' },
    ])
  })

  it('puts a newer line ahead of the ones it kept', async () => {
    const newer = {
      stdout: JSON.stringify({
        __CURSOR: 'b',
        __REALTIME_TIMESTAMP: String((START + 1000) * 1000),
        MESSAGE: 'a new line',
      }),
    }
    const log = following(line('a', 'an old line'), newer)

    await log.recentLines('voice')

    expect(await log.recentLines('voice')).toMatchObject([
      { text: 'a new line' },
      { text: 'an old line' },
    ])
  })

  it('reads a span again after a fault that named itself', async () => {
    const log = following({ code: 1, stderr: 'Failed to open the journal' })

    await log.recentLines('voice')
    log.wait(3)
    await log.recentLines('voice')

    expect(log.asked[1]).toBe(`--since=@${LOOK_BACK + 3}`)
  })

  it('looks no further back than three days after a long wait', async () => {
    const log = following({ code: 1 })

    await log.recentLines('voice')
    log.wait(7 * 24 * 3600)
    await log.recentLines('voice')

    expect(log.asked[1]).toBe(`--since=@${LOOK_BACK + 7 * 24 * 3600}`)
  })

  it('fails a read that was cut, whatever part of it arrived', async () => {
    const cut = { ...line('a', 'a part of the log'), code: 127 }

    await expect(following(cut).recentLines('voice')).rejects.toThrow(
      ReadFailed,
    )
    await expect(
      following(cut).connectionEvents('bridge', null),
    ).rejects.toThrow(ReadFailed)
  })

  it('reads a bridge back to the start of a run older than its look back', async () => {
    const log = following()

    await log.connectionEvents('bridge', new Date('2031-11-01T08:00:00Z'))

    expect(log.asked).toEqual([
      `--since=@${Date.parse('2031-11-01T07:59:55Z') / 1000}`,
    ])
  })
})

describe('connectionEvents', () => {
  it('reads each event with its time and its run, newest first', async () => {
    const result = journal(
      {
        MESSAGE: '{"event":"closed","code":1006}',
        _SYSTEMD_INVOCATION_ID: 'run-2',
      },
      { MESSAGE: '{"event":"ready"}', _SYSTEMD_INVOCATION_ID: 'run-1' },
    )

    expect(await connectionEvents(result)).toEqual([
      {
        event: 'closed',
        at: new Date('2031-11-22T14:06:00Z'),
        invocationId: 'run-2',
      },
      {
        event: 'ready',
        at: new Date('2031-11-22T14:05:59Z'),
        invocationId: 'run-1',
      },
    ])
  })

  it('passes over a line that names another event', async () => {
    const result = journal({
      MESSAGE: 'a trace quoting "event":"ready"',
    })

    expect(await connectionEvents(result)).toEqual([])
  })
})
