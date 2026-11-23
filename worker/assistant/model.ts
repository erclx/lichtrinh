import type { AssistantModel } from '@shared/assistant.ts'
import { assistantModel, DEFAULT_ASSISTANT_MODEL } from '@shared/assistant.ts'
import { eq } from 'drizzle-orm'

import type { Db } from '../calendar/record.ts'
import { settings } from '../db/schema.ts'

export const ASSISTANT_MODEL_KEY = 'assistant_model'

/**
 * The alias every turn runs on, read fresh per turn so a change by the
 * admin reaches the next message. A stored name outside the known aliases
 * reads as the default rather than reaching the workspace PC.
 */
export async function readModel(db: Db): Promise<AssistantModel> {
  const row = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, ASSISTANT_MODEL_KEY))
    .get()
  const parsed = assistantModel.safeParse(row?.value)
  return parsed.success ? parsed.data : DEFAULT_ASSISTANT_MODEL
}
