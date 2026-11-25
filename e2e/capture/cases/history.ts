import type { Page } from '@playwright/test'
import type { Change, ChangePage } from '@shared/changes.ts'

import type { CaptureCase } from '../../capture-types'
import { atDemoInstantInTripZone, lightAndDark, TRIP_PATH } from '../page-setup'

const REFUSED = 'Undo: Added “Sông Mây flower market”'

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
  // The harness has no hook after the load, so the page presses Undo itself.
  await page.addInitScript((name) => {
    const timer = setInterval(() => {
      const button = document.querySelector<HTMLButtonElement>(
        `button[aria-label="${name}"]`,
      )
      if (button === null) return
      clearInterval(timer)
      button.click()
    }, 50)
  }, REFUSED)
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
]
