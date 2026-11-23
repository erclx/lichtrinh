import type { VoiceModel, VoiceUsage } from '@shared/voice.ts'
import { voiceModel } from '@shared/voice.ts'
import { eq, sql } from 'drizzle-orm'

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

/**
 * Each offered model's clips, sends, and mean edit, in the offered order and
 * with zeros for a model never used. A clip that failed or found voice off
 * counts for none of them.
 */
export async function usageByModel(db: Db): Promise<VoiceUsage[]> {
  const rows = await db
    .select({
      model: transcriptions.model,
      clips: sql<number>`count(*)`,
      sent: sql<number>`count(${transcriptions.sentMessageId})`,
      meanEditRatio: sql<number | null>`avg(${transcriptions.editRatio})`,
    })
    .from(transcriptions)
    .where(eq(transcriptions.outcome, 'ok'))
    .groupBy(transcriptions.model)
  const byModel = new Map(rows.map((row) => [row.model, row]))
  return voiceModel.options.map((model) => {
    const row = byModel.get(model)
    return {
      model,
      clips: row?.clips ?? 0,
      sent: row?.sent ?? 0,
      meanEditRatio: row?.meanEditRatio ?? null,
    }
  })
}
