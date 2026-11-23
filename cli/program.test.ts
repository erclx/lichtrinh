import { describe, expect, it } from 'vitest'

import packageJson from '../package.json' with { type: 'json' }
import { type ProgramContext, runCli } from './program'

function capture(overrides: Partial<ProgramContext> = {}) {
  const out: string[] = []
  const err: string[] = []
  const context: ProgramContext = {
    io: {
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text),
      cwd: '/somewhere',
    },
    findCheckout: () => ({ root: '/checkout', fallback: false }),
    runTask: async () => 0,
    ...overrides,
  }
  return {
    context,
    stdout: () => out.join(''),
    stderr: () => err.join(''),
  }
}

describe('runCli', () => {
  it('prints the package version for --version', async () => {
    const run = capture()

    const exitCode = await runCli(['--version'], run.context)

    expect(exitCode).toBe(0)
    expect(run.stdout().trim()).toBe(packageJson.version)
  })

  it('exits non-zero and names an unknown verb', async () => {
    const run = capture()

    const exitCode = await runCli(['deploy'], run.context)

    expect(exitCode).not.toBe(0)
    expect(run.stderr()).toContain('deploy')
  })
})
