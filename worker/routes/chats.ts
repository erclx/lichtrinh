import { buildPrompt, HISTORY_LENGTH } from '@shared/assistant-prompt.ts'
import type {
  ChatEvent,
  ChatList,
  ChatMessage,
  ChatRead,
  ChatThread,
} from '@shared/chats.ts'
import { createChatRequest, sendMessageRequest } from '@shared/chats.ts'
import { Hono } from 'hono'

import {
  createChat,
  findMessage,
  listChats,
  ownChat,
  recentMessages,
  replyTo,
  threadOf,
} from '../assistant/chats.ts'
import { readModel } from '../assistant/model.ts'
import type { TurnInput } from '../assistant/relay.ts'
import { relayOf } from '../assistant/relay.ts'
import type { AuthEnv } from '../auth/guard.ts'
import { requireChat } from '../auth/guard.ts'
import { entriesOfTrip } from '../calendar/entries.ts'
import { liveTrip, toTrip } from '../calendar/trips.ts'
import { createDb } from '../db/client.ts'
import { parseBody, refuse } from '../envelope.ts'
import { logOutcome } from '../log.ts'
import { markSent } from '../voice/transcriptions.ts'

// Each route reads chats of the signed-in account alone, so another
// account's chat answers not found and reveals nothing.
export const chatRoutes = new Hono<AuthEnv>()
  .use('/chats', requireChat)
  .use('/chats/*', requireChat)
  .get('/chats', async (c) => {
    const body: ChatList = {
      chats: await listChats(createDb(c.env.DB), c.var.user.id),
    }
    return c.json(body)
  })
  .post('/chats', async (c) => {
    const { id } = await parseBody(c, createChatRequest)
    const outcome = await createChat(
      createDb(c.env.DB),
      c.var.user.id,
      id,
      new Date(),
    )
    if ('refused' in outcome) return refuse(c, outcome.refused)
    logOutcome('chat_created', { chatId: id, userId: c.var.user.id })
    const body: ChatRead = { chat: outcome }
    return c.json(body, 201)
  })
  .get('/chats/:id', async (c) => {
    const db = createDb(c.env.DB)
    const chat = await ownChat(db, c.var.user.id, c.req.param('id'))
    if (chat === undefined) return refuse(c, 'not_found')
    const body: ChatThread = { chat, messages: await threadOf(db, chat.id) }
    return c.json(body)
  })
  // Answers an NDJSON stream of chat events. A retry of a message whose
  // reply is saved answers that reply and runs no second turn, and one whose
  // turn never saved a reply runs it again.
  .post('/chats/:id/messages', async (c) => {
    const request = await parseBody(c, sendMessageRequest)
    const db = createDb(c.env.DB)
    const chat = await ownChat(db, c.var.user.id, c.req.param('id'))
    if (chat === undefined) return refuse(c, 'not_found')
    // Runs only once the message is saved, so a refused send marks nothing.
    const markVoice = async () => {
      if (request.voice === undefined) return
      await markSent(db, c.var.user.id, request.voice, request.id, new Date())
    }
    const saved = await findMessage(db, request.id)
    if (saved !== undefined) {
      const sameSend =
        saved.chatId === chat.id &&
        saved.role === 'user' &&
        saved.text === request.text
      if (!sameSend) return refuse(c, 'id_conflict')
      const reply = await replyTo(db, saved.id)
      if (reply !== undefined) {
        await markVoice()
        return eventStream([replayOf(reply)])
      }
    }
    const trip = await liveTrip(db, chat.tripId)
    if (trip === undefined) return refuse(c, 'no_trip')
    const [entries, recent, model] = await Promise.all([
      entriesOfTrip(db, trip.id),
      recentMessages(db, chat.id, HISTORY_LENGTH + 1),
      readModel(db),
    ])
    const history = recent.filter((message) => message.id !== request.id)
    const input: TurnInput = {
      chatId: chat.id,
      ownerId: c.var.user.id,
      tripId: trip.id,
      messageId: request.id,
      text: request.text,
      model,
      messages: buildPrompt({
        trip: toTrip(trip),
        entries,
        history,
        text: request.text,
        at: new Date(),
      }),
      versions: Object.fromEntries(entries.map((e) => [e.id, e.version])),
      removalAsked: history.at(-1)?.heldRemoval ?? false,
    }
    const res = await relayOf(c.env).fetch('https://relay/turn', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    if (res.ok) await markVoice()
    return res
  })

// The saved reply ends the replay as the live stream ended it, so a
// failed or stopped reply answers `error` and never reads as an answer.
function replayOf(message: ChatMessage): ChatEvent {
  if (message.status === 'complete') return { type: 'done', message }
  return {
    type: 'error',
    code: 'assistant_failed',
    changed: message.changes.length > 0,
    message,
  }
}

function eventStream(events: ChatEvent[]) {
  const lines = events.map((event) => `${JSON.stringify(event)}\n`).join('')
  return new Response(lines, {
    headers: { 'content-type': 'application/x-ndjson' },
  })
}
