import type { AssistantModel } from '@shared/assistant.ts'
import { assistantModel } from '@shared/assistant.ts'
import type { Chat, ChatMessage, MessageStatus } from '@shared/chats.ts'
import { nowInZone } from '@shared/trip-time.ts'
import type { Trip } from '@shared/trips.ts'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { changesByIds } from '../calendar/changes.ts'
import type { Db } from '../calendar/record.ts'
import { listTrips } from '../calendar/trips.ts'
import { chatMessages, chats } from '../db/schema.ts'

type ChatRow = typeof chats.$inferSelect
type MessageRow = typeof chatMessages.$inferSelect

const TITLE_LENGTH = 60
const changeIdList = z.array(z.string())

/**
 * The trip a new chat binds to: the one under way in its own zone, else the
 * next to start, else the one that ended last.
 */
export function chooseTrip(trips: Trip[], at: Date): Trip | undefined {
  const today = (trip: Trip) => nowInZone(at, trip.timeZone).date
  const underWay = trips.find(
    (trip) => trip.startsOn <= today(trip) && today(trip) <= trip.endsOn,
  )
  if (underWay !== undefined) return underWay
  const upcoming = trips
    .filter((trip) => trip.startsOn > today(trip))
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
  if (upcoming.length > 0) return upcoming[0]
  return [...trips].sort((a, b) => b.endsOn.localeCompare(a.endsOn))[0]
}

function toChat(row: ChatRow): Chat {
  return {
    id: row.id,
    tripId: row.tripId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Creates a chat under a client id, bound to a trip per `chooseTrip`. A
 * retry by the same owner answers the stored chat, and an id another account
 * holds is refused.
 */
export async function createChat(
  db: Db,
  ownerId: string,
  id: string,
  at: Date,
): Promise<Chat | { refused: 'id_conflict' | 'no_trip' }> {
  const stored = await db.select().from(chats).where(eq(chats.id, id)).get()
  if (stored !== undefined) {
    return stored.ownerId === ownerId
      ? toChat(stored)
      : { refused: 'id_conflict' }
  }
  const trip = chooseTrip(await listTrips(db), at)
  if (trip === undefined) return { refused: 'no_trip' }
  const [row] = await db
    .insert(chats)
    .values({
      id,
      ownerId,
      tripId: trip.id,
      title: null,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoNothing()
    .returning()
  // A racing create of the same id lands first, so this one reads it back.
  if (row === undefined) return createChat(db, ownerId, id, at)
  return toChat(row)
}

export function listChats(db: Db, ownerId: string): Promise<Chat[]> {
  return db
    .select()
    .from(chats)
    .where(eq(chats.ownerId, ownerId))
    .orderBy(desc(chats.updatedAt), sql`rowid desc`)
    .then((rows) => rows.map(toChat))
}

/** The owner's chat, or undefined for one that is missing or not theirs. */
export async function ownChat(db: Db, ownerId: string, id: string) {
  const row = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, id), eq(chats.ownerId, ownerId)))
    .get()
  return row && toChat(row)
}

function messageRows(db: Db, chatId: string) {
  // Rowid breaks a tie, since a reply can land in its message's millisecond.
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(asc(chatMessages.createdAt), sql`rowid`)
}

function changeIdsOf(row: MessageRow) {
  return changeIdList.parse(JSON.parse(row.changeIds))
}

/** Messages with their changes read in one pass, in the order given. */
async function toMessages(db: Db, rows: MessageRow[]): Promise<ChatMessage[]> {
  const changes = await changesByIds(db, rows.flatMap(changeIdsOf))
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    text: row.text,
    status: row.status,
    model: row.model === null ? null : assistantModel.parse(row.model),
    at: row.createdAt.toISOString(),
    changes: changeIdsOf(row).flatMap((id) => changes.get(id) ?? []),
  }))
}

/** Every message of the chat, oldest first, each with its changes. */
export async function threadOf(db: Db, chatId: string) {
  return toMessages(db, await messageRows(db, chatId))
}

/** The last `count` messages of the chat, oldest first, for a turn's prompt. */
export async function recentMessages(db: Db, chatId: string, count: number) {
  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      text: chatMessages.text,
      heldRemoval: chatMessages.heldRemoval,
    })
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(desc(chatMessages.createdAt), sql`rowid desc`)
    .limit(count)
  return rows.reverse()
}

export function findMessage(db: Db, id: string) {
  return db.select().from(chatMessages).where(eq(chatMessages.id, id)).get()
}

/** The saved reply to a message, or undefined while none is saved. */
export async function replyTo(db: Db, messageId: string) {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.replyTo, messageId))
  if (rows.length === 0) return undefined
  const [reply] = await toMessages(db, rows)
  return reply
}

/**
 * Saves a person's message and marks the chat active, titling it from the
 * first message. A retried send of a saved message changes nothing.
 */
export async function saveUserMessage(
  db: Db,
  message: { id: string; chatId: string; text: string },
  at: Date,
) {
  await db.batch([
    db
      .insert(chatMessages)
      .values({
        id: message.id,
        chatId: message.chatId,
        role: 'user',
        text: message.text,
        status: 'complete',
        model: null,
        changeIds: '[]',
        replyTo: null,
        heldRemoval: false,
        createdAt: at,
      })
      .onConflictDoNothing(),
    db
      .update(chats)
      .set({
        updatedAt: at,
        title: sql`coalesce(${chats.title}, ${message.text.slice(0, TITLE_LENGTH)})`,
      })
      .where(eq(chats.id, message.chatId)),
  ])
}

export interface Reply {
  chatId: string
  replyTo: string
  text: string
  status: MessageStatus
  model: AssistantModel
  changeIds: string[]
  heldRemoval: boolean
}

/** Saves the assistant's reply to a message and reads it back whole. */
export async function saveReply(db: Db, reply: Reply, at: Date) {
  const id = crypto.randomUUID()
  await db.batch([
    db
      .insert(chatMessages)
      .values({
        id,
        chatId: reply.chatId,
        role: 'assistant',
        text: reply.text,
        status: reply.status,
        model: reply.model,
        changeIds: JSON.stringify(reply.changeIds),
        replyTo: reply.replyTo,
        heldRemoval: reply.heldRemoval,
        createdAt: at,
      })
      .onConflictDoNothing(),
    db.update(chats).set({ updatedAt: at }).where(eq(chats.id, reply.chatId)),
  ])
  const saved = await replyTo(db, reply.replyTo)
  if (saved === undefined) throw new Error('A saved reply did not read back')
  return saved
}

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
