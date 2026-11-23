/**
 * One log line naming what happened and to whom, by account id alone. It
 * takes no free text, so no username, password, token, body, chat message,
 * tool argument, clip, or transcript reaches a log.
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
    transcriptionId?: string
    model?: string
    /** A currency pair such as `USD:VND`, two codes the route already checked. */
    pair?: string
    changes?: number
    audioMs?: number
    ms?: number
  } = {},
) {
  console.log(JSON.stringify({ outcome, ...ids }))
}
