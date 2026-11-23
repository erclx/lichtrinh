import { describe, expect, it } from 'vitest'

import { type ProgramContext, runCli, type Task } from '../program'

const VOICE = ['uv', 'run', '--directory', 'voice', '--group', 'gpu', 'voice']

function fakeRunner(exitCode: number) {
  const tasks: Task[] = []
  const context: ProgramContext = {
    io: { stdout: () => {}, stderr: () => {}, cwd: '/home/owner/clips' },
    findCheckout: () => ({ root: '/work/lichtrinh', fallback: false }),
    runTask: async (task) => {
      tasks.push(task)
      return exitCode
    },
  }
  return { context, tasks }
}

describe('lichtrinh voice', () => {
  it.each([['serve'], ['models']])(
    'hands voice %s to the gpu environment in the checkout',
    async (verb) => {
      const run = fakeRunner(0)

      await runCli(['voice', verb], run.context)

      expect(run.tasks).toEqual([
        { command: [...VOICE, verb], cwd: '/work/lichtrinh' },
      ])
    },
  )

  it('resolves the clip path from the folder the owner ran it in', async () => {
    const run = fakeRunner(0)

    await runCli(['voice', 'transcribe', 'invented.webm'], run.context)

    expect(run.tasks).toEqual([
      {
        command: [...VOICE, 'transcribe', '/home/owner/clips/invented.webm'],
        cwd: '/work/lichtrinh',
      },
    ])
  })

  it('passes the model it was given to voice transcribe', async () => {
    const run = fakeRunner(0)

    await runCli(
      ['voice', 'transcribe', '/tmp/a.webm', '--model', 'phowhisper-large'],
      run.context,
    )

    expect(run.tasks[0]?.command).toEqual([
      ...VOICE,
      'transcribe',
      '/tmp/a.webm',
      '--model',
      'phowhisper-large',
    ])
  })

  it.each([
    [['voice', 'serve'], 1],
    [['voice', 'models'], 2],
    [['voice', 'transcribe', 'a.webm'], 3],
  ])('exits %j with the code of its task', async (argv, code) => {
    const run = fakeRunner(code)

    const exitCode = await runCli(argv, run.context)

    expect(exitCode).toBe(code)
  })
})
