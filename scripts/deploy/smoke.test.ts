import { describe, expect, it } from 'vitest'

import { type SmokeCheck, smokeCheck } from './smoke'

const SCRIPT = '/assets/index-new.js'

function shell({
  script = SCRIPT,
  noindex = true,
}: { script?: string; noindex?: boolean } = {}) {
  return new Response(`<script type="module" src="${script}"></script>`, {
    headers: noindex ? { 'x-robots-tag': 'noindex' } : {},
  })
}

const status = (code: number) => new Response('invented body', { status: code })

const HEALTHY: Record<string, () => Response> = {
  '/': () => shell(),
  '/api/health': () => status(200),
  '/api/trips': () => status(401),
  '/api/bridge/connect': () => status(401),
}

/** A clock that moves only when the check waits, so no test sleeps. */
function smoke(
  answers: Record<string, () => Response> = {},
  overrides: Partial<SmokeCheck> = {},
) {
  let clock = 0
  const lines: string[] = []
  const requests: { url: string; init: RequestInit }[] = []
  const check: SmokeCheck = {
    host: 'app.example.com',
    script: SCRIPT,
    fetch: async (url, init) => {
      requests.push({ url, init })
      const answer = { ...HEALTHY, ...answers }[new URL(url).pathname]
      if (answer === undefined) throw new Error(`no answer for ${url}`)
      return answer()
    },
    write: (text) => lines.push(text),
    now: () => clock,
    wait: async (ms) => {
      clock += ms
    },
    ...overrides,
  }
  return { check, lines, requests, clock: () => clock }
}

describe('smokeCheck', () => {
  it('answers ok when the shell and the three routes answer as expected', async () => {
    const { check, clock } = smoke()

    expect(await smokeCheck(check)).toBe('ok')
    expect(clock()).toBe(0)
  })

  it.each([
    ['health answers 500', { '/api/health': () => status(500) }],
    ['a data route answers signed out', { '/api/trips': () => status(200) }],
    [
      'the bridge route opens with no secret',
      { '/api/bridge/connect': () => status(200) },
    ],
    ['the shell may be indexed', { '/': () => shell({ noindex: false }) }],
    ['the shell is missing', { '/': () => status(404) }],
    ['the host redirects elsewhere', { '/': () => status(301) }],
    [
      'the host does not answer',
      {
        '/': () => {
          throw new TypeError('fetch failed')
        },
      },
    ],
  ])('answers failed when %s', async (_case, answers) => {
    const { check } = smoke(answers)

    expect(await smokeCheck(check)).toBe('failed')
  })

  it('gives up after 60 seconds', async () => {
    const { check, clock } = smoke({ '/api/health': () => status(500) })

    await smokeCheck(check)

    expect(clock()).toBeLessThanOrEqual(60_000)
    expect(clock()).toBeGreaterThan(50_000)
  })

  it('keeps polling while the old version still answers', async () => {
    const shells = ['/assets/index-old.js', '/assets/index-old.js']
    const { check, clock } = smoke({
      '/': () => shell({ script: shells.shift() ?? SCRIPT }),
    })

    expect(await smokeCheck(check)).toBe('ok')
    expect(clock()).toBeGreaterThan(0)
  })

  it('fails when the old version never gives way', async () => {
    const { check } = smoke({
      '/': () => shell({ script: '/assets/index-old.js' }),
    })

    expect(await smokeCheck(check)).toBe('failed')
  })

  it('takes any build when it is told of none, as after a rollback', async () => {
    const { check } = smoke(
      { '/': () => shell({ script: '/assets/index-old.js' }) },
      { script: undefined },
    )

    expect(await smokeCheck(check)).toBe('ok')
  })

  it('answers blocked, not failed, when Cloudflare challenges the runner', async () => {
    const challenge = () =>
      new Response('invented body', {
        status: 403,
        headers: { 'cf-mitigated': 'challenge' },
      })
    const { check } = smoke({ '/api/health': challenge })

    expect(await smokeCheck(check)).toBe('blocked')
  })

  it('follows no redirect, so another site never answers for this one', async () => {
    const { check, requests } = smoke()

    await smokeCheck(check)

    expect(requests.map(({ init }) => init.redirect)).toEqual(
      requests.map(() => 'manual'),
    )
  })

  it('names the path that failed and never prints a body', async () => {
    const { check, lines } = smoke({ '/api/health': () => status(500) })

    await smokeCheck(check)

    expect(lines.join('')).toContain('/api/health')
    expect(lines.join('')).not.toContain('invented body')
  })
})
