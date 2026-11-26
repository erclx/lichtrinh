import { MAX_CLIP_BYTES, readClipType } from '@shared/voice.ts'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'

import { type AuthEnv, requireAdmin, requireSession } from './auth/guard.ts'
import { fail } from './envelope.ts'
import { assistantRoutes } from './routes/assistant.ts'
import { authRoutes } from './routes/auth.ts'
import { backupRoutes } from './routes/backup.ts'
import { changeRoutes } from './routes/changes.ts'
import { chatRoutes } from './routes/chats.ts'
import { entryRoutes } from './routes/entries.ts'
import { healthRoutes } from './routes/health.ts'
import { noticeRoutes } from './routes/notices.ts'
import { ownerRoutes } from './routes/owner.ts'
import { rateRoutes } from './routes/rates.ts'
import { settingsRoutes } from './routes/settings.ts'
import { tripRoutes } from './routes/trips.ts'
import { userRoutes } from './routes/users.ts'
import { voiceRoutes } from './routes/voice.ts'

export const MAX_BODY_BYTES = 64 * 1024

const UNSAFE_METHOD = /^(POST|PUT|PATCH|DELETE)$/
const JSON_TYPE = /^application\/json\s*(;|$)/i

// The two routes taking audio. Matching the method and the whole path keeps
// every other route on the JSON limit and type.
const AUDIO_PATH = /^\/api\/voice\/(transcriptions|live)\/[^/]+$/

function sendsAudio(c: Context) {
  return c.req.method === 'PUT' && AUDIO_PATH.test(c.req.path)
}

export const app = new Hono<AuthEnv>().basePath('/api')

const tooLarge = (c: Context) =>
  c.json(fail('body_too_large', 'Request body too large'), 413)
const jsonLimit = bodyLimit({ maxSize: MAX_BODY_BYTES, onError: tooLarge })
const clipLimit = bodyLimit({ maxSize: MAX_CLIP_BYTES, onError: tooLarge })

app.use('*', (c, next) => (sendsAudio(c) ? clipLimit : jsonLimit)(c, next))

// Refuses a cross-origin form post. A form cannot send JSON, and a JSON body
// from another origin needs a preflight this API never grants, so the check
// below closes what csrf() leaves to content type.
app.use('*', csrf())

app.use('*', async (c, next) => {
  const hasBody = c.req.raw.body !== null
  const contentType = c.req.header('content-type')
  const audio = sendsAudio(c) && readClipType(contentType) !== undefined
  if (
    UNSAFE_METHOD.test(c.req.method) &&
    hasBody &&
    !audio &&
    !JSON_TYPE.test(contentType ?? '') &&
    // Some servers hand a bodiless POST on with an empty stream.
    (await c.req.arrayBuffer()).byteLength > 0
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
app.route('/', backupRoutes)
app.route('/', settingsRoutes)
app.route('/', tripRoutes)
app.route('/', entryRoutes)
app.route('/', changeRoutes)
app.route('/', assistantRoutes)
app.route('/', chatRoutes)
app.route('/', voiceRoutes)
app.route('/', rateRoutes)
app.route('/', noticeRoutes)
app.route('/', ownerRoutes)

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
