import type { TurnMessage, UpFrame } from '@shared/bridge-frames.ts'
import { describe, expect, it } from 'vitest'

import type { Round } from './fixtures/fake-model.ts'
import { calls, fakeModel, text, thought } from './fixtures/fake-model.ts'
import type { ToolCallFrame } from './turn.ts'
import { runTurn } from './turn.ts'

const ADD = { title: 'Ăn trưa ở bến tàu', date: '2031-04-11', start: '12:00' }

function turnFrame(messages: TurnMessage[] = [], removalAsked = false) {
  return {
    type: 'turn' as const,
    turnId: 'turn-1',
    model: 'lichtrinh-assistant' as const,
    messages: [
      { role: 'system' as const, content: 'Invented instructions' },
      ...messages,
      { role: 'user' as const, content: 'them an trua o ben tau luc 12 gio' },
    ],
    removalAsked,
  }
}

/** Runs a turn against scripted rounds, answering every tool call `ok`. */
async function run(
  rounds: Round[],
  options: {
    messages?: TurnMessage[]
    removalAsked?: boolean
    timeoutMs?: number
  } = {},
) {
  const fake = fakeModel(rounds)
  const sent: UpFrame[] = []
  const called: ToolCallFrame[] = []
  const turn = runTurn(
    turnFrame(options.messages, options.removalAsked),
    {
      model: fake.model,
      send: (frame) => sent.push(frame),
      callTool: async (frame) => {
        called.push(frame)
        return { ok: true, entry: { id: `entry-${called.length}` } }
      },
    },
    { timeoutMs: options.timeoutMs },
  )
  await turn.done
  return { ...fake, sent, called }
}

describe('a turn with no tool call', () => {
  it('streams each piece of text up and ends on final with the whole reply', async () => {
    const { sent } = await run([
      [thought('the traveler asks'), text('Chào '), text('bạn.')],
    ])

    expect(sent).toEqual([
      { type: 'delta', turnId: 'turn-1', text: 'Chào ' },
      { type: 'delta', turnId: 'turn-1', text: 'bạn.' },
      {
        type: 'final',
        turnId: 'turn-1',
        text: 'Chào bạn.',
        heldRemoval: false,
      },
    ])
  })

  it('asks its one short question and changes nothing when the request is unclear', async () => {
    const { sent, called } = await run([[text('Bạn muốn dời lịch nào?')]])

    expect(called).toEqual([])
    expect(sent.at(-1)).toEqual({
      type: 'final',
      turnId: 'turn-1',
      text: 'Bạn muốn dời lịch nào?',
      heldRemoval: false,
    })
  })

  it('fails with empty_reply when the model says nothing at all', async () => {
    const { sent } = await run([[thought('hmm'), text('')]])

    expect(sent).toEqual([
      { type: 'failed', turnId: 'turn-1', reason: 'empty_reply' },
    ])
  })
})

describe('a turn with tool calls', () => {
  it('sends the call up, never runs it, and returns the result to the model', async () => {
    const { called, requests, sent } = await run([
      [thought('add it'), calls({ name: 'add_entry', arguments: ADD })],
      [text('Đã thêm.')],
    ])

    expect(called).toEqual([
      {
        type: 'tool_call',
        turnId: 'turn-1',
        callId: expect.any(String),
        name: 'add_entry',
        arguments: ADD,
      },
    ])
    expect(requests[1].messages.slice(-2)).toEqual([
      {
        role: 'assistant',
        content: '',
        thinking: 'add it',
        tool_calls: [{ function: { name: 'add_entry', arguments: ADD } }],
      },
      {
        role: 'tool',
        tool_name: 'add_entry',
        content: JSON.stringify({ ok: true, entry: { id: 'entry-1' } }),
      },
    ])
    expect(sent.at(-1)).toEqual({
      type: 'final',
      turnId: 'turn-1',
      text: 'Đã thêm.',
      heldRemoval: false,
    })
  })

  it('sends two calls of one round up in order and answers both', async () => {
    const second = { ...ADD, title: 'Đi chợ đêm', start: '19:00' }
    const { called, requests } = await run([
      [
        calls(
          { name: 'add_entry', arguments: ADD },
          { name: 'add_entry', arguments: second },
        ),
      ],
      [text('Đã thêm hai lịch.')],
    ])

    expect(called.map((frame) => frame.arguments)).toEqual([ADD, second])
    expect(requests[1].messages.filter((m) => m.role === 'tool')).toHaveLength(
      2,
    )
  })

  it('answers arguments failing the schema itself and sends nothing up', async () => {
    const { called, requests } = await run([
      [
        calls({
          name: 'add_entry',
          arguments: { title: 'x', date: 'thứ năm' },
        }),
      ],
      [text('Bạn muốn ngày nào?')],
    ])

    expect(called).toEqual([])
    expect(requests[1].messages.at(-1)).toEqual({
      role: 'tool',
      tool_name: 'add_entry',
      content: JSON.stringify({ ok: false, error: 'invalid_arguments' }),
    })
  })

  it('offers the model the four calendar tools on every round', async () => {
    const { requests } = await run([
      [calls({ name: 'add_entry', arguments: ADD })],
      [text('Đã thêm.')],
    ])

    for (const request of requests) {
      expect(request.tools.map((tool) => tool.function.name)).toEqual([
        'add_entry',
        'move_entry',
        'update_entry',
        'remove_entry',
      ])
    }
  })

  it('stops at six rounds with step_cap', async () => {
    const { requests, sent } = await run([
      [calls({ name: 'add_entry', arguments: ADD })],
    ])

    expect(requests).toHaveLength(6)
    expect(sent.at(-1)).toEqual({
      type: 'failed',
      turnId: 'turn-1',
      reason: 'step_cap',
    })
  })
})

describe('removing several entries', () => {
  const removeTwo = calls(
    { name: 'remove_entry', arguments: { entry_id: 'e1' } },
    { name: 'remove_entry', arguments: { entry_id: 'e2' } },
  )

  it('refuses a removal of several with no yes and asks first', async () => {
    const { called, requests, sent } = await run([
      [removeTwo],
      [text('Xóa cả hai lịch ngày thứ bảy nhé?')],
    ])

    expect(called).toEqual([])
    const answers = requests[1].messages.filter((m) => m.role === 'tool')
    expect(answers.map((m) => JSON.parse(m.content).error)).toEqual([
      'confirm_first',
      'confirm_first',
    ])
    expect(sent.at(-1)).toMatchObject({ type: 'final', heldRemoval: true })
  })

  it('refuses a second removal in a later round of the same turn', async () => {
    const { called } = await run([
      [calls({ name: 'remove_entry', arguments: { entry_id: 'e1' } })],
      [calls({ name: 'remove_entry', arguments: { entry_id: 'e2' } })],
      [text('Xóa luôn lịch còn lại nhé?')],
    ])

    expect(called.map((frame) => frame.arguments)).toEqual([{ entry_id: 'e1' }])
  })

  it('removes several in the turn after the guard held them for a yes', async () => {
    const { called, sent } = await run([[removeTwo], [text('Đã xóa.')]], {
      messages: [
        { role: 'user', content: 'xoa het lich thu bay' },
        { role: 'assistant', content: 'Xóa cả hai lịch ngày thứ bảy nhé?' },
      ],
      removalAsked: true,
    })

    expect(called.map((frame) => frame.arguments)).toEqual([
      { entry_id: 'e1' },
      { entry_id: 'e2' },
    ])
    expect(sent.at(-1)).toMatchObject({ type: 'final', heldRemoval: false })
  })

  it('still holds several removals after a reply that asked something else', async () => {
    const { called } = await run(
      [[removeTwo], [text('Xóa cả hai lịch ngày thứ bảy nhé?')]],
      {
        messages: [
          { role: 'user', content: 'them an trua' },
          { role: 'assistant', content: 'Bạn cần gì nữa không?' },
        ],
      },
    )

    expect(called).toEqual([])
  })

  it('removes a single entry without asking', async () => {
    const { called } = await run([
      [calls({ name: 'remove_entry', arguments: { entry_id: 'e1' } })],
      [text('Đã xóa.')],
    ])

    expect(called).toHaveLength(1)
  })
})

describe('a turn that ends early', () => {
  it('sends failed with model_error when Ollama answers an error', async () => {
    const { sent } = await run([{ fail: new Error('model not found') }])

    expect(sent).toEqual([
      { type: 'failed', turnId: 'turn-1', reason: 'model_error' },
    ])
  })

  it('aborts the stream and sends nothing more on cancel', async () => {
    const fake = fakeModel(['hang'])
    const sent: UpFrame[] = []
    const turn = runTurn(turnFrame(), {
      model: fake.model,
      send: (frame) => sent.push(frame),
      callTool: () => Promise.reject(new Error('No tool call expected')),
    })

    turn.cancel()
    await turn.done

    expect(fake.wasAborted()).toBe(true)
    expect(sent).toEqual([])
  })

  it('aborts and sends failed with timeout past the turn limit', async () => {
    const { sent, wasAborted } = await run(['hang'], { timeoutMs: 20 })

    expect(wasAborted()).toBe(true)
    expect(sent).toEqual([
      { type: 'failed', turnId: 'turn-1', reason: 'timeout' },
    ])
  })
})
