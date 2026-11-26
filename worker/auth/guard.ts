import type { User } from '@shared/auth.ts'
import { createMiddleware } from 'hono/factory'

import { createDb } from '../db/client.ts'
import { fail } from '../envelope.ts'
import { readSession } from './session.ts'

/** What a route mounted behind the guard reads off its context. */
export interface AuthEnv {
  Bindings: Env
  Variables: { user: User; sessionId: string }
}

// The only routes a signed-out caller reaches, so a new route is protected
// by default. The bridge and the owner panel each carry a secret their own
// route checks, named by whole path so no sibling route opens with them.
const SIGNED_OUT_ROUTES = new Set([
  'GET /api/health',
  'POST /api/auth/sign-in',
  'GET /api/bridge/connect',
  'GET /api/owner/summary',
])

export const requireSession = createMiddleware<AuthEnv>(async (c, next) => {
  if (SIGNED_OUT_ROUTES.has(`${c.req.method} ${c.req.path}`)) return next()
  const session = await readSession(c, createDb(c.env.DB), Date.now())
  if (session === null) {
    return c.json(fail('unauthenticated', 'Sign in first'), 401)
  }
  c.set('user', session.user)
  c.set('sessionId', session.id)
  await next()
})

export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.var.user.role !== 'admin') {
    return c.json(fail('forbidden', 'Admin only'), 403)
  }
  await next()
})

// Read off the session on every request, so the admin turning chat off
// refuses the account's next call.
export const requireChat = createMiddleware<AuthEnv>(async (c, next) => {
  if (!c.var.user.canChat) {
    return c.json(fail('forbidden', 'Chat is off for this account'), 403)
  }
  await next()
})
