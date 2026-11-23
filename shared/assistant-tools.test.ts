import { describe, expect, it } from 'vitest'

import { assistantTools, parseToolCall } from './assistant-tools.ts'

describe('assistantTools', () => {
  it('offers the four calendar tools by name', () => {
    expect(assistantTools.map((tool) => tool.function.name)).toEqual([
      'add_entry',
      'move_entry',
      'update_entry',
      'remove_entry',
    ])
  })

  it('marks the fields an add needs as required in its JSON Schema', () => {
    const add = assistantTools[0].function.parameters

    expect(add.required).toEqual(['title', 'date', 'start', 'end'])
  })
})

describe('parseToolCall', () => {
  it('parses an add with its optional cost', () => {
    const parsed = parseToolCall('add_entry', {
      title: 'Invented Pier Lunch',
      date: '2031-04-11',
      start: '12:00',
      end: '13:00',
      cost: 200000,
    })

    expect(parsed).toEqual({
      ok: true,
      call: {
        name: 'add_entry',
        args: {
          title: 'Invented Pier Lunch',
          date: '2031-04-11',
          start: '12:00',
          end: '13:00',
          cost: 200000,
        },
      },
    })
  })

  it('refuses a tool name outside the four', () => {
    const parsed = parseToolCall('run_shell', { command: 'ls' })

    expect(parsed).toEqual({ ok: false, error: 'unknown_tool' })
  })

  it('refuses arguments that fail the schema', () => {
    const parsed = parseToolCall('add_entry', {
      title: 'Invented Pier Lunch',
      date: 'next Thursday',
      start: '12:00',
      end: '13:00',
    })

    expect(parsed).toEqual({ ok: false, error: 'invalid_arguments' })
  })

  it('refuses an argument the tool does not take', () => {
    const parsed = parseToolCall('remove_entry', {
      entry_id: 'e1',
      trip_id: 'another-trip',
    })

    expect(parsed).toEqual({ ok: false, error: 'invalid_arguments' })
  })

  it('refuses a move that names no new date or time', () => {
    const parsed = parseToolCall('move_entry', { entry_id: 'e1' })

    expect(parsed).toEqual({ ok: false, error: 'invalid_arguments' })
  })

  it('refuses an update that names no field to change', () => {
    const parsed = parseToolCall('update_entry', { entry_id: 'e1' })

    expect(parsed).toEqual({ ok: false, error: 'invalid_arguments' })
  })

  it('takes a null cost on an update as clearing it', () => {
    const parsed = parseToolCall('update_entry', { entry_id: 'e1', cost: null })

    expect(parsed).toEqual({
      ok: true,
      call: { name: 'update_entry', args: { entry_id: 'e1', cost: null } },
    })
  })
})
