import { describe, expect, it } from 'vitest'

import { type ProgramContext, runCli, type Task } from '../program'

function fakeRunner(exitCode: number) {
  const tasks: Task[] = []
  const context: ProgramContext = {
    io: { stdout: () => {}, stderr: () => {}, cwd: '/work/lichtrinh/voice' },
    findCheckout: () => ({ root: '/work/lichtrinh', fallback: false }),
    runTask: async (task) => {
      tasks.push(task)
      return exitCode
    },
  }
  return { context, tasks }
}

describe('lichtrinh db', () => {
  it('lists pending local migrations through wrangler for db status', async () => {
    const run = fakeRunner(0)

    await runCli(['db', 'status'], run.context)

    expect(run.tasks).toEqual([
      {
        command: [
          'bunx',
          'wrangler',
          'd1',
          'migrations',
          'list',
          'DB',
          '--local',
        ],
        cwd: '/work/lichtrinh',
      },
    ])
  })

  it('runs the package script for db migrate', async () => {
    const run = fakeRunner(0)

    await runCli(['db', 'migrate'], run.context)

    expect(run.tasks).toEqual([
      { command: ['bun', 'run', 'db:migrate'], cwd: '/work/lichtrinh' },
    ])
  })

  it.each([
    ['status', 1],
    ['migrate', 2],
  ])('exits db %s with the code of its failing task', async (verb, code) => {
    const run = fakeRunner(code)

    const exitCode = await runCli(['db', verb], run.context)

    expect(exitCode).toBe(code)
  })
})
