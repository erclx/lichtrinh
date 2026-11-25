import { readFile } from 'node:fs/promises'

import { type APIRequestContext, expect, test } from '@playwright/test'
import { backup } from '@shared/backup.ts'
import type { CreateEntryRequest } from '@shared/entries.ts'
import type { CreateTripRequest } from '@shared/trips.ts'

import { FIXTURE_ACCOUNTS, type FixtureAccount } from '../scripts/seed'

function fixture(role: FixtureAccount['role']) {
  const account = FIXTURE_ACCOUNTS.find((one) => one.role === role)
  if (account === undefined) throw new Error(`The seed holds no ${role}`)
  return account
}

async function signIn(request: APIRequestContext, account: FixtureAccount) {
  const { username, password } = account
  const response = await request.post('/api/auth/sign-in', {
    data: { username, password },
  })
  expect(response.ok()).toBe(true)
}

test('the admin downloads a file holding the trip and entry just made', async ({
  page,
}) => {
  const trip: CreateTripRequest = {
    id: crypto.randomUUID(),
    name: 'Trip to Đảo Gió',
    startsOn: '2031-10-04',
    endsOn: '2031-10-08',
    timeZone: 'Asia/Ho_Chi_Minh',
    currency: 'VND',
    homeCurrency: 'USD',
  }
  const entry: CreateEntryRequest = {
    id: crypto.randomUUID(),
    tripId: trip.id,
    title: 'Lantern walk',
    startsOn: '2031-10-05',
    startTime: '18:00',
    endsOn: '2031-10-05',
    endTime: '19:30',
  }
  await signIn(page.request, fixture('admin'))
  const madeTrip = await page.request.post('/api/trips', { data: trip })
  expect(madeTrip.ok()).toBe(true)
  const madeEntry = await page.request.post('/api/entries', { data: entry })
  expect(madeEntry.ok()).toBe(true)

  await page.goto('/admin/accounts')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download backup' }).click()
  const download = await downloading

  const file = backup.parse(
    JSON.parse(await readFile(await download.path(), 'utf8')),
  )
  expect(download.suggestedFilename()).toBe(
    `lichtrinh-backup-${file.exportedAt.slice(0, 10)}.json`,
  )
  expect(file.trips).toContainEqual({
    trip: expect.objectContaining(trip),
    entries: [expect.objectContaining(entry)],
  })
})

test('a member is refused the backup', async ({ page }) => {
  await signIn(page.request, fixture('member'))

  const refused = await page.request.get('/api/admin/backup')

  expect(refused.status()).toBe(403)
})
