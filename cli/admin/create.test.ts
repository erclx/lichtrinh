import { existsSync, readFileSync } from 'node:fs'

import { deriveKey, parsePasswordHash } from '@shared/password-hash'
import { describe, expect, it } from 'vitest'

import { type ProgramContext, runCli, type Task } from '../program'
import { insertAdminSql } from './create'

// The indented line the password prints on, never a run of words around it.
const GROUPED_PASSWORD = /^ {2}([a-z2-9]{4} [a-z2-9]{4} [a-z2-9]{4})$/m

// Reads the SQL file each task names while it still exists, since the verb
// removes it once the task ends.
function fakeRunner(exitCode = 0, confirmed = true) {
  const tasks: Task[] = []
  const sql: string[] = []
  const files: string[] = []
  const out: string[] = []
  const questions: string[] = []
  const context: ProgramContext = {
    io: {
      stdout: (text) => out.push(text),
      stderr: (text) => out.push(text),
      cwd: '/work/lichtrinh',
      confirm: async (question) => {
        questions.push(question)
        return confirmed
      },
    },
    findCheckout: () => ({ root: '/work/lichtrinh', fallback: false }),
    runTask: async (task) => {
      tasks.push(task)
      const file = task.command[task.command.indexOf('--file') + 1]
      files.push(file)
      sql.push(readFileSync(file, 'utf8'))
      return exitCode
    },
  }
  return {
    context,
    tasks,
    sql,
    files,
    questions,
    output: () => out.join(''),
  }
}

describe('lichtrinh admin create', () => {
  it('runs one insert through wrangler against the local database', async () => {
    const run = fakeRunner()

    await runCli(
      ['admin', 'create', 'someone-invented', '--local'],
      run.context,
    )

    expect(run.tasks).toHaveLength(1)
    expect(run.tasks[0].command.slice(0, 6)).toEqual([
      'bunx',
      'wrangler',
      'd1',
      'execute',
      'DB',
      '--local',
    ])
    expect(run.sql[0]).toMatch(/^INSERT INTO `users`/)
    expect(run.sql[0]).toContain("'someone-invented'")
    expect(run.sql[0]).toContain("'admin'")
  })

  it('targets the remote database for --remote', async () => {
    const run = fakeRunner()

    await runCli(
      ['admin', 'create', 'someone-invented', '--remote'],
      run.context,
    )

    expect(run.tasks[0].command).toContain('--remote')
    expect(run.tasks[0].command).not.toContain('--local')
  })

  it('asks before writing to the remote database', async () => {
    const run = fakeRunner()

    await runCli(
      ['admin', 'create', 'someone-invented', '--remote'],
      run.context,
    )

    expect(run.questions).toHaveLength(1)
    expect(run.questions[0]).toContain('remote')
  })

  it('runs nothing remotely when the confirm is declined', async () => {
    const run = fakeRunner(0, false)

    const exitCode = await runCli(
      ['admin', 'create', 'someone-invented', '--remote'],
      run.context,
    )

    expect(exitCode).not.toBe(0)
    expect(run.tasks).toEqual([])
  })

  it('asks nothing for the local database', async () => {
    const run = fakeRunner()

    await runCli(
      ['admin', 'create', 'someone-invented', '--local'],
      run.context,
    )

    expect(run.questions).toEqual([])
  })

  it('stores vi when no language is named', async () => {
    const run = fakeRunner()

    await runCli(
      ['admin', 'create', 'someone-invented', '--local'],
      run.context,
    )

    expect(run.sql[0]).toMatch(/'vi'\);$/)
  })

  it('stores the language --language names', async () => {
    const run = fakeRunner()

    await runCli(
      ['admin', 'create', 'someone-invented', '--local', '--language', 'en'],
      run.context,
    )

    expect(run.sql[0]).toMatch(/'en'\);$/)
  })

  it('refuses a third language and runs nothing', async () => {
    const run = fakeRunner()

    const exitCode = await runCli(
      ['admin', 'create', 'someone-invented', '--local', '--language', 'fr'],
      run.context,
    )

    expect(exitCode).not.toBe(0)
    expect(run.tasks).toEqual([])
  })

  it.each([
    ['neither database', ['--language', 'vi']],
    ['both databases', ['--local', '--remote']],
  ])('refuses %s and runs nothing', async (_case, flags) => {
    const run = fakeRunner()

    const exitCode = await runCli(
      ['admin', 'create', 'someone-invented', ...flags],
      run.context,
    )

    expect(exitCode).not.toBe(0)
    expect(run.tasks).toEqual([])
  })

  it.each([['Two Words'], ["x'); DROP TABLE users; --"]])(
    'refuses the username %s and runs nothing',
    async (username) => {
      const run = fakeRunner()

      const exitCode = await runCli(
        ['admin', 'create', username, '--local'],
        run.context,
      )

      expect(exitCode).not.toBe(0)
      expect(run.tasks).toEqual([])
    },
  )

  it('prints a password that matches the stored hash', async () => {
    const run = fakeRunner()

    await runCli(
      ['admin', 'create', 'someone-invented', '--local'],
      run.context,
    )

    const printed = GROUPED_PASSWORD.exec(run.output())?.[1] ?? ''
    const stored = /'(pbkdf2-sha256\$[^']+)'/.exec(run.sql[0])?.[1] ?? ''
    const hash = parsePasswordHash(stored)
    expect(hash).not.toBeNull()
    const key = await deriveKey(
      printed.replaceAll(' ', ''),
      hash?.salt ?? new Uint8Array(),
      hash?.iterations ?? 1,
    )
    expect(key).toEqual(hash?.key)
  })

  it('never prints the hash', async () => {
    const run = fakeRunner()

    await runCli(
      ['admin', 'create', 'someone-invented', '--local'],
      run.context,
    )

    expect(run.output()).not.toContain('pbkdf2-sha256')
    expect(run.tasks[0].command.join(' ')).not.toContain('pbkdf2-sha256')
  })

  it('removes the SQL file once the insert has run', async () => {
    const run = fakeRunner()

    await runCli(
      ['admin', 'create', 'someone-invented', '--local'],
      run.context,
    )

    expect(existsSync(run.files[0])).toBe(false)
  })

  it('prints no password and exits with the code of a failed insert', async () => {
    const run = fakeRunner(1)

    const exitCode = await runCli(
      ['admin', 'create', 'someone-invented', '--local'],
      run.context,
    )

    expect(exitCode).toBe(1)
    expect(run.output()).not.toMatch(GROUPED_PASSWORD)
  })
})

describe('insertAdminSql', () => {
  function row(overrides: { username?: string; passwordHash?: string } = {}) {
    return {
      id: '0b7c1f0e-0000-4000-8000-000000000000',
      username: 'someone-invented',
      language: 'vi' as const,
      passwordHash: 'pbkdf2-sha256$100000$AAAA$BBBB',
      createdAt: 1_700_000_000_000,
      ...overrides,
    }
  }

  it('quotes each value from the safe set as a literal', () => {
    expect(insertAdminSql(row())).toContain("'someone-invented'")
  })

  it.each([
    ['a single quote', "x'); DROP TABLE users; --"],
    ['a backslash', 'x\\'],
    ['a space', 'two words'],
  ])('refuses a value holding %s', (_case, username) => {
    expect(() => insertAdminSql(row({ username }))).toThrow()
  })

  it('refuses a hash holding a quote', () => {
    expect(() => insertAdminSql(row({ passwordHash: "pbkdf2'$1" }))).toThrow()
  })
})
