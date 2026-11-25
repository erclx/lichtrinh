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
    /** What a notice was about, being the assistant or voice. */
    kind?: 'assistant' | 'voice'
    /** How many pushes and emails a notice went out as. */
    sent?: number
    changes?: number
    trips?: number
    entries?: number
    audioMs?: number
    ms?: number
  } = {},
) {
  console.log(JSON.stringify({ outcome, ...ids }))
}
