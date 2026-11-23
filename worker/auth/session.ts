import type { User } from '@shared/auth.ts'
import { and, eq, gt } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

import { authSessions, users } from '../db/schema.ts'
import { toUser } from '../db/users.ts'

const DAY_MS = 24 * 60 * 60 * 1000
// A traveler who opens the app once a month never signs in again. Hono
// refuses a cookie past 400 days.
export const SESSION_LIFETIME_MS = 180 * DAY_MS
// Renewing on every request would write to D1 on every read.
const SLIDE_AFTER_MS = DAY_MS

// Sent as `__Host-session`, which a browser accepts only from this exact
// host over HTTPS with path `/`, so a sibling subdomain cannot plant one.
const COOKIE_NAME = 'session'
const COOKIE = {
  prefix: 'host',
  secure: true,
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
} as const

type Db = DrizzleD1Database

export interface LiveSession {
  id: string
  user: User
}

export async function startSession(
  c: Context,
  db: Db,
  userId: string,
  now: number,
): Promise<void> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  await db.insert(authSessions).values({
    id: await hashToken(token),
    userId,
    createdAt: new Date(now),
    expiresAt: new Date(now + SESSION_LIFETIME_MS),
  })
  setSessionCookie(c, token)
}

/** The session the request's cookie names, renewed when a day has passed. */
export async function readSession(
  c: Context,
  db: Db,
  now: number,
): Promise<LiveSession | null> {
  const token = getCookie(c, COOKIE_NAME, 'host')
  if (token === undefined) return null
  const id = await hashToken(token)
  const row = await db
    .select({ expiresAt: authSessions.expiresAt, user: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(
      and(eq(authSessions.id, id), gt(authSessions.expiresAt, new Date(now))),
    )
    .get()
  if (row === undefined) return null

  const renewedAt = row.expiresAt.getTime() - SESSION_LIFETIME_MS
  if (now - renewedAt > SLIDE_AFTER_MS) {
    await db
      .update(authSessions)
      .set({ expiresAt: new Date(now + SESSION_LIFETIME_MS) })
      .where(eq(authSessions.id, id))
    setSessionCookie(c, token)
  }
  return { id, user: toUser(row.user) }
}

export async function endSession(c: Context, db: Db, id: string) {
  await db.delete(authSessions).where(eq(authSessions.id, id))
  deleteCookie(c, COOKIE_NAME, COOKIE)
}

/** A statement ending every session an account holds, for a caller's batch. */
export function endAllSessions(db: Db, userId: string) {
  return db.delete(authSessions).where(eq(authSessions.userId, userId))
}

function setSessionCookie(c: Context, token: string) {
  setCookie(c, COOKIE_NAME, token, {
    ...COOKIE,
    maxAge: SESSION_LIFETIME_MS / 1000,
  })
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  )
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}
