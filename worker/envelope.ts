import type { ApiError, ApiErrorCode } from '@shared/errors.ts'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'

export function fail(code: ApiErrorCode, message: string): ApiError {
  return { error: { code, message } }
}

/**
 * The request body parsed by the schema. Throws an exception the app answers
 * as `400 validation_failed` for a body that is not JSON or fails the schema.
 */
export async function parseBody<S extends z.ZodType>(
  c: Context,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw invalidBody()
  }
  const result = schema.safeParse(raw)
  if (!result.success) throw invalidBody()
  return result.data
}

function invalidBody() {
  return new HTTPException(400, {
    res: Response.json(fail('validation_failed', 'Invalid request body'), {
      status: 400,
    }),
  })
}
