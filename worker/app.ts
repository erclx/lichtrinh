import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { fail } from './envelope.ts'
import { healthRoutes } from './routes/health.ts'

export const MAX_BODY_BYTES = 64 * 1024

export const app = new Hono<{ Bindings: Env }>().basePath('/api')

app.use(
  '*',
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) =>
      c.json(fail('body_too_large', 'Request body too large'), 413),
  }),
)

app.route('/', healthRoutes)

app.notFound((c) => c.json(fail('not_found', 'No such API route'), 404))

// The log carries the route and the error's class alone, since a message or
// a stack can hold SQL or the text a person typed.
app.onError((err, c) => {
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
