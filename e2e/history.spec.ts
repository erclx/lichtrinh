import { expect, test } from '@playwright/test'

import { FIXTURE_ACCOUNTS } from '../scripts/seed'

const fixtureAdmin = FIXTURE_ACCOUNTS.find(({ role }) => role === 'admin')

test('a person reads a trip’s history, is refused an older undo, and undoes the newer change', async ({
  page,
}) => {
  if (fixtureAdmin === undefined) throw new Error('The seed holds no admin')
  const tripId = crypto.randomUUID()
  const entryId = crypto.randomUUID()

  const signIn = await page.request.post('/api/auth/sign-in', {
    data: { username: fixtureAdmin.username, password: fixtureAdmin.password },
  })
  expect(signIn.ok()).toBe(true)
  const trip = await page.request.post('/api/trips', {
    data: {
      id: tripId,
      name: 'Garden visit',
      startsOn: '2031-09-20',
      endsOn: '2031-09-24',
      timeZone: 'Asia/Ho_Chi_Minh',
      currency: 'VND',
      homeCurrency: 'USD',
    },
  })
  expect(trip.ok()).toBe(true)
  const entry = await page.request.post('/api/entries', {
    data: {
      id: entryId,
      tripId,
      title: 'Coffee break',
      startsOn: '2031-09-20',
      startTime: '09:00',
      endsOn: '2031-09-20',
      endTime: '10:00',
    },
  })
  expect(entry.ok()).toBe(true)
  const edit = await page.request.patch(`/api/entries/${entryId}`, {
    data: { version: 1, startTime: '09:30', endTime: '10:30' },
  })
  expect(edit.ok()).toBe(true)

  await page.goto(`/trips/${tripId}`)
  await page.getByRole('link', { name: 'Change history' }).click()
  await expect(
    page.getByRole('heading', { name: 'Change history' }),
  ).toBeVisible()
  const added = page
    .getByRole('listitem')
    .filter({ hasText: 'Added “Coffee break”' })
  const moved = page
    .getByRole('listitem')
    .filter({ hasText: 'Moved “Coffee break” 09:00 → 09:30' })

  await added.getByRole('button').click()
  await expect(added.getByRole('status')).toContainText('someone changed it')

  await moved.getByRole('button').click()
  await expect(moved.getByText('Undone', { exact: true })).toBeVisible()
  await expect(page.getByRole('listitem').first()).toContainText(
    'Moved “Coffee break” 09:30 → 09:00',
  )

  await page.goto(`/trips/${tripId}/days/2031-09-20`)
  await expect(page.getByRole('link', { name: /Coffee break/ })).toContainText(
    '09:00',
  )
})
