import type { ApiError, ApiErrorCode } from '@shared/errors.ts'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
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

// What a calendar write's refusal answers. A caller branches on the code,
// so the status only has to be the nearest honest one.
const REFUSALS = {
  not_found: [404, 'No such record'],
  validation_failed: [400, 'Invalid request'],
  edit_conflict: [409, 'Changed since it was read, so read it again'],
  id_conflict: [409, 'That id is taken by another record'],
  entries_outside_range: [400, 'An entry would fall outside its trip'],
  undo_conflict: [409, 'A later change touched this, so it cannot be undone'],
  already_undone: [409, 'That change is already undone'],
} as const satisfies Partial<
  Record<ApiErrorCode, readonly [ContentfulStatusCode, string]>
>

export type Refusal = keyof typeof REFUSALS

export function refuse(c: Context, code: Refusal) {
  const [status, message] = REFUSALS[code]
  return c.json(fail(code, message), status)
}

function invalidBody() {
  return new HTTPException(400, {
    res: Response.json(fail('validation_failed', 'Invalid request body'), {
      status: 400,
    }),
  })
}
