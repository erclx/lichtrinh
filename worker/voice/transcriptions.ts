import type { VoiceModel } from '@shared/voice.ts'
import { eq } from 'drizzle-orm'

import type { Db } from '../calendar/record.ts'
import { transcriptions } from '../db/schema.ts'

export type ClipOutcome = (typeof transcriptions.$inferSelect)['outcome']

export interface ClipRecord {
  id: string
  userId: string
  model: VoiceModel
  outcome: ClipOutcome
  audioMs: number | null
  transcribeMs: number
  characters: number | null
}

/** Whether `userId` may write the clip `id`, which no other account holds. */
export async function mayRecord(
  db: Db,
  userId: string,
  id: string,
): Promise<boolean> {
  const row = await db
    .select({ userId: transcriptions.userId })
    .from(transcriptions)
    .where(eq(transcriptions.id, id))
    .get()
  return row === undefined || row.userId === userId
}

/**
 * Records a clip's outcome under its id. A retry rewrites the outcome in the
 * same row and keeps any send already marked on it. The update holds to the
 * owner, so a racing id from another account changes nothing.
 */
export async function recordClip(db: Db, clip: ClipRecord, at: Date) {
  const outcome = {
    model: clip.model,
    outcome: clip.outcome,
    audioMs: clip.audioMs,
    transcribeMs: clip.transcribeMs,
    characters: clip.characters,
    updatedAt: at,
  }
  await db
    .insert(transcriptions)
    .values({ id: clip.id, userId: clip.userId, ...outcome, createdAt: at })
    .onConflictDoUpdate({
      target: transcriptions.id,
      set: outcome,
      setWhere: eq(transcriptions.userId, clip.userId),
    })
}
