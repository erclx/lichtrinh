/**
 * One log line naming what happened and to whom, by account id alone. It
 * takes no free text, so no username, password, token, body, chat message,
 * or tool argument reaches a log.
 */
export function logOutcome(
  outcome: string,
  ids: {
    userId?: string
    byUserId?: string
    tripId?: string
    entryId?: string
    changeId?: string
    chatId?: string
    messageId?: string
    model?: string
    changes?: number
    ms?: number
  } = {},
) {
  console.log(JSON.stringify({ outcome, ...ids }))
}
