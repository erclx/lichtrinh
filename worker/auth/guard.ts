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

// The only routes a signed-out caller reaches. Every other path, an unknown
// one included, needs a session, so a new route is protected by default.
const SIGNED_OUT_ROUTES = new Set(['GET /api/health', 'POST /api/auth/sign-in'])

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
