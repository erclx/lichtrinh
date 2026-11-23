import type { VoiceModel } from '@shared/voice.ts'
import { DEFAULT_VOICE_MODEL, voiceModel } from '@shared/voice.ts'
import { eq } from 'drizzle-orm'

import type { Db } from '../calendar/record.ts'
import { settings } from '../db/schema.ts'

export const VOICE_MODEL_KEY = 'voice_model'

/**
 * The speech model every clip runs on, read fresh per clip so a change by
 * the admin reaches the next one. A stored name outside the offered models
 * reads as the default rather than reaching the workspace PC.
 */
export async function readVoiceModel(db: Db): Promise<VoiceModel> {
  const row = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, VOICE_MODEL_KEY))
    .get()
  const parsed = voiceModel.safeParse(row?.value)
  return parsed.success ? parsed.data : DEFAULT_VOICE_MODEL
}
