import { env } from 'cloudflare:workers'

import { app } from '../app.ts'

/** A few invented bytes labeled as audio, never a recording. */
export const FAKE_CLIP = new TextEncoder().encode('invented clip bytes')

/** Sends a clip the way the talk button does, raw in the body. */
export function sendClip(
  cookie: string,
  options: { id?: string; type?: string; body?: BodyInit } = {},
) {
  return app.request(
    `/api/voice/transcriptions/${options.id ?? crypto.randomUUID()}`,
    {
      method: 'PUT',
      headers: {
        cookie,
        'content-type': options.type ?? 'audio/webm;codecs=opus',
      },
      body: options.body ?? FAKE_CLIP,
    },
    env,
  )
}

/** Sends the bytes of a clip still being spoken, from the byte named. */
export function sendPiece(
  cookie: string,
  options: {
    id?: string
    from?: number | string
    type?: string
    body?: BodyInit
  } = {},
) {
  return app.request(
    `/api/voice/live/${options.id ?? crypto.randomUUID()}?from=${options.from ?? 0}`,
    {
      method: 'PUT',
      headers: { cookie, 'content-type': options.type ?? 'audio/webm' },
      body: options.body ?? FAKE_CLIP,
    },
    env,
  )
}
