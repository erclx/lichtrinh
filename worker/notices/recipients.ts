import type { Language } from '@shared/auth.ts'
import { and, desc, eq, gt } from 'drizzle-orm'

import type { createDb } from '../db/client.ts'
import { authSessions, notifyEmails, pushDevices, users } from '../db/schema.ts'
import type { PushTarget } from './push.ts'

// A request may make 50 subrequests on the free plan and has 10 ms of CPU,
// which encrypting each push spends, so a send reaches this many of each.
const MAX_OF_EACH = 10

export interface Recipients {
  devices: (PushTarget & { language: Language })[]
  emails: { address: string; timeZone: string; language: Language }[]
}

/**
 * Who a notice reaches now: each admin's devices whose session is still live,
 * and each admin's address. Role and session are read here on every send, so
 * a demotion, a sign-out, or an expiry stops both at once.
 */
export async function readRecipients(
  db: ReturnType<typeof createDb>,
  ways: { push: boolean; email: boolean },
  now: Date,
): Promise<Recipients> {
  const [devices, emails] = await Promise.all([
    ways.push
      ? db
          .select({
            sessionId: pushDevices.sessionId,
            endpoint: pushDevices.endpoint,
            p256dh: pushDevices.p256dh,
            auth: pushDevices.auth,
            language: users.language,
          })
          .from(pushDevices)
          .innerJoin(authSessions, eq(authSessions.id, pushDevices.sessionId))
          .innerJoin(users, eq(users.id, authSessions.userId))
          .where(and(eq(users.role, 'admin'), gt(authSessions.expiresAt, now)))
          .orderBy(desc(pushDevices.createdAt))
          .limit(MAX_OF_EACH)
      : [],
    ways.email
      ? db
          .select({
            address: notifyEmails.address,
            timeZone: notifyEmails.timeZone,
            language: users.language,
          })
          .from(notifyEmails)
          .innerJoin(users, eq(users.id, notifyEmails.userId))
          .where(eq(users.role, 'admin'))
          .orderBy(desc(notifyEmails.updatedAt))
          .limit(MAX_OF_EACH)
      : [],
  ])
  return {
    devices: devices.map((row) => ({ ...row, language: row.language ?? 'vi' })),
    emails: emails.map((row) => ({ ...row, language: row.language ?? 'vi' })),
  }
}
