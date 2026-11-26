import type { Ran, Tailscale } from '../phone.ts'

export const HOST = 'desk.example.ts.net'

/** The status of a machine signed in, connected, and holding its certificate. */
export function readyStatus(): Record<string, unknown> {
  return {
    BackendState: 'Running',
    Self: { DNSName: `${HOST}.` },
    CertDomains: [HOST],
  }
}

/** The serve config a background share of the port at the address reads as. */
export function shareOf(port: number): Record<string, unknown> {
  return {
    TCP: { '443': { HTTPS: true } },
    Web: {
      [`${HOST}:443`]: {
        Handlers: { '/': { Proxy: `http://127.0.0.1:${port}` } },
      },
    },
  }
}

type Call = 'status' | 'serve status' | 'open' | 'off'

/**
 * A stand-in for `tailscale.exe` holding one serve config: an open sets it
 * to the share it names, and an off clears it. A reply in `replies` takes
 * the place of a call's own, and leaves the config as it was.
 */
export function fakeTailscale(
  options: {
    status?: unknown
    serve?: Record<string, unknown>
    replies?: Partial<Record<Call, Ran>>
  } = {},
) {
  const calls: (readonly string[])[] = []
  let serve = options.serve ?? {}
  const tailscale: Tailscale = async (args) => {
    calls.push(args)
    const call = callOf(args)
    const reply = options.replies?.[call]
    if (reply !== undefined) return reply
    if (call === 'status') return ok(options.status ?? readyStatus())
    if (call === 'serve status') return ok(serve)
    if (call === 'off') {
      serve = {}
      return ok('')
    }
    const port = Number(new URL(args.at(-1) ?? '').port)
    serve = shareOf(port)
    return ok('')
  }
  return { tailscale, calls, serve: () => serve }
}

function callOf(args: readonly string[]): Call {
  if (args[0] === 'status') return 'status'
  if (args[1] === 'status') return 'serve status'
  return args.at(-1) === 'off' ? 'off' : 'open'
}

function ok(body: unknown): Ran {
  return {
    code: 0,
    stdout: typeof body === 'string' ? body : JSON.stringify(body),
    stderr: '',
  }
}
