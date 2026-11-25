import { z } from 'zod'

import { assistantModel } from './assistant.ts'
import { change } from './changes.ts'
import { localDate } from './trip-time.ts'
import { voiceSend } from './voice.ts'

// Read by the chat screens, so every field added here is optional and none
// is renamed once it ships.

export const LAST_MESSAGE_LENGTH = 120

/**
 * A conversation with the assistant, owned by one account and bound to one
 * trip when it is created. The title is the start of its first message, or
 * null before one is sent. The list alone carries `lastMessage`, the start of
 * the newest message with text on one line, or null before one has any.
 */
export const chat = z.strictObject({
  id: z.string(),
  tripId: z.string(),
  title: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lastMessage: z.string().max(LAST_MESSAGE_LENGTH).nullable().optional(),
})
export type Chat = z.infer<typeof chat>

export const chatRole = z.enum(['user', 'assistant'])
export type ChatRole = z.infer<typeof chatRole>

/**
 * How a message ended. A person's message is always `complete`. A reply is
 * `failed` when the model or the workspace PC broke off, and `stopped` when
 * the traveler stopped it, keeping whatever text and changes it reached.
 */
export const messageStatus = z.enum(['complete', 'failed', 'stopped'])
export type MessageStatus = z.infer<typeof messageStatus>

export const chatMessage = z.strictObject({
  id: z.string(),
  role: chatRole,
  text: z.string(),
  status: messageStatus,
  // The alias that wrote a reply, null on a person's message.
  model: assistantModel.nullable(),
  at: z.iso.datetime(),
  // The calendar writes the reply made, oldest first, each one undoable.
  changes: z.array(change),
})
export type ChatMessage = z.infer<typeof chatMessage>

/** A new chat, under an id the client generates, so a retry adds no second. */
export const createChatRequest = z.strictObject({ id: z.uuid() })
export type CreateChatRequest = z.infer<typeof createChatRequest>

export const chatRead = z.strictObject({ chat })
export type ChatRead = z.infer<typeof chatRead>

/** The account's own chats, most recently active first. */
export const chatList = z.strictObject({ chats: z.array(chat) })
export type ChatList = z.infer<typeof chatList>

/** One chat with its messages, oldest first. */
export const chatThread = z.strictObject({
  chat,
  messages: z.array(chatMessage),
})
export type ChatThread = z.infer<typeof chatThread>

/**
 * A message to send under a client id. A retry answers the saved reply,
 * a failed or stopped one included, so sending a failed message again
 * takes a new id.
 */
export const sendMessageRequest = z.strictObject({
  id: z.uuid(),
  text: z.string().trim().min(1).max(4000),
  // Set when the text started as a clip's transcript.
  voice: voiceSend.optional(),
})
export type SendMessageRequest = z.infer<typeof sendMessageRequest>

/** What the assistant did, in plain words, never a tool name. */
export const stepKind = z.enum(['add', 'move', 'update', 'remove'])
export type StepKind = z.infer<typeof stepKind>

export const turnStep = z.strictObject({
  kind: stepKind,
  title: z.string(),
  date: localDate,
  time: z.string(),
})
export type TurnStep = z.infer<typeof turnStep>

/**
 * One line of the send's NDJSON stream. A turn streams steps, text, and a
 * change per calendar write, then ends on `done` with the saved reply, or on
 * `error` saying whether anything changed before it broke off.
 */
export const chatEvent = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('step'), step: turnStep }),
  z.strictObject({ type: z.literal('delta'), text: z.string() }),
  z.strictObject({ type: z.literal('change'), changeId: z.string() }),
  z.strictObject({ type: z.literal('done'), message: chatMessage }),
  z.strictObject({
    type: z.literal('error'),
    code: z.enum(['assistant_unavailable', 'assistant_failed']),
    changed: z.boolean(),
    message: chatMessage,
  }),
])
export type ChatEvent = z.infer<typeof chatEvent>
