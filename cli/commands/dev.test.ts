import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type ProgramContext, runCli, type Task } from '../program'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lichtrinh-checkout-'))
  write('package.json', JSON.stringify({ devDependencies: { uqr: '^0.1.3' } }))
  write('bun.lock', '    "uqr": ["uqr@0.1.3", "", {}, "sha512-b"],\n')
  write('node_modules/uqr/package.json', JSON.stringify({ version: '0.1.3' }))
})
afterEach(() => {
  rmSync(root, { recursive: true })
})

function write(path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

function fakeRunner(exitCode = 0) {
  const tasks: Task[] = []
  const out: string[] = []
  const context: ProgramContext = {
    io: {
      stdout: (text) => out.push(text),
      stderr: (text) => out.push(text),
      cwd: root,
    },
    findCheckout: () => ({ root, fallback: false }),
    runTask: async (task) => {
      tasks.push(task)
      return exitCode
    },
  }
  return {
    context,
    commands: () => tasks.map((task) => task.command.join(' ')),
    cwds: () => tasks.map((task) => task.cwd),
    output: () => out.join(''),
  }
}

describe('lichtrinh dev', () => {
  it('hands off to the full dev run in the checkout', async () => {
    const run = fakeRunner()

    const exitCode = await runCli(['dev'], run.context)

    expect(exitCode).toBe(0)
    expect(run.commands()).toEqual(['bun run dev:full'])
    expect(run.cwds()).toEqual([root])
  })

  it('hands off to the phone preview with --phone', async () => {
    const run = fakeRunner()

    await runCli(['dev', '--phone'], run.context)

    expect(run.commands()).toEqual(['bun run dev:phone'])
  })

  it('passes --reset through to either script', async () => {
    const run = fakeRunner()

    await runCli(['dev', '--phone', '--reset'], run.context)

    expect(run.commands()).toEqual(['bun run dev:phone --reset'])
  })

  it("exits with the dev run's own code", async () => {
    const run = fakeRunner(130)

    expect(await runCli(['dev'], run.context)).toBe(130)
  })

  it('names a missing package and the fix, and starts nothing', async () => {
    rmSync(join(root, 'node_modules'), { recursive: true })
    const run = fakeRunner()

    const exitCode = await runCli(['dev', '--phone'], run.context)

    expect(exitCode).toBe(1)
    expect(run.commands()).toEqual([])
    expect(run.output()).toContain('uqr is not installed')
    expect(run.output()).toContain(`bun install in ${root}`)
  })

  it('names a package installed at another version than the lockfile', async () => {
    write('node_modules/uqr/package.json', JSON.stringify({ version: '0.1.2' }))
    const run = fakeRunner()

    const exitCode = await runCli(['dev'], run.context)

    expect(exitCode).toBe(1)
    expect(run.commands()).toEqual([])
    expect(run.output()).toContain('uqr is 0.1.2, and bun.lock wants 0.1.3')
  })
})
