import type { Page } from '@playwright/test'

import { DEMO_INSTANT } from '../../../scripts/seed'
import type { CaptureCase } from '../../capture-types'
import {
  assistantOnline,
  asTraveler,
  flowSticky,
  inTripZone,
  lightAndDark,
} from '../page-setup'

/**
 * A chat route as the traveler at the demo instant. `online` answers the
 * status read, since the preview has no bridge, and left off it films the
 * offline card.
 */
function chatCases(
  section: string,
  route: string,
  online: boolean,
  extra?: (page: Page) => Promise<void>,
): CaptureCase[] {
  return lightAndDark(section, route, async (page) => {
    await inTripZone(page)
    await page.clock.setFixedTime(new Date(DEMO_INSTANT))
    await flowSticky(page)
    if (online) await assistantOnline(page)
    await asTraveler(page)
    await extra?.(page)
  })
}

const PHONE_ONLY = { excludeViewports: ['768', '1280', '1536'] }

// The harness has no hook after the load, so the page focuses the row itself.
async function focusFirstRow(page: Page) {
  await page.addInitScript(() => {
    const timer = setInterval(() => {
      const row = document.querySelector<HTMLElement>('li a[href^="/chats/"]')
      if (row === null) return
      clearInterval(timer)
      row.focus({ focusVisible: true } as FocusOptions)
    }, 50)
  })
}

export const CASES: CaptureCase[] = [
  // The dock beside Today from 1024 wide, and the Talk bar below that.
  ...chatCases('chat-today', '/', true),
  ...chatCases('chat-list', '/chats', true),
  ...chatCases('chat-list-focused', '/chats', true, focusFirstRow).map(
    (each) => ({ ...each, ...PHONE_ONLY }),
  ),
  ...chatCases('chat-thread', '/chats/fixture-chat-today', true),
  ...chatCases('chat-offline', '/chats/fixture-chat-today', false),
  ...chatCases('chat-failed', '/chats/fixture-chat-dinner', true),
]
