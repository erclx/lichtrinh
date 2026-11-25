import { describe, expect, it } from 'vitest'

import type { CommandResult } from '../run.ts'
import { ActionFailed, ReadFailed } from '../run.ts'
import { restartUnits, showUnits, startUnits, stopUnits } from './systemd.ts'

const SHOWN = `NRestarts=0
Id=lichtrinh-voice.service
ActiveState=active
StateChangeTimestamp=@1953036600
ActiveEnterTimestamp=@1953036600
InvocationID=d9864f8bcaa04f13a28b9a5b81366f3b

NRestarts=3
Id=lichtrinh-bridge.service
ActiveState=failed
StateChangeTimestamp=@1953036660
ActiveEnterTimestamp=
InvocationID=62118b75fd6b483d819bf0f3e6c03181

NRestarts=0
Id=lichtrinh-bridge-staging.service
ActiveState=inactive
StateChangeTimestamp=
ActiveEnterTimestamp=
InvocationID=
`

function scripted(answer: (command: string) => Partial<CommandResult>) {
  const commands: string[] = []
  return {
    commands,
    run: async (command: readonly string[]) => {
      commands.push(command.join(' '))
      return { code: 0, stdout: '', stderr: '', ...answer(command.join(' ')) }
    },
  }
}

describe('showUnits', () => {
  it('reads every unit from one command', async () => {
    const machine = scripted(() => ({ stdout: SHOWN }))

    const shown = await showUnits(machine.run, [
      'lichtrinh-voice.service',
      'lichtrinh-bridge.service',
    ])

    expect(machine.commands).toEqual([
      'systemctl --user show --timestamp=unix --property=Id,ActiveState,NRestarts,InvocationID,ActiveEnterTimestamp,StateChangeTimestamp lichtrinh-voice.service lichtrinh-bridge.service',
    ])
    expect(shown('lichtrinh-voice.service')).toEqual({
      active: 'active',
      restarts: 0,
      invocationId: 'd9864f8bcaa04f13a28b9a5b81366f3b',
      activeSince: new Date(1_953_036_600_000),
      changedAt: new Date(1_953_036_600_000),
    })
    expect(shown('lichtrinh-bridge.service')).toMatchObject({
      active: 'failed',
      restarts: 3,
      activeSince: null,
      changedAt: new Date(1_953_036_660_000),
    })
  })

  it('reads a unit that never ran as inactive with no times', async () => {
    const shown = await showUnits(scripted(() => ({ stdout: SHOWN })).run, [])

    expect(shown('lichtrinh-bridge-staging.service')).toEqual({
      active: 'inactive',
      restarts: 0,
      invocationId: null,
      activeSince: null,
      changedAt: null,
    })
  })

  it('reads a unit the output leaves out as inactive', async () => {
    const shown = await showUnits(scripted(() => ({ stdout: '' })).run, [])

    expect(shown('lichtrinh-voice.service').active).toBe('inactive')
  })

  it.each([
    ['a failed exit', { code: 1, stderr: 'Failed to connect to bus' }],
    ['a read that was cut', { code: 127, stdout: SHOWN }],
  ])(
    'fails on %s rather than reading every unit as inactive',
    async (_, result) => {
      const reading = showUnits(scripted(() => result).run, [])

      await expect(reading).rejects.toThrow(ReadFailed)
    },
  )
})

describe('the unit actions', () => {
  it('clears each start limit before one start', async () => {
    const machine = scripted(() => ({}))

    await startUnits(machine.run, ['a.service', 'b.service'], 'all.target')

    expect(machine.commands).toEqual([
      'systemctl --user reset-failed a.service',
      'systemctl --user reset-failed b.service',
      'systemctl --user start all.target a.service b.service',
    ])
  })

  it('starts a unit systemd has not loaded, whose limit it cannot clear', async () => {
    const machine = scripted((command) => ({
      code: command.includes('reset-failed') ? 1 : 0,
    }))

    await startUnits(machine.run, ['a.service'])

    expect(machine.commands).toContain('systemctl --user start a.service')
  })

  it('clears the start limit before a restart', async () => {
    const machine = scripted(() => ({}))

    await restartUnits(machine.run, ['a.service'])

    expect(machine.commands).toEqual([
      'systemctl --user reset-failed a.service',
      'systemctl --user restart a.service',
    ])
  })

  it.each([
    ['start', startUnits],
    ['restart', restartUnits],
    ['stop', stopUnits],
  ])('fails a %s that exits non-zero', async (verb, action) => {
    const machine = scripted((command) => ({
      code: command.includes('reset-failed') ? 0 : 1,
      stderr: 'a line no caller may read',
    }))

    const failure = await action(machine.run, ['a.service']).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(ActionFailed)
    expect(failure).toHaveProperty('message', `systemctl ${verb} exited 1`)
  })
})
