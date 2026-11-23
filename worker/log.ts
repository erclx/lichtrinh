/**
 * One log line naming what happened and to whom, by account id alone. It
 * takes no free text, so no username, password, token, or body reaches a log.
 */
export function logOutcome(
  outcome: string,
  ids: { userId?: string; byUserId?: string } = {},
) {
  console.log(JSON.stringify({ outcome, ...ids }))
}
