import { expect, test } from '@playwright/test'

import { FIXTURE_ACCOUNTS } from '../scripts/seed'

const fixtureAdmin = FIXTURE_ACCOUNTS.find(({ role }) => role === 'admin')

test('a person makes a trip, adds an entry from its day, deletes it, and undoes the delete', async ({
  page,
}) => {
  if (fixtureAdmin === undefined) throw new Error('The seed holds no admin')
  // Only the date is pinned, so the range sheet opens on September 2031.
  await page.clock.setFixedTime(new Date('2031-09-15T03:00:00Z'))
  const tripName = `Home visit ${crypto.randomUUID().slice(0, 6)}`

  const signIn = await page.request.post('/api/auth/sign-in', {
    data: { username: fixtureAdmin.username, password: fixtureAdmin.password },
  })
  expect(signIn.ok()).toBe(true)
  await page.goto('/trips/new')

  await page.getByLabel('Trip name').fill(tripName)
  await page.getByRole('button', { name: /^From/ }).click()
  const dates = page.getByRole('dialog', { name: 'Trip dates' })
  await dates.getByRole('button', { name: '20', exact: true }).click()
  await dates.getByRole('button', { name: '24', exact: true }).click()
  await dates.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Create trip' }).click()

  await expect(page.getByRole('heading', { name: tripName })).toBeVisible()
  await page.getByRole('link', { name: /^Day 1/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Saturday, September 20' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Add', exact: true }).click()
  await page.getByLabel('What is it?').fill('Coffee break')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  const row = page.getByRole('link', { name: /Coffee break/ })
  await expect(page.getByRole('status')).toContainText('Added “Coffee break”')
  await row.click()
  await page.getByRole('button', { name: 'Delete this activity' }).click()
  await page
    .getByRole('alertdialog', { name: 'Delete “Coffee break”?' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click()

  await expect(page.getByText('Nothing planned this day yet.')).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Deleted “Coffee break”')
  await page.getByRole('button', { name: 'Undo' }).click()

  await expect(page.getByRole('status')).toContainText('Undone')
  await expect(row).toBeVisible()
})
