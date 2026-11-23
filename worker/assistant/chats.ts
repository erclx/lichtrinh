import { and, desc, eq } from 'drizzle-orm'

import type { Db } from '../calendar/record.ts'
import { chatMessages } from '../db/schema.ts'

/** When the assistant last finished a reply, or null before its first. */
export async function lastAnsweredAt(db: Db): Promise<Date | null> {
  const row = await db
    .select({ at: chatMessages.createdAt })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.role, 'assistant'),
        eq(chatMessages.status, 'complete'),
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(1)
    .get()
  return row?.at ?? null
}
