import { expect, test } from '@playwright/test'
import { apiError } from '@shared/errors.ts'
import { health } from '@shared/health.ts'

test('the dev server routes /api to the Worker', async ({ request }) => {
  const res = await request.get('/api/health')

  expect(res.status()).toBe(200)
  expect(health.parse(await res.json())).toEqual({ status: 'ok' })
})

// A navigation carries Sec-Fetch-Mode: navigate, which the asset layer would
// answer with the app shell unless the API runs first. Signed out, the guard
// answers before routing, so an unknown path reads 401 rather than 404.
test('a navigation to an unknown API path answers the JSON envelope, not the app shell', async ({
  page,
}) => {
  const res = await page.goto('/api/nope')

  expect(res?.status()).toBe(401)
  expect(apiError.parse(await res?.json()).error.code).toBe('unauthenticated')
})
