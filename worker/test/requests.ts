// The origin `app.request` gives a relative path, so a same-origin header in
// a spec names it.
export const TEST_ORIGIN = 'http://localhost'

/** A JSON request, signed in when a session cookie is passed. */
export function json(
  method: string,
  body: unknown,
  cookie?: string,
): RequestInit {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (cookie !== undefined) headers.cookie = cookie
  return { method, headers, body: JSON.stringify(body) }
}

/**
 * A bodiless request, signed in when a session cookie is passed. It carries
 * the same-origin header a browser sends, since csrf() reads a POST with no
 * content type as a form.
 */
export function bare(method: string, cookie?: string): RequestInit {
  const headers: Record<string, string> = { origin: TEST_ORIGIN }
  if (cookie !== undefined) headers.cookie = cookie
  return { method, headers }
}

/** The `name=value` pair a response set, ready to send back as a cookie. */
export function cookieFrom(res: Response): string {
  const set = res.headers.get('set-cookie') ?? ''
  const pair = /^([^=;]+=[^;]*)/.exec(set)
  if (pair === null) throw new Error('The response set no cookie')
  return pair[1]
}
