import type { ChatList, ChatRead, ChatThread } from '@shared/chats.ts'
import { createChatRequest } from '@shared/chats.ts'
import { Hono } from 'hono'

import { createChat, listChats, ownChat, threadOf } from '../assistant/chats.ts'
import type { AuthEnv } from '../auth/guard.ts'
import { requireChat } from '../auth/guard.ts'
import { createDb } from '../db/client.ts'
import { parseBody, refuse } from '../envelope.ts'
import { logOutcome } from '../log.ts'

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
