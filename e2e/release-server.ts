import { readFile, stat } from 'node:fs/promises'
import { createServer, request as forward } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { build, loadConfigFromFile, type PluginOption } from 'vite'

/** One built copy of the app, as a release puts it on the static host. */
export interface Release {
  dir: string
  /** The entry script its `index.html` names, which moves with the version. */
  entry: string
}

const root = path.resolve(import.meta.dirname, '..')

function isCloudflare(plugin: PluginOption): boolean {
  return (
    typeof plugin === 'object' &&
    plugin !== null &&
    'name' in plugin &&
    plugin.name.startsWith('vite-plugin-cloudflare')
  )
}

// The Cloudflare plugin rewrites `.wrangler/deploy/config.json` to point at
// whatever it built last, which a later deploy or preview would then read.
async function withoutCloudflare(
  plugins: PluginOption[],
): Promise<PluginOption[]> {
  const kept: PluginOption[] = []
  for (const plugin of await Promise.all(plugins)) {
    if (Array.isArray(plugin)) kept.push(...(await withoutCloudflare(plugin)))
    else if (plugin && !isCloudflare(plugin)) kept.push(plugin)
  }
  return kept
}

/**
 * Builds the app as `version` into `outDir`, with the repository's own
 * config less the Cloudflare plugin, so the worker and the precache are the
 * ones a release ships.
 */
export async function buildRelease(
  version: string,
  outDir: string,
): Promise<Release> {
  const loaded = await loadConfigFromFile(
    { command: 'build', mode: 'production' },
    path.join(root, 'vite.config.ts'),
  )
  if (loaded === null) throw new Error('No vite.config.ts to build from')
  const { config } = loaded
  await build({
    ...config,
    configFile: false,
    root,
    logLevel: 'warn',
    plugins: await withoutCloudflare(config.plugins ?? []),
    define: { ...config.define, __APP_VERSION__: JSON.stringify(version) },
    build: { outDir, emptyOutDir: true },
  })
  const html = await readFile(path.join(outDir, 'index.html'), 'utf8')
  const entry = /<script type="module"[^>]*src="([^"]+)"/.exec(html)?.[1]
  if (entry === undefined) throw new Error(`No entry script in ${outDir}`)
  return { dir: outDir, entry }
}

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

async function fileIn(dir: string, pathname: string): Promise<string | null> {
  const file = path.join(dir, path.normalize(decodeURIComponent(pathname)))
  if (!file.startsWith(dir)) return null
  try {
    return (await stat(file)).isFile() ? file : null
  } catch {
    return null
  }
}

/** A static host whose release can be swapped under an open page. */
export interface ReleaseServer {
  url: string
  serve: (release: Release) => void
  close: () => Promise<void>
}

/**
 * Serves one release at a time from a loopback address, answering a path
 * with no file with `index.html` as the static host does, and passing `/api/`
 * to the dev server at `apiURL`, whose sign-in cookie covers any port.
 */
export async function startReleaseServer(
  apiURL: string,
  first: Release,
): Promise<ReleaseServer> {
  let current = first
  const api = new URL(apiURL)
  const server = createServer((incoming, outgoing) => {
    const url = new URL(incoming.url ?? '/', 'http://localhost')
    if (url.pathname.startsWith('/api/')) {
      // The API's CSRF check compares the origin with its own.
      const headers = { ...incoming.headers, host: api.host }
      if (headers.origin !== undefined) headers.origin = api.origin
      const upstream = forward(
        new URL(url.pathname + url.search, api),
        { method: incoming.method, headers },
        (answer) => {
          outgoing.writeHead(answer.statusCode ?? 502, answer.headers)
          answer.pipe(outgoing)
        },
      )
      upstream.on('error', () => outgoing.writeHead(502).end())
      incoming.pipe(upstream)
      return
    }
    const { dir } = current
    // As the host's single page mode does, only a navigation falls back to
    // `index.html`, so a file the swap removed answers 404.
    const navigation = incoming.headers['sec-fetch-mode'] === 'navigate'
    void (async () => {
      const found = await fileIn(dir, url.pathname)
      if (found === null && !navigation) {
        outgoing.writeHead(404, { 'cache-control': 'no-store' }).end()
        return
      }
      const file = found ?? path.join(dir, 'index.html')
      const body = await readFile(file)
      outgoing.writeHead(200, {
        'content-type': types[path.extname(file)] ?? 'application/octet-stream',
        // The swap has to reach the browser's next ask, as a deploy would.
        'cache-control': 'no-store',
      })
      outgoing.end(body)
    })()
  })
  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://localhost:${port}`,
    serve: (release) => {
      current = release
    },
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  }
}
