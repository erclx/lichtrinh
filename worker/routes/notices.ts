import type { User } from '@shared/auth.ts'
import {
  emailWords,
  type Notice,
  pushWords,
  testEmailWords,
} from '@shared/notice-text.ts'
import {
  type NoticeEmail,
  noticeEmailWrite,
  type NoticeKind,
  noticeSend,
  type NoticeSetting,
  type NoticeState,
  pushDevice,
  type SentNotice,
} from '@shared/notices.ts'
import { and, eq, ne } from 'drizzle-orm'
import type { Context } from 'hono'
import { Hono } from 'hono'

import { relayOf, type ServiceState } from '../assistant/relay.ts'
import {
  type AttemptKey,
  blockedForSeconds,
  recordFailure,
} from '../auth/attempts.ts'
import type { AuthEnv } from '../auth/guard.ts'
import { requireChat } from '../auth/guard.ts'
import { createDb } from '../db/client.ts'
import { notifyEmails, pushDevices } from '../db/schema.ts'
import { fail, parseBody, refuse } from '../envelope.ts'
import { logOutcome } from '../log.ts'
import { canEmail, sendEmail } from '../notices/email.ts'
import {
  type Claim,
  claimOutage,
  type CurrentNotice,
  currentNotices,
  keepClaim,
  releaseClaim,
} from '../notices/outage.ts'
import { isPushEndpoint, sendPush, vapidKeys } from '../notices/push.ts'
import { readRecipients } from '../notices/recipients.ts'

// A tap meeting another's send under way asks again until that send ends,
// which its own timeouts bound at five seconds.
const ASK_AGAIN_MS = 750
const ASKS = 8

// Every save sends a test, so a slip of the finger has room and a stuck
// button cannot spend the day's mail.
const TEST_LIMIT = 10

type Db = ReturnType<typeof createDb>
type Services = Record<NoticeKind, ServiceState>

export const noticeRoutes = new Hono<AuthEnv>()
  .get('/notices', requireChat, async (c) => {
    const db = createDb(c.env.DB)
    const services: Services = await relayOf(c.env).services()
    const [recipients, notices] = await Promise.all([
      recipientsNow(c, db),
      currentNotices(db, services),
    ])
    const of = (kind: NoticeKind) => {
      const notice = notices.find((row) => row.kind === kind)
      return notice === undefined ? null : toSent(notice, c.var.user)
    }
    const body: NoticeState = {
      reachable: recipients.devices.length + recipients.emails.length > 0,
      assistant: of('assistant'),
      voice: of('voice'),
    }
    return c.json(body)
  })
  .post('/notices', requireChat, async (c) => {
    const { kind } = await parseBody(c, noticeSend)
    const { user } = c.var
    // The admin is whom a notice reaches, so there is nobody to tell.
    if (user.role === 'admin') {
      return c.json(fail('forbidden', 'An admin sends no notice'), 403)
    }
    const db = createDb(c.env.DB)
    const services: Services = await relayOf(c.env).services()
    const { online, upAt } = services[kind]
    if (online) return refuse(c, 'not_down')

    for (let ask = 0; ask < ASKS; ask++) {
      if (ask > 0) await scheduler.wait(ASK_AGAIN_MS)
      const claim: Claim = {
        id: crypto.randomUUID(),
        kind,
        userId: user.id,
        at: new Date(),
      }
      if (await claimOutage(db, claim, upAt)) return sendClaimed(c, db, claim)
      const sent = (await currentNotices(db, services)).find(
        (notice) => notice.kind === kind,
      )
      if (sent !== undefined) return c.json(toSent(sent, user))
    }
    return refuse(c, 'notice_failed')
  })
  .get('/admin/notices', async (c) => {
    const db = createDb(c.env.DB)
    const [device, email] = await Promise.all([
      db
        .select({ sessionId: pushDevices.sessionId })
        .from(pushDevices)
        .where(eq(pushDevices.sessionId, c.var.sessionId))
        .get(),
      db
        .select({ address: notifyEmails.address })
        .from(notifyEmails)
        .where(eq(notifyEmails.userId, c.var.user.id))
        .get(),
    ])
    const vapid = keysOf(c)
    const body: NoticeSetting = {
      push:
        vapid === null
          ? null
          : { publicKey: vapid.publicKey, deviceOn: device !== undefined },
      email: canEmail(c.env) ? { address: email?.address ?? null } : null,
    }
    return c.json(body)
  })
  // The device is the session's own, so signing out takes it along. A browser
  // keeps its endpoint across sign-ins, so the newest session holds it.
  .put('/admin/notices/device', async (c) => {
    const { endpoint, keys } = await parseBody(c, pushDevice)
    if (!isPushEndpoint(endpoint)) return refuse(c, 'validation_failed')
    const db = createDb(c.env.DB)
    const { sessionId } = c.var
    const saved = { endpoint, ...keys, createdAt: new Date() }
    await db.batch([
      db
        .delete(pushDevices)
        .where(
          and(
            eq(pushDevices.endpoint, endpoint),
            ne(pushDevices.sessionId, sessionId),
          ),
        ),
      db
        .insert(pushDevices)
        .values({ sessionId, ...saved })
        .onConflictDoUpdate({ target: pushDevices.sessionId, set: saved }),
    ])
    logOutcome('push_on', { userId: c.var.user.id })
    return c.body(null, 204)
  })
  .delete('/admin/notices/device', async (c) => {
    await createDb(c.env.DB)
      .delete(pushDevices)
      .where(eq(pushDevices.sessionId, c.var.sessionId))
    logOutcome('push_off', { userId: c.var.user.id })
    return c.body(null, 204)
  })
  // Kept only once a test was taken, so a saved address is one that works.
  .put('/admin/notices/email', async (c) => {
    const { address, timeZone } = await parseBody(c, noticeEmailWrite)
    const db = createDb(c.env.DB)
    const { user } = c.var
    const key: AttemptKey = { key: `email:${user.id}`, limit: TEST_LIMIT }
    const now = Date.now()
    const waitSeconds = await blockedForSeconds(db, [key], now)
    if (waitSeconds > 0) {
      c.header('Retry-After', String(waitSeconds))
      return c.json(fail('rate_limited', 'Too many test emails'), 429)
    }
    await recordFailure(db, [key], now)
    const test = testEmailWords(user.language ?? 'vi')
    const outcome = await sendEmail(c.env, address, test)
    if (outcome === 'unconfirmed') return refuse(c, 'email_unconfirmed')
    if (outcome === 'failed') return refuse(c, 'notice_failed')
    const saved = { address, timeZone, updatedAt: new Date() }
    await db
      .insert(notifyEmails)
      .values({ userId: user.id, ...saved })
      .onConflictDoUpdate({ target: notifyEmails.userId, set: saved })
    logOutcome('email_on', { userId: user.id })
    const body: NoticeEmail = { address }
    return c.json(body)
  })
  .delete('/admin/notices/email', async (c) => {
    await createDb(c.env.DB)
      .delete(notifyEmails)
      .where(eq(notifyEmails.userId, c.var.user.id))
    logOutcome('email_off', { userId: c.var.user.id })
    return c.body(null, 204)
  })

async function sendClaimed(c: Context<AuthEnv>, db: Db, claim: Claim) {
  const { user } = c.var
  let sent = 0
  try {
    sent = await sendToAll(c, db, {
      kind: claim.kind,
      name: user.displayName,
      at: claim.at,
    })
  } finally {
    if (sent === 0) await releaseClaim(db, claim)
  }
  const ids = { userId: user.id, kind: claim.kind, sent }
  if (sent === 0) {
    logOutcome('notice_failed', ids)
    return refuse(c, 'notice_failed')
  }
  const sentAt = new Date()
  await keepClaim(db, claim, sentAt)
  logOutcome('notice_sent', ids)
  const body: SentNotice = {
    sentAt: sentAt.toISOString(),
    byName: user.displayName,
    byMe: true,
  }
  return c.json(body)
}

/** Sends every push and email at once, and answers how many went out. */
async function sendToAll(c: Context<AuthEnv>, db: Db, notice: Notice) {
  const { devices, emails } = await recipientsNow(c, db)
  const vapid = keysOf(c)
  const outcomes = await Promise.all([
    ...devices.map((device) =>
      vapid === null
        ? false
        : sendPush(db, device, pushWords(notice, device.language), vapid),
    ),
    ...emails.map(async ({ address, language, timeZone }) => {
      const words = emailWords(notice, language, timeZone)
      return (await sendEmail(c.env, address, words)) === 'sent'
    }),
  ])
  return outcomes.filter(Boolean).length
}

function recipientsNow(c: Context<AuthEnv>, db: Db) {
  return readRecipients(
    db,
    { push: keysOf(c) !== null, email: canEmail(c.env) },
    new Date(),
  )
}

// The push service is told who sends by the address the app is served from.
function keysOf(c: Context<AuthEnv>) {
  return vapidKeys(c.env, new URL(c.req.url).origin)
}

function toSent(notice: CurrentNotice, reader: User): SentNotice {
  return {
    sentAt: notice.sentAt.toISOString(),
    byName: notice.byName,
    byMe: notice.userId === reader.id,
  }
}
