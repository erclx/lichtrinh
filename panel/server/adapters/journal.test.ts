import { describe, expect, it } from 'vitest'

import { serviceOf } from '../../services.ts'
import type { CommandResult } from '../run.ts'
import { connectionEvents, recentLines } from './journal.ts'

const START = Date.parse('2031-11-22T14:06:00Z')

interface RawLine {
  MESSAGE: string | number[] | null
  SYSLOG_IDENTIFIER?: string
  _SYSTEMD_INVOCATION_ID?: string
}

/** The journal's own answer, given newest first and one second apart. */
function journal(...lines: RawLine[]): Partial<CommandResult> {
  const stdout = lines
    .map((line, index) =>
      JSON.stringify({
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

const voice = serviceOf('voice')
const bridge = serviceOf('bridge')
const model = serviceOf('model')

async function texts(result: Partial<CommandResult>, service = voice) {
  const lines = await recentLines(answering(result).run, service)
  return lines.map((line) => [line.event, line.text])
}

describe('recentLines', () => {
  it('reads the user journal newest first, past the panel own health reads', async () => {
    const machine = answering({})

    await recentLines(machine.run, voice)

    expect(machine.commands).toEqual([
      [
        'journalctl',
        '--user',
        '--unit=lichtrinh-voice.service',
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

    await recentLines(machine.run, model)

    expect(machine.commands[0]?.slice(0, 2)).toEqual([
      'journalctl',
      '--unit=ollama.service',
    ])
  })

  it('names an event with its ids and its duration', async () => {
    const result = journal({
      MESSAGE: '{"event":"turn_ended","turnId":"7f2e","ms":2400}',
    })

    const lines = await recentLines(answering(result).run, bridge)

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
    expect(await texts(journal({ MESSAGE: message }), bridge)).toEqual([
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

    const lines = await recentLines(answering(result).run, voice)

    expect(lines.map((line) => [line.event, line.text])).toEqual([
      ['failed', 'exit 1, restart limit reached'],
      [null, 'ERROR: address already in use'],
      ['started', ''],
      [null, 'restart 2'],
      ['failed', 'killed 9/KILL'],
    ])
    expect(lines[0]?.at).toBe('2031-11-22T14:05:58.000Z')
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

    expect(await texts(result, model)).toEqual([
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

describe('connectionEvents', () => {
  it('reads each event with its time and its run, newest first', async () => {
    const result = journal(
      {
        MESSAGE: '{"event":"closed","code":1006}',
        _SYSTEMD_INVOCATION_ID: 'run-2',
      },
      { MESSAGE: '{"event":"ready"}', _SYSTEMD_INVOCATION_ID: 'run-1' },
    )

    expect(await connectionEvents(answering(result).run, bridge)).toEqual([
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

    expect(await connectionEvents(answering(result).run, bridge)).toEqual([])
  })
})
