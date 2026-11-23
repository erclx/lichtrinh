import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { runTask } from './task'

describe('runTask', () => {
  it('prints the command before running it', async () => {
    const lines: string[] = []

    await runTask(
      { command: [process.execPath, '-e', ''], cwd: tmpdir() },
      (text) => lines.push(text),
    )

    expect(lines[0]).toBe(`› ${process.execPath} -e \n`)
  })

  it('returns the exit code of a task that fails', async () => {
    const exitCode = await runTask(
      { command: [process.execPath, '-e', 'process.exit(3)'], cwd: tmpdir() },
      () => {},
    )

    expect(exitCode).toBe(3)
  })

  it('returns 128 plus the signal number for a task a signal ended', async () => {
    const exitCode = await runTask(
      {
        command: [
          process.execPath,
          '-e',
          'process.kill(process.pid, "SIGINT")',
        ],
        cwd: tmpdir(),
      },
      () => {},
    )

    expect(exitCode).toBe(130)
  })

  it('returns 127 and names a command that cannot start', async () => {
    const lines: string[] = []

    const exitCode = await runTask(
      { command: ['lichtrinh-no-such-command'], cwd: tmpdir() },
      (text) => lines.push(text),
    )

    expect(exitCode).toBe(127)
    expect(lines.join('')).toContain(
      'could not start lichtrinh-no-such-command',
    )
  })
})
