import { expect, test } from '@playwright/test'

import { FIXTURE_ACCOUNTS } from '../scripts/seed'

const fixtureAdmin = FIXTURE_ACCOUNTS.find(({ role }) => role === 'admin')

const stamp = {
  displayName: 'Du khách',
  source: 'person',
  at: '2031-05-12T08:00:00.000Z',
}

// An invented three-day trip whose days cost nothing, a little, and a lot,
// so the amount column holds its narrowest and its widest figure at once.
const trip = {
  id: 'trip-scale',
  version: 1,
  name: 'Trip to Sông Mây',
  startsOn: '2031-05-13',
  endsOn: '2031-05-15',
  timeZone: 'Asia/Ho_Chi_Minh',
  currency: 'VND',
  homeCurrency: 'USD',
}

function anEntry(id: string, startsOn: string, costMinor: number) {
  return {
    id,
    version: 1,
    tripId: trip.id,
    title: 'Flower market',
    notes: null,
    kind: 'sights',
    startsOn,
    startTime: '09:00',
    endsOn: startsOn,
    endTime: '10:00',
    timeZone: trip.timeZone,
    costMinor,
    addedBy: stamp,
    changedBy: stamp,
  }
}

test('every By day track has one width, whatever its amount', async ({
  page,
}) => {
  if (fixtureAdmin === undefined) throw new Error('The seed holds no admin')
  await page.setViewportSize({ width: 360, height: 800 })
  const signIn = await page.request.post('/api/auth/sign-in', {
    data: { username: fixtureAdmin.username, password: fixtureAdmin.password },
  })
  expect(signIn.ok()).toBe(true)
  await page.route('**/api/trips/trip-scale', (route) =>
    route.fulfill({
      json: {
        trip,
        entries: [
          anEntry('e-small', '2031-05-14', 5_000),
          anEntry('e-large', '2031-05-15', 123_456_789_000),
        ],
      },
    }),
  )

  await page.goto('/trips/trip-scale/budget')

  await expect(page.getByText('₫123,456,789,000')).toBeVisible()
  const tracks = page.getByTestId('day-track')
  await expect(tracks).toHaveCount(3)
  const boxes = await Promise.all(
    (await tracks.all()).map((track) => track.boundingBox()),
  )
  const [first, ...rest] = boxes
  if (first === null || first === undefined) throw new Error('No track box')
  expect(first.width).toBeGreaterThan(0)
  for (const box of rest) {
    expect(box?.x).toBeCloseTo(first.x, 0)
    expect(box?.width).toBeCloseTo(first.width, 0)
  }
  // The widest amount still fits the phone, with no sideways scroll.
  const pageWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  )
  expect(pageWidth).toBeLessThanOrEqual(360)
})
