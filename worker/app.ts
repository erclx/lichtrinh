import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'

import { type AuthEnv, requireAdmin, requireSession } from './auth/guard.ts'
import { fail } from './envelope.ts'
import { authRoutes } from './routes/auth.ts'
import { healthRoutes } from './routes/health.ts'
import { settingsRoutes } from './routes/settings.ts'
import { tripRoutes } from './routes/trips.ts'
import { userRoutes } from './routes/users.ts'

export const MAX_BODY_BYTES = 64 * 1024

const UNSAFE_METHOD = /^(POST|PUT|PATCH|DELETE)$/
const JSON_TYPE = /^application\/json\s*(;|$)/i

export const app = new Hono<AuthEnv>().basePath('/api')

app.use(
  '*',
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) =>
      c.json(fail('body_too_large', 'Request body too large'), 413),
  }),
)

// Refuses a cross-origin form post. A form cannot send JSON, and a JSON body
// from another origin needs a preflight this API never grants, so the check
// below closes what csrf() leaves to content type.
app.use('*', csrf())

app.use('*', async (c, next) => {
  const hasBody = c.req.raw.body !== null
  if (
    UNSAFE_METHOD.test(c.req.method) &&
    hasBody &&
    !JSON_TYPE.test(c.req.header('content-type') ?? '')
  ) {
    return c.json(
      fail('unsupported_media_type', 'Send the body as application/json'),
      415,
    )
  }
  await next()
})

app.use('*', requireSession)
app.use('/admin/*', requireAdmin)

app.route('/', healthRoutes)
app.route('/', authRoutes)
app.route('/', userRoutes)
app.route('/', settingsRoutes)
app.route('/', tripRoutes)

app.notFound((c) => c.json(fail('not_found', 'No such API route'), 404))

// The log carries the route and the error's class alone, since a message or
// a stack can hold SQL or the text a person typed.
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    // csrf() answers its refusal in plain text, so it takes the envelope here.
    if (err.status === 403) {
      return c.json(fail('forbidden', 'Cross-origin request refused'), 403)
    }
    return err.getResponse()
  }
  console.error(
    JSON.stringify({
      outcome: 'internal_error',
      method: c.req.method,
      route: c.req.routePath,
      error: err.name,
    }),
  )
  return c.json(fail('internal_error', 'Something went wrong'), 500)
})
