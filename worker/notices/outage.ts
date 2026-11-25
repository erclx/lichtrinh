import type { NoticeKind } from '@shared/notices.ts'
import { and, eq, isNull, lte, or } from 'drizzle-orm'

import type { ServiceState } from '../assistant/relay.ts'
import type { createDb } from '../db/client.ts'
import { outageNotices, users } from '../db/schema.ts'

type Db = ReturnType<typeof createDb>

// Past every send's own timeout, so only a crash leaves a claim this old.
const CLAIM_KEPT_MS = 30_000

export interface Claim {
  id: string
  kind: NoticeKind
  userId: string
  at: Date
}

/**
 * Takes the one notice an outage allows, in one statement, so two taps at
 * once cannot both win. A row from before the service last came up belongs to
 * an outage now over, and a row left unsent past its time crashed.
 */
export async function claimOutage(
  db: Db,
  claim: Claim,
  upAt: number | null,
): Promise<boolean> {
  const held = {
    claimId: claim.id,
    userId: claim.userId,
    claimedAt: claim.at,
    sentAt: null,
  }
  const won = await db
    .insert(outageNotices)
    .values({ kind: claim.kind, ...held })
    .onConflictDoUpdate({
      target: outageNotices.kind,
      set: held,
      setWhere: or(
        lte(outageNotices.claimedAt, new Date(upAt ?? 0)),
        and(
          isNull(outageNotices.sentAt),
          lte(
            outageNotices.claimedAt,
            new Date(claim.at.getTime() - CLAIM_KEPT_MS),
          ),
        ),
      ),
    })
    .returning({ claimId: outageNotices.claimId })
    .get()
  return won !== undefined
}

/** Marks a claim sent, which keeps it for the rest of the outage. */
export async function keepClaim(db: Db, claim: Claim, sentAt: Date) {
  await db
    .update(outageNotices)
    .set({ sentAt })
    .where(eq(outageNotices.claimId, claim.id))
}

/** Gives a claim back after a failed send, so the next tap can try. */
export async function releaseClaim(db: Db, claim: Claim) {
  await db.delete(outageNotices).where(eq(outageNotices.claimId, claim.id))
}

export interface CurrentNotice {
  kind: NoticeKind
  userId: string
  byName: string
  sentAt: Date
}

/** The notices sent in the outages under way, at most one for each kind. */
export async function currentNotices(
  db: Db,
  services: Record<NoticeKind, ServiceState>,
): Promise<CurrentNotice[]> {
  const rows = await db
    .select({
      kind: outageNotices.kind,
      userId: outageNotices.userId,
      byName: users.displayName,
      claimedAt: outageNotices.claimedAt,
      sentAt: outageNotices.sentAt,
    })
    .from(outageNotices)
    .innerJoin(users, eq(users.id, outageNotices.userId))
  return rows.flatMap(({ claimedAt, sentAt, ...notice }) => {
    const { online, upAt } = services[notice.kind]
    const current = !online && claimedAt.getTime() > (upAt ?? 0)
    return current && sentAt !== null ? [{ ...notice, sentAt }] : []
  })
}
