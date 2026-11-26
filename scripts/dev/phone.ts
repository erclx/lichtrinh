// Shares the dev server with the owner's own devices through Tailscale on
// Windows, never through Funnel, and draws the code a phone scans. Every
// read fails closed: output that does not parse reads as not ready.

import { spawn } from 'node:child_process'

import { renderUnicodeCompact } from 'uqr'
import { z } from 'zod'

import type { Miss } from './prerequisites'

/** What one `tailscale.exe` call printed and how it ended. */
export interface Ran {
  code: number
  stdout: string
  stderr: string
}

/** Runs `tailscale.exe` with the arguments, passed in so a test scripts it. */
export type Tailscale = (args: readonly string[]) => Promise<Ran>

/** The values the app needs to answer the tailnet name with its database page shut. */
export function phoneEnv(host: string): Record<string, string> {
  return {
    LICHTRINH_PHONE: '1',
    __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: host,
    X_LOCAL_EXPLORER: 'false',
  }
}

// The shell convention for a command that could not be found or started.
const NOT_FOUND = 127
const WAIT_MS = 20_000
const OFF_COMMAND = 'tailscale.exe serve --https=443 off'

// Tailscale prints many more keys than these, which z.object drops.
const Status = z.object({
  BackendState: z.string(),
  Self: z.object({ DNSName: z.string() }),
  CertDomains: z.array(z.string()).nullable().optional(),
})

const Config = z.object({
  TCP: z
    .record(z.string(), z.object({ HTTPS: z.boolean().optional() }))
    .optional(),
  Web: z
    .record(
      z.string(),
      z.object({
        Handlers: z
          .record(z.string(), z.object({ Proxy: z.string().optional() }))
          .optional(),
      }),
    )
    .optional(),
  AllowFunnel: z.record(z.string(), z.boolean()).optional(),
})
// A share someone runs in the foreground lives under its session's id.
const Serve = Config.extend({
  Foreground: z.record(z.string(), Config).optional(),
})
type Config = z.infer<typeof Config>
type Serve = z.infer<typeof Serve>

/** This machine's tailnet name, or what to fix before it can share. */
export async function readTailnet(
  tailscale: Tailscale,
): Promise<{ host: string } | Miss> {
  const ran = await tailscale(['status', '--json'])
  if (ran.code === NOT_FOUND) {
    return {
      need: 'Tailscale on Windows',
      fix: 'Install it from tailscale.com/download, sign in, and run this again.',
    }
  }
  const status = Status.safeParse(parseJson(ran.stdout))
  if (ran.code !== 0 || !status.success) {
    return {
      need: 'a readable Tailscale status',
      fix: 'Run tailscale.exe status in PowerShell to see why it fails.',
    }
  }
  const { BackendState, Self, CertDomains } = status.data
  if (BackendState !== 'Running') {
    return {
      need: 'Tailscale signed in and connected',
      fix: `It reads ${BackendState}. Sign in and connect from its icon in the Windows tray.`,
    }
  }
  const host = Self.DNSName.replace(/\.$/, '')
  if (host === '') {
    return {
      need: 'a tailnet name for this machine',
      fix: 'Turn on MagicDNS on the DNS page of the Tailscale admin console.',
    }
  }
  if (!(CertDomains ?? []).includes(host)) {
    return {
      need: 'HTTPS certificates on the tailnet',
      fix: 'Turn on HTTPS Certificates on the DNS page of the Tailscale admin console.',
    }
  }
  return { host }
}

/** Why the address cannot take this run's share, or undefined when it can. */
export async function checkAddress(
  tailscale: Tailscale,
  host: string,
  port: number,
): Promise<Miss | undefined> {
  const address = readAddress(await readServe(tailscale), host, port)
  if (address === undefined) {
    return {
      need: 'a readable Tailscale serve status',
      fix: 'Run tailscale.exe serve status in PowerShell to see why it fails.',
    }
  }
  if (address.funnel) {
    return {
      need: 'Funnel off',
      fix: 'Turn Funnel off before sharing, since a share beside it can be public.',
    }
  }
  if (address.holder === 'other') {
    return {
      need: `the tailnet address free for port ${port}`,
      fix: `It already holds ${address.other}. Stop the run serving it, or remove the share with ${OFF_COMMAND} once nothing uses it.`,
    }
  }
  return undefined
}

/**
 * Shares the port at the tailnet address in the background and reads it
 * back. Resolves with what went wrong, or undefined once the share is this
 * run's. A failure can still leave a share, so the caller closes either way.
 */
export async function openShare(
  tailscale: Tailscale,
  host: string,
  port: number,
): Promise<string | undefined> {
  const refused = await checkAddress(tailscale, host, port)
  if (refused !== undefined)
    return `Not shared, needs ${refused.need}: ${refused.fix}`
  const ran = await tailscale([
    'serve',
    '--bg',
    '--yes',
    '--https=443',
    target(port),
  ])
  if (ran.code !== 0) {
    return `Tailscale refused the share with ${ran.code}: ${ran.stderr.trim()}`
  }
  const after = readAddress(await readServe(tailscale), host, port)
  if (after?.holder !== 'ours' || after.funnel) {
    return `The share did not read back as this run’s alone. ${closeFailure().trim()}`
  }
  return undefined
}

/** How closing went: gone, left for being someone else's, or still there. */
export type Closed = 'closed' | 'left' | 'failed'

/** Removes this run's share and reads the status again to confirm it is gone. */
export async function closeShare(
  tailscale: Tailscale,
  host: string,
  port: number,
): Promise<Closed> {
  const before = readAddress(await readServe(tailscale), host, port)
  if (before === undefined) return 'failed'
  if (before.holder === 'free') return 'closed'
  if (before.holder === 'other') return 'left'
  await tailscale(['serve', '--https=443', 'off'])
  const after = readAddress(await readServe(tailscale), host, port)
  return after?.holder === 'free' ? 'closed' : 'failed'
}

/** The line a run prints when its share may still be open. */
export function closeFailure(): string {
  return `The phone share may still be open. Remove it in PowerShell with: ${OFF_COMMAND}\n`
}

/** The code a phone scans, with the link beneath it. */
export function phoneBanner(host: string): string {
  const url = `https://${host}/`
  return [
    '',
    renderUnicodeCompact(url),
    `  Scan with the iPhone camera, or open ${url}`,
    '  Add it to the home screen and judge from the icon, which keeps the sign-in.',
    '',
  ].join('\n')
}

/** Runs the Windows program from WSL, out of the terminal's group so a Ctrl-C leaves a removal running. */
export function tailscaleExe(args: readonly string[]): Promise<Ran> {
  return new Promise((settle) => {
    const child = spawn('tailscale.exe', args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: WAIT_MS,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk
    })
    child.once('error', () => settle({ code: NOT_FOUND, stdout, stderr }))
    child.once('close', (code) => settle({ code: code ?? 1, stdout, stderr }))
  })
}

/** The status a sessionless query to the dev server's database page answers, or undefined when nothing does. */
export async function databasePage(
  appUrl: string,
): Promise<number | undefined> {
  try {
    const reply = await fetch(
      new URL('/cdn-cgi/local/explorer/api/d1/database/DB/raw', appUrl),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql: 'SELECT 1' }),
        signal: AbortSignal.timeout(5_000),
      },
    )
    return reply.status
  } catch {
    return undefined
  }
}

function target(port: number): string {
  return `http://127.0.0.1:${port}`
}

async function readServe(tailscale: Tailscale): Promise<Serve | undefined> {
  const ran = await tailscale(['serve', 'status', '--json'])
  if (ran.code !== 0) return undefined
  const serve = Serve.safeParse(parseJson(ran.stdout))
  return serve.success ? serve.data : undefined
}

interface Address {
  funnel: boolean
  holder: 'free' | 'ours' | 'other'
  /** What holds the address when it is not this run's. */
  other?: string
}

/** Who holds port 443 on the host, read across the background and foreground shares. */
function readAddress(
  serve: Serve | undefined,
  host: string,
  port: number,
): Address | undefined {
  if (serve === undefined) return undefined
  const foreground = Object.values(serve.Foreground ?? {})
  const funnel = [serve, ...foreground].some((config) =>
    Object.values(config.AllowFunnel ?? {}).some(Boolean),
  )
  if (foreground.some((config) => holds(config, host))) {
    return {
      funnel,
      holder: 'other',
      other: 'a share running in the foreground',
    }
  }
  if (!holds(serve, host)) return { funnel, holder: 'free' }
  const handlers = Object.entries(serve.Web?.[`${host}:443`]?.Handlers ?? {})
  const [only] = handlers
  if (
    serve.TCP?.['443']?.HTTPS === true &&
    handlers.length === 1 &&
    only?.[0] === '/' &&
    only[1].Proxy !== undefined &&
    proxiesTo(only[1].Proxy, port)
  ) {
    return { funnel, holder: 'ours' }
  }
  const proxy = only?.[1].Proxy
  return {
    funnel,
    holder: 'other',
    other:
      handlers.length === 1 && proxy !== undefined
        ? proxy
        : 'something this run did not make',
  }
}

function holds(config: Config, host: string): boolean {
  return (
    config.TCP?.['443'] !== undefined ||
    config.Web?.[`${host}:443`] !== undefined
  )
}

function proxiesTo(proxy: string, port: number): boolean {
  try {
    const url = new URL(proxy)
    return (
      url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost'].includes(url.hostname) &&
      url.port === String(port)
    )
  } catch {
    return false
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
