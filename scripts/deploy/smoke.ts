/** `blocked` means Cloudflare challenged the caller, so the app was never asked. */
export type SmokeResult = 'ok' | 'failed' | 'blocked'

export interface SmokeCheck {
  host: string
  /** The build's commit stamp, or undefined when any live build will do. */
  stamp: string | undefined
  fetch: (url: string, init: RequestInit) => Promise<Response>
  write: (text: string) => void
  now: () => number
  wait: (ms: number) => Promise<void>
}

interface Problem {
  result: 'failed' | 'blocked'
  detail: string
}

interface Answer {
  headers: Headers
  text: string
}

const DEADLINE_MS = 60_000
const POLL_MS = 3_000
const REQUEST_MS = 10_000

const API_ROUTES = [
  ['/api/health', 200],
  ['/api/trips', 401],
  ['/api/bridge/connect', 401],
] as const

/**
 * Polls a live host until it answers as a deployed copy should to a stranger.
 * Reports paths and statuses alone, since a body may hold private text.
 */
export async function smokeCheck(check: SmokeCheck): Promise<SmokeResult> {
  const start = check.now()
  for (;;) {
    const problem = await findProblem(check)
    if (problem === undefined) return 'ok'
    const last = check.now() - start + POLL_MS > DEADLINE_MS
    if (last || problem.result === 'blocked') {
      check.write(`${check.host} ${problem.detail}\n`)
      return problem.result
    }
    await check.wait(POLL_MS)
  }
}

async function findProblem(check: SmokeCheck): Promise<Problem | undefined> {
  const shell = await ask(check, '/', 200)
  if ('result' in shell) return shell
  if (!/\bnoindex\b/.test(shell.headers.get('x-robots-tag') ?? '')) {
    return { result: 'failed', detail: 'answered / without noindex' }
  }
  if (check.stamp !== undefined && !shell.text.includes(check.stamp)) {
    return { result: 'failed', detail: 'answers / from another build' }
  }
  for (const [path, status] of API_ROUTES) {
    const answer = await ask(check, path, status)
    if ('result' in answer) return answer
  }
  return undefined
}

async function ask(
  check: SmokeCheck,
  path: string,
  expected: number,
): Promise<Answer | Problem> {
  try {
    const response = await check.fetch(`https://${check.host}${path}`, {
      redirect: 'manual',
      headers: { 'user-agent': 'deploy-smoke-check' },
      signal: AbortSignal.timeout(REQUEST_MS),
    })
    if (response.headers.get('cf-mitigated') === 'challenge') {
      return {
        result: 'blocked',
        detail: `had Cloudflare challenge ${path}, so the app was not reached`,
      }
    }
    if (response.status !== expected) {
      return {
        result: 'failed',
        detail: `answered ${path} with ${response.status}, not ${expected}`,
      }
    }
    return { headers: response.headers, text: await response.text() }
  } catch {
    return { result: 'failed', detail: `did not answer ${path}` }
  }
}
