import { apiError, type ApiErrorCode } from '@shared/errors.ts'
import type { z } from 'zod'

/**
 * The API's codes, plus `network` for no answer and `unexpected_response`
 * for one the app cannot read, kept out of the shared enum the API sends.
 */
export type FailureCode = ApiErrorCode | 'network' | 'unexpected_response'

export class ApiFailure extends Error {
  readonly code: FailureCode
  /** The HTTP status, or 0 when no answer arrived. */
  readonly status: number
  /** Seconds the server asked the caller to wait, from `Retry-After`. */
  readonly retryAfter: number | null

  constructor(code: FailureCode, status: number, retryAfter: number | null) {
    super(code)
    this.name = 'ApiFailure'
    this.code = code
    this.status = status
    this.retryAfter = retryAfter
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: Method
  body?: unknown
}

let unauthenticated: (() => void) | null = null

/**
 * Registers the one listener told when any call finds the session gone, so a
 * page never handles a 401 itself. Returns the call that removes it.
 */
export function onUnauthenticated(listener: () => void): () => void {
  unauthenticated = listener
  return () => {
    if (unauthenticated === listener) unauthenticated = null
  }
}

/** Calls a path under `/api`, parsing a success through the schema given. */
export async function apiFetch<S extends z.ZodType>(
  path: string,
  options: RequestOptions & { schema: S },
): Promise<z.output<S>>
export async function apiFetch(
  path: string,
  options?: RequestOptions,
): Promise<void>
export async function apiFetch(
  path: string,
  {
    method = 'GET',
    body,
    schema,
  }: RequestOptions & { schema?: z.ZodType } = {},
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      // Bodyless writes too, since the dev proxy sends an empty body the API checks.
      headers:
        method === 'GET' ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiFailure('network', 0, null)
  }

  if (!response.ok) throw await failureFrom(response)
  if (schema === undefined) return undefined

  const parsed = schema.safeParse(await readJson(response))
  if (!parsed.success) {
    throw new ApiFailure('unexpected_response', response.status, null)
  }
  return parsed.data
}

/** Reads a refused answer's envelope, for a caller reading the body itself. */
export async function failureFrom(response: Response): Promise<ApiFailure> {
  const parsed = apiError.safeParse(await readJson(response))
  if (!parsed.success) {
    return new ApiFailure('unexpected_response', response.status, null)
  }
  const { code } = parsed.data.error
  if (code === 'unauthenticated') unauthenticated?.()
  return new ApiFailure(code, response.status, retryAfterOf(response))
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function retryAfterOf(response: Response): number | null {
  const header = response.headers.get('retry-after')
  if (header === null || !/^\d+$/.test(header)) return null
  return Number(header)
}
