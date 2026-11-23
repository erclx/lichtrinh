import { expect, test } from '@playwright/test'

import { DEMO_DAY, DEMO_INSTANT, FIXTURE_ACCOUNTS } from '../scripts/seed'

const fixtureAdmin = FIXTURE_ACCOUNTS.find(({ role }) => role === 'admin')
const dayPath = `/trips/${DEMO_DAY.tripId}/days/${DEMO_DAY.date}`

// The dev server registers no service worker, so this cuts the API alone
// and leaves the page itself to load, the part the worker covers in a build.
test('a day loaded once reads the same entries after an offline reload', async ({
  page,
  browserName,
}) => {
  // Linux WebKit drops Secure cookies on http://localhost, unlike iPhone Safari.
  test.skip(browserName === 'webkit', 'Linux WebKit drops the Secure cookie')
  if (fixtureAdmin === undefined) throw new Error('The seed holds no admin')
  // Installed, not pinned, so the saved plan goes stale and its refresh fails.
  await page.clock.install({ time: new Date(DEMO_INSTANT) })
  const signIn = await page.request.post('/api/auth/sign-in', {
    data: { username: fixtureAdmin.username, password: fixtureAdmin.password },
  })
  expect(signIn.ok()).toBe(true)

  await page.goto(dayPath)
  await expect(page.getByText('Sunset boat trip')).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('lichtrinh.calendarCache')),
    )
    .toContain('Sunset boat trip')
  await page.clock.fastForward('01:00')

  await page.route('**/api/**', (route) => route.abort('internetdisconnected'))
  await page.reload()

  await expect(
    page.getByRole('status').getByText('No connection'),
  ).toBeVisible()
  await expect(page.getByText('Sunset boat trip')).toBeVisible()
  await expect(page.getByText('Sông Mây flower market')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /^Add an activity on/ }),
  ).toHaveAttribute('aria-disabled', 'true')

  // Steps the clock past the refresh's retries until its failure is saved.
  await expect
    .poll(
      async () => {
        await page.clock.fastForward('00:05')
        const saved = await page.evaluate(
          () => localStorage.getItem('lichtrinh.calendarCache') ?? '',
        )
        return (
          saved.includes('"status":"error"') ||
          !saved.includes('Sunset boat trip')
        )
      },
      { timeout: 15_000 },
    )
    .toBe(true)
  await page.reload()

  await expect(
    page.getByRole('status').getByText('No connection'),
  ).toBeVisible()
  await expect(page.getByText('Sunset boat trip')).toBeVisible()
})
