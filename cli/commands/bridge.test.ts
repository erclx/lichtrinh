import { describe, expect, it } from 'vitest'

import { type ProgramContext, runCli, type Task } from '../program'

function fakeRunner(exitCodes: number[] = [0]) {
  const tasks: Task[] = []
  const context: ProgramContext = {
    io: { stdout: () => {}, stderr: () => {}, cwd: '/work/lichtrinh/voice' },
    findCheckout: () => ({ root: '/work/lichtrinh', fallback: false }),
    runTask: async (task) => {
      tasks.push(task)
      return exitCodes[tasks.length - 1] ?? 0
    },
  }
  return { context, tasks }
}

describe('lichtrinh bridge', () => {
  it('runs the bridge process from the checkout for bridge run', async () => {
    const run = fakeRunner()

    await runCli(['bridge', 'run'], run.context)

    expect(run.tasks).toEqual([
      { command: ['bun', 'bridge/index.ts'], cwd: '/work/lichtrinh' },
    ])
  })

  it('makes each alias from its Modelfile for bridge models', async () => {
    const run = fakeRunner()

    await runCli(['bridge', 'models'], run.context)

    expect(run.tasks.map((task) => task.command)).toEqual([
      [
        'ollama',
        'create',
        'lichtrinh-assistant',
        '-f',
        'bridge/models/lichtrinh-assistant.Modelfile',
      ],
      [
        'ollama',
        'create',
        'lichtrinh-assistant-gemma',
        '-f',
        'bridge/models/lichtrinh-assistant-gemma.Modelfile',
      ],
    ])
  })

  it('stops making aliases at the first that fails', async () => {
    const run = fakeRunner([1])

    const exitCode = await runCli(['bridge', 'models'], run.context)

    expect(run.tasks).toHaveLength(1)
    expect(exitCode).toBe(1)
  })

  it('scores the default alias for bridge eval', async () => {
    const run = fakeRunner()

    await runCli(['bridge', 'eval'], run.context)

    expect(run.tasks).toEqual([
      {
        command: ['bun', 'bridge/eval.ts', '--model', 'lichtrinh-assistant'],
        cwd: '/work/lichtrinh',
      },
    ])
  })

  it('scores the alias named by --model', async () => {
    const run = fakeRunner()

    await runCli(
      ['bridge', 'eval', '--model', 'lichtrinh-assistant-gemma'],
      run.context,
    )

    expect(run.tasks[0].command.at(-1)).toBe('lichtrinh-assistant-gemma')
  })

  it('refuses an eval model outside the assistant aliases', async () => {
    const run = fakeRunner()

    const exitCode = await runCli(
      ['bridge', 'eval', '--model', 'qwen3.8:27b'],
      run.context,
    )

    expect(exitCode).not.toBe(0)
    expect(run.tasks).toEqual([])
  })

  it.each([
    ['run', 3],
    ['eval', 2],
  ])('exits bridge %s with the code of its task', async (verb, code) => {
    const run = fakeRunner([code])

    const exitCode = await runCli(['bridge', verb], run.context)

    expect(exitCode).toBe(code)
  })
})
