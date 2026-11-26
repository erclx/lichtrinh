import { z } from 'zod'

import { assistantModel, assistantStatus } from './assistant.ts'
import { chatRole, messageStatus } from './chats.ts'

/** The most messages one summary carries. */
export const OWNER_MESSAGE_LIMIT = 50

/** A saved chat message as the owner panel shows it, with no chat or account. */
export const ownerMessage = z.strictObject({
  id: z.string(),
  at: z.iso.datetime(),
  role: chatRole,
  text: z.string(),
  status: messageStatus,
  // The alias that wrote a reply, null on a person's message.
  model: assistantModel.nullable(),
})
export type OwnerMessage = z.infer<typeof ownerMessage>

/**
 * The assistant's replies since `since`, each one a turn. `failed` counts
 * the ones that broke off, and `lastAt` is the newest reply ever, null
 * before the first, whatever `since` says.
 */
export const ownerTurns = z.strictObject({
  since: z.iso.datetime(),
  count: z.int().nonnegative(),
  failed: z.int().nonnegative(),
  lastAt: z.iso.datetime().nullable(),
})
export type OwnerTurns = z.infer<typeof ownerTurns>

/** What `GET /api/owner/summary` answers. Messages are newest first. */
export const ownerSummary = z.strictObject({
  assistant: assistantStatus,
  turns: ownerTurns,
  messages: z.array(ownerMessage).max(OWNER_MESSAGE_LIMIT),
})
export type OwnerSummary = z.infer<typeof ownerSummary>

/** The summary's query. `since` is an ISO time, 24 hours back when absent. */
export const ownerSummaryQuery = z.strictObject({
  since: z.iso.datetime({ offset: true }).optional(),
})
