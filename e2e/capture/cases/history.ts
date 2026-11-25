import type { Page } from '@playwright/test'
import type { Change, ChangePage } from '@shared/changes.ts'

import { FIXTURE_TRIPS } from '../../../scripts/seed'
import type { CaptureCase } from '../../capture-types'
import { atDemoInstantInTripZone, lightAndDark, TRIP_PATH } from '../page-setup'

const REFUSED = 'Undo: Added “Sông Mây flower market”'

// The harness has no hook after the load, so the page presses the button itself.
async function pressOnceShown(page: Page, name: string) {
  await page.addInitScript((label) => {
    const timer = setInterval(() => {
      const button = [...document.querySelectorAll('button')].find(
        (each) => each.getAttribute('aria-label') === label,
      )
      if (button === undefined) return
      clearInterval(timer)
      button.click()
    }, 50)
  }, name)
}

// The seeded list with its newest change undone and its oldest refusing, so
// one frame holds every state a row can end in, with older changes to ask for.
async function undoStates(page: Page) {
  await atDemoInstantInTripZone(page)
  await page.route(`**/api${TRIP_PATH}/changes`, async (route) => {
    const response = await route.fetch()
    const { changes } = (await response.json()) as ChangePage
    const [newest, ...older] = changes
    if (newest?.entity !== 'entry') throw new Error('The seed holds no change')
    const undo: Change = {
      ...newest,
      id: 'capture-undo',
      at: '2031-05-15T02:20:00.000Z',
      source: 'person',
      op: 'undo',
      before: newest.after,
      after: newest.before,
    }
    const answer: ChangePage = {
      changes: [undo, { ...newest, undoneBy: undo.id }, ...older],
      nextBefore: older.at(-1)?.id ?? null,
    }
    await route.fulfill({ response, json: answer })
  })
  await page.route('**/api/changes/*/undo', (route) =>
    route.fulfill({
      status: 409,
      json: { error: { code: 'undo_conflict', message: 'Changed since' } },
    }),
  )
  await pressOnceShown(page, REFUSED)
}

// No seeded trip carries its creation, so the route answers one, and the page
// presses its Undo to open the question.
async function removeTripSheet(page: Page) {
  await atDemoInstantInTripZone(page)
  await page.route(`**/api${TRIP_PATH}/changes`, (route) => {
    const trip = FIXTURE_TRIPS.find(({ id }) => TRIP_PATH.endsWith(id))
    if (trip === undefined) throw new Error('The seed holds no trip')
    const { id, ...fields } = trip
    const created: Change = {
      id: 'capture-created',
      at: '2031-05-15T01:00:00.000Z',
      actor: { id: 'fixture-admin', displayName: 'Admin' },
      source: 'person',
      op: 'create',
      entity: 'trip',
      entityId: id,
      undoneBy: null,
      before: null,
      after: fields,
    }
    const answer: ChangePage = { changes: [created], nextBefore: null }
    return route.fulfill({ json: answer })
  })
  await pressOnceShown(page, 'Undo: Created the trip “Trip to Sông Mây”')
}

export const CASES: CaptureCase[] = [
  ...lightAndDark('history', `${TRIP_PATH}/history`, atDemoInstantInTripZone),
  {
    section: 'history-states',
    theme: 'default',
    route: `${TRIP_PATH}/history`,
    evidence: true,
    excludeViewports: ['768', '1280'],
    setup: undoStates,
  },
  {
    section: 'history-empty',
    theme: 'default',
    route: '/trips/fixture-trip-island/history',
    evidence: true,
    excludeViewports: ['768', '1280'],
    setup: atDemoInstantInTripZone,
  },
  ...lightAndDark(
    'history-remove-trip',
    `${TRIP_PATH}/history`,
    removeTripSheet,
  ).map((each) => ({ ...each, excludeViewports: ['768', '1280'] })),
]
