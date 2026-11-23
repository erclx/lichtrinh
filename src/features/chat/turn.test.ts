import type { ChatEvent } from '@shared/chats.ts'

import {
  startTurn,
  threadItems,
  type Turn,
  type TurnAction,
  turnReducer,
} from '@/features/chat/turn'
import { anAddChange, aReply, aStep, aUserMessage } from '@/test/chat'

const sent = { id: 'message-ask', text: 'pho sang mai luc 7 gio' }

function run(...actions: TurnAction[]): Turn {
  return actions.reduce(turnReducer, startTurn(sent))
}

function event(value: ChatEvent): TurnAction {
  return { type: 'event', event: value }
}

describe('turnReducer', () => {
  it('starts thinking with nothing changed', () => {
    const turn = startTurn(sent)

    expect(turn.phase).toBe('thinking')
    expect(turn.changed).toBe(false)
  })

  it('moves to working on the first step', () => {
    const turn = run(event({ type: 'step', step: aStep() }))

    expect(turn.phase).toBe('working')
    expect(turn.steps).toEqual([aStep()])
  })

  it('moves to replying on the first words and joins each piece', () => {
    const turn = run(
      event({ type: 'step', step: aStep() }),
      event({ type: 'delta', text: 'Okay. ' }),
      event({ type: 'delta', text: 'Added.' }),
    )

    expect(turn.phase).toBe('replying')
    expect(turn.reply).toBe('Okay. Added.')
  })

  it('stays replying on a step that follows words', () => {
    const turn = run(
      event({ type: 'delta', text: 'Okay.' }),
      event({ type: 'step', step: aStep() }),
    )

    expect(turn.phase).toBe('replying')
  })

  it('records each change as made', () => {
    const turn = run(event({ type: 'change', changeId: 'change-1' }))

    expect(turn.changeIds).toEqual(['change-1'])
    expect(turn.changed).toBe(true)
  })

  it('ends done with the saved reply', () => {
    const reply = aReply({ changes: [anAddChange()] })

    const turn = run(
      event({ type: 'delta', text: 'Done' }),
      event({ type: 'done', message: reply }),
    )

    expect(turn.phase).toBe('done')
    expect(turn.message).toEqual(reply)
  })

  it('ends stopped on Stop and keeps the changes made', () => {
    const turn = run(event({ type: 'change', changeId: 'change-1' }), {
      type: 'stop',
    })

    expect(turn.phase).toBe('stopped')
    expect(turn.changeIds).toEqual(['change-1'])
  })

  it('ignores an event arriving after Stop', () => {
    const turn = run(
      { type: 'stop' },
      event({ type: 'done', message: aReply() }),
    )

    expect(turn.phase).toBe('stopped')
    expect(turn.message).toBeNull()
  })

  it('fails with changed set when an error follows a change', () => {
    const turn = run(
      event({ type: 'change', changeId: 'change-1' }),
      event({
        type: 'error',
        code: 'assistant_failed',
        changed: true,
        message: aReply({ status: 'failed' }),
      }),
    )

    expect(turn.phase).toBe('failed')
    expect(turn.changed).toBe(true)
  })

  it('fails with nothing changed when an error comes before any change', () => {
    const turn = run(
      event({
        type: 'error',
        code: 'assistant_unavailable',
        changed: false,
        message: aReply({ status: 'failed', text: '' }),
      }),
    )

    expect(turn.phase).toBe('failed')
    expect(turn.changed).toBe(false)
  })

  it('fails on a dropped stream, changed only after a change', () => {
    const before = run({ type: 'dropped' })
    const after = run(event({ type: 'change', changeId: 'c' }), {
      type: 'dropped',
    })

    expect([before.phase, before.changed]).toEqual(['failed', false])
    expect([after.phase, after.changed]).toEqual(['failed', true])
  })

  it('reads an unavailable refusal as the assistant offline', () => {
    const turn = run({ type: 'refused', code: 'assistant_unavailable' })

    expect(turn.phase).toBe('unavailable')
  })

  it('reads a busy refusal as refused, never as offline', () => {
    const turn = run({ type: 'refused', code: 'assistant_busy' })

    expect(turn.phase).toBe('refused')
    expect(turn.refusal).toBe('assistant_busy')
  })
})

describe('threadItems', () => {
  it('shows the sent message and the live reply before either saves', () => {
    const items = threadItems([], startTurn(sent))

    expect(items.map(({ kind }) => kind)).toEqual(['sent', 'live'])
  })

  it('shows the saved reply once and drops the live one after done', () => {
    const reply = aReply()
    const turn = run(event({ type: 'done', message: reply }))

    const items = threadItems([aUserMessage({ id: sent.id }), reply], turn)

    expect(items.map(({ kind }) => kind)).toEqual(['message', 'message'])
  })

  it('keeps a stopped turn on screen until its reply is saved', () => {
    const turn = run({ type: 'stop' })

    const before = threadItems([aUserMessage({ id: sent.id })], turn)
    const after = threadItems(
      [aUserMessage({ id: sent.id }), aReply({ status: 'stopped' })],
      turn,
    )

    expect(before.map(({ kind }) => kind)).toEqual(['message', 'live'])
    expect(after.map(({ kind }) => kind)).toEqual(['message', 'message'])
  })

  it('shows nothing of a refused send, since it never saved', () => {
    const turn = run({ type: 'refused', code: 'assistant_busy' })

    expect(threadItems([], turn)).toEqual([])
  })

  it('offers the asked text again on a failed reply ending the thread', () => {
    const items = threadItems(
      [aUserMessage({ text: 'ca phe' }), aReply({ status: 'failed' })],
      null,
    )

    expect(items.at(-1)).toMatchObject({ kind: 'message', retry: 'ca phe' })
  })

  it('offers no retry on a failed reply an answer followed', () => {
    const items = threadItems(
      [
        aUserMessage({ id: 'a' }),
        aReply({ id: 'b', status: 'failed' }),
        aUserMessage({ id: 'c' }),
        aReply({ id: 'd' }),
      ],
      null,
    )

    expect(items[1]).toMatchObject({ retry: null })
  })

  it('offers the sent text again on a live turn that dropped', () => {
    const items = threadItems([], run({ type: 'dropped' }))

    expect(items.at(-1)).toMatchObject({ kind: 'live', retry: sent.text })
  })
})
