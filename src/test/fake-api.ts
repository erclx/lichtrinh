import type { User } from '@shared/auth.ts'

export interface SeenRequest {
  method: string
  path: string
  body: unknown
}

type Route = (request: SeenRequest) => Response | Promise<Response>

/**
 * Stands in for the API behind `fetch`, keyed by `METHOD /path` under `/api`.
 * A route that throws reads as a request that never answered, and a path with
 * no route answers the API's own 404 envelope.
 */
export function fakeApi(routes: Record<string, Route>) {
  const requests: SeenRequest[] = []
  vi.stubGlobal(
    'fetch',
    async (input: string, init: RequestInit = {}): Promise<Response> => {
      const request: SeenRequest = {
        method: init.method ?? 'GET',
        path: input.replace(/^\/api/, ''),
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      }
      requests.push(request)
      const route = routes[`${request.method} ${request.path}`]
      if (route === undefined) return failure('not_found', 404)
      try {
        return await route(request)
      } catch {
        throw new TypeError('Failed to fetch')
      }
    },
  )
  return { requests }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

export function failure(
  code: string,
  status: number,
  headers?: HeadersInit,
): Response {
  return Response.json(
    { error: { code, message: 'English text for developers' } },
    { status, headers },
  )
}

export function offline(): never {
  throw new Error('offline')
}

/** An invented account, a member who cannot chat unless told otherwise. */
export function aUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-member',
    username: 'mai',
    displayName: 'Mai',
    role: 'member',
    canChat: false,
    language: null,
    ...overrides,
  }
}
