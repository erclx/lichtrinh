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
): CaptureCase[] {
  return lightAndDark(section, route, async (page) => {
    await inTripZone(page)
    await page.clock.setFixedTime(new Date(DEMO_INSTANT))
    await flowSticky(page)
    if (online) await assistantOnline(page)
    await asTraveler(page)
  })
}

export const CASES: CaptureCase[] = [
  // The dock beside Today from 1024 wide, and the Talk bar below that.
  ...chatCases('chat-today', '/', true),
  ...chatCases('chat-list', '/chats', true),
  ...chatCases('chat-thread', '/chats/fixture-chat-today', true),
  ...chatCases('chat-offline', '/chats/fixture-chat-today', false),
  ...chatCases('chat-failed', '/chats/fixture-chat-dinner', true),
]
