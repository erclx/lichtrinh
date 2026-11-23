import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Language } from '@shared/auth'
import { generatePassword, groupInFours } from '@shared/generated-password'
import { hashPassword } from '@shared/password-hash'

import type { CliIo, RunInCheckout } from '../program'

export type Database = 'local' | 'remote'

export interface AdminRequest {
  username: string
  language: Language
  database: Database
}

interface AdminRow {
  id: string
  username: string
  language: Language
  passwordHash: string
  createdAt: number
}

// `wrangler d1 execute` takes no bound parameters, so every value passes
// through these, which refuse any character that could end a literal.
const SAFE_TEXT = /^[A-Za-z0-9._$+/=-]*$/

function text(value: string): string {
  if (!SAFE_TEXT.test(value)) {
    throw new Error('A value holds a character the insert refuses')
  }
  return `'${value}'`
}

function integer(value: number): string {
  if (!Number.isSafeInteger(value)) throw new Error('Not an integer')
  return String(value)
}

/** The first admin goes in with the username as its display name. */
export function insertAdminSql(row: AdminRow): string {
  const columns = [
    'id',
    'username',
    'display_name',
    'role',
    'created_at',
    'password_hash',
    'can_chat',
    'language',
  ]
  const values = [
    text(row.id),
    text(row.username),
    text(row.username),
    text('admin'),
    integer(row.createdAt),
    text(row.passwordHash),
    '0',
    text(row.language),
  ]
  const names = columns.map((name) => `\`${name}\``).join(', ')
  return `INSERT INTO \`users\` (${names}) VALUES (${values.join(', ')});`
}

/**
 * Inserts the admin through wrangler and prints its password once. The SQL
 * goes in a private file rather than on the command line, since the runner
 * prints every command it starts and the hash would reach the terminal.
 */
export async function createAdmin(
  request: AdminRequest,
  run: RunInCheckout,
  io: CliIo,
): Promise<void> {
  const password = generatePassword()
  const sql = insertAdminSql({
    id: crypto.randomUUID(),
    username: request.username,
    language: request.language,
    passwordHash: await hashPassword(password),
    createdAt: Date.now(),
  })

  const dir = await mkdtemp(join(tmpdir(), 'lichtrinh-admin-'))
  const file = join(dir, 'insert.sql')
  let code: number
  try {
    await writeFile(file, sql, { mode: 0o600 })
    code = await run([
      'bunx',
      'wrangler',
      'd1',
      'execute',
      'DB',
      `--${request.database}`,
      '--file',
      file,
    ])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  if (code !== 0) return
  io.stdout(
    `Created admin ${request.username}. Its password, shown this once:\n\n` +
      `  ${groupInFours(password)}\n\n`,
  )
}
