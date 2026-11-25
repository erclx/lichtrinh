import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { Context } from 'hono'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { serveStatic } from 'hono/serve-static'

import type { PanelError, PanelErrorCode } from '../state.ts'
import { allAction, serviceAction, serviceId } from '../state.ts'
import type { Machine } from './machine.ts'
import { ActionFailed } from './run.ts'

export interface AppOptions {
  machine: Machine
  port: number
  /** The folder holding the built page, absent where a test drives the API. */
  pageRoot?: string
  log?: (event: string, fields: Record<string, string>) => void
}

/**
 * The panel's API and page. Any site open in the same browser can send it a
 * request, so every route refuses a foreign `Host` and every write needs the
 * browser's own word that the panel sent it.
 */
export function createApp({ machine, port, pageRoot, log }: AppOptions) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
  const app = new Hono()

  // No other page may frame this one, since a click on it can stop a service.
  app.use('*', secureHeaders({ xFrameOptions: 'DENY' }))

  app.use('*', async (c, next) => {
    const host = c.req.header('host')
    if (host === undefined || !hosts.has(host)) {
      return fail(c, 'forbidden', 'The panel answers its own address alone')
    }
    const reads = c.req.method === 'GET' || c.req.method === 'HEAD'
    const own =
      c.req.header('sec-fetch-site') === 'same-origin' ||
      c.req.header('origin') === `http://${host}`
    if (!reads && !own) {
      return fail(c, 'forbidden', 'Only the panel may ask for an action')
    }
    await next()
  })

  app.get('/api/state', async (c) => {
    c.header('cache-control', 'no-store')
    return c.json(await machine.read())
  })

  app.post('/api/services/:id/:action', async (c) => {
    const id = serviceId.safeParse(c.req.param('id'))
    const action = serviceAction.safeParse(c.req.param('action'))
    const act =
      id.success && action.success
        ? machine.actionOf(id.data, action.data)
        : undefined
    if (act === undefined) return missing(c)
    await act()
    return c.json({ ok: true })
  })

  app.post('/api/all/:action', async (c) => {
    const action = allAction.safeParse(c.req.param('action'))
    if (!action.success) return missing(c)
    await machine.all(action.data)
    return c.json({ ok: true })
  })

  app.all('/api/*', missing)

  if (pageRoot !== undefined) {
    app.get(
      '*',
      serveStatic({ root: pageRoot, join, getContent: readPage, isDir }),
    )
  }

  app.notFound(missing)

  app.onError((error, c) => {
    const failed = error instanceof ActionFailed
    log?.(failed ? 'action_failed' : 'internal_error', {
      path: c.req.path,
      error: failed ? error.message : error.name,
    })
    return failed
      ? fail(c, 'action_failed', error.message)
      : fail(c, 'internal_error', 'The panel hit an unexpected fault')
  })

  return app
}

const STATUS = {
  not_found: 404,
  forbidden: 403,
  action_failed: 502,
  internal_error: 500,
} as const satisfies Record<PanelErrorCode, number>

function fail(c: Context, code: PanelErrorCode, message: string) {
  return c.json<PanelError>({ error: { code, message } }, STATUS[code])
}

function missing(c: Context) {
  return fail(c, 'not_found', 'Nothing here')
}

// The page names its own assets by hash, so only this read may be stale.
async function readPage(path: string, c: Context) {
  if (path.endsWith('.html')) c.header('cache-control', 'no-cache')
  try {
    return new Uint8Array(await readFile(path))
  } catch {
    return null
  }
}

async function isDir(path: string) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return undefined
  }
}
