import type { Language, Role } from '@shared/auth.ts'
import { hashPassword } from '@shared/password-hash.ts'
import { env } from 'cloudflare:workers'

import { app } from '../app.ts'
import { createDb } from '../db/client.ts'
import { users } from '../db/schema.ts'
import { cookieFrom, json } from './requests.ts'

export const TEST_PASSWORD = 'testpassword'

interface TestUserOptions {
  role?: Role
  // Null makes an account that has no password and cannot sign in.
  password?: string | null
  canChat?: boolean
  language?: Language | null
}

/** Inserts an invented account through the real hash. */
export async function addUser(options: TestUserOptions = {}) {
  const suffix = crypto.randomUUID().slice(0, 8)
  const password =
    options.password === undefined ? TEST_PASSWORD : options.password
  const row = {
    id: crypto.randomUUID(),
    username: `tester-${suffix}`,
    displayName: `Invented Tester ${suffix}`,
    role: options.role ?? 'member',
    createdAt: new Date(),
    passwordHash: password === null ? null : await hashPassword(password),
    canChat: options.canChat ?? false,
    language: options.language === undefined ? 'vi' : options.language,
  } as const
  await createDb(env.DB).insert(users).values(row)
  return { ...row, password }
}

export function signIn(username: string, password: string) {
  return app.request(
    '/api/auth/sign-in',
    json('POST', { username, password }),
    env,
  )
}

/** Inserts an account, signs it in, and returns the cookie to send. */
export async function signedIn(options: TestUserOptions = {}) {
  const user = await addUser(options)
  const res = await signIn(user.username, user.password ?? '')
  return { user, cookie: cookieFrom(res) }
}
