import type { SpokenLanguage, VoiceModel } from '@shared/voice.ts'
import {
  DEFAULT_VOICE_MODEL,
  VOICE_MODEL_LANGUAGES,
  voiceModel,
} from '@shared/voice.ts'
import { eq } from 'drizzle-orm'

import type { Db } from '../calendar/record.ts'
import { settings } from '../db/schema.ts'

export const VOICE_MODEL_KEY = 'voice_model'

/**
 * The speech model the admin picked, read fresh per clip so a change reaches
 * the next one. A stored name outside the offered models reads as the default
 * rather than reaching the workspace PC.
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

/** The picked model when it hears `language`, and the default otherwise. */
export function voiceModelFor(
  language: SpokenLanguage,
  picked: VoiceModel,
): VoiceModel {
  return VOICE_MODEL_LANGUAGES[picked].includes(language)
    ? picked
    : DEFAULT_VOICE_MODEL
}

/** Sets the speech model, owning this one key of `settings` alone. */
export async function writeVoiceModel(
  db: Db,
  model: VoiceModel,
  byUserId: string,
  at: Date,
) {
  const change = { value: model, updatedAt: at, updatedBy: byUserId }
  await db
    .insert(settings)
    .values({ key: VOICE_MODEL_KEY, ...change })
    .onConflictDoUpdate({ target: settings.key, set: change })
}
