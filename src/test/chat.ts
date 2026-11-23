import type { Change, EntryFields } from '@shared/changes.ts'
import type { Chat, ChatMessage, TurnStep } from '@shared/chats.ts'

/** An invented chat on the invented 2031 trip. */
export function aChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: 'chat-today',
    tripId: 'trip-river',
    title: 'Plan for today',
    createdAt: '2031-05-15T01:00:00.000Z',
    updatedAt: '2031-05-15T01:05:00.000Z',
    ...overrides,
  }
}

/** The traveler's own message, always complete. */
export function aUserMessage(
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: 'message-ask',
    role: 'user',
    text: 'pho sang mai luc 7 gio',
    status: 'complete',
    model: null,
    at: '2031-05-15T01:04:00.000Z',
    changes: [],
    ...overrides,
  }
}

/** A finished reply that changed nothing unless told otherwise. */
export function aReply(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-reply',
    role: 'assistant',
    text: 'Done. I added it to tomorrow morning.',
    status: 'complete',
    model: 'lichtrinh-assistant',
    at: '2031-05-15T01:05:00.000Z',
    changes: [],
    ...overrides,
  }
}

const breakfast: EntryFields = {
  tripId: 'trip-river',
  title: 'Pho breakfast',
  notes: null,
  kind: 'food',
  startsOn: '2031-05-16',
  startTime: '07:00',
  endsOn: '2031-05-16',
  endTime: '08:00',
  timeZone: 'Asia/Ho_Chi_Minh',
  costMinor: null,
}

/** The assistant adding an invented breakfast on the trip's fourth day. */
export function anAddChange(
  overrides: Partial<Extract<Change, { entity: 'entry' }>> = {},
): Change {
  return {
    id: 'change-breakfast',
    at: '2031-05-15T01:05:00.000Z',
    actor: { id: 'user-traveler', displayName: 'Du khách' },
    source: 'assistant',
    op: 'create',
    entity: 'entry',
    entityId: 'entry-breakfast',
    undoneBy: null,
    before: null,
    after: breakfast,
    ...overrides,
  }
}

const boatTrip: EntryFields = {
  ...breakfast,
  title: 'Sunset boat trip',
  kind: 'transport',
  startsOn: '2031-05-15',
  startTime: '17:00',
  endsOn: '2031-05-15',
  endTime: '19:00',
}

/** The assistant moving an invented boat trip from 17:00 to 17:30. */
export function aMoveChange(
  overrides: Partial<Extract<Change, { entity: 'entry' }>> = {},
): Change {
  return anAddChange({
    id: 'change-move',
    op: 'update',
    entityId: 'entry-boat',
    before: boatTrip,
    after: { ...boatTrip, startTime: '17:30', endTime: '19:30' },
    ...overrides,
  })
}

export function aStep(overrides: Partial<TurnStep> = {}): TurnStep {
  return {
    kind: 'add',
    title: 'Pho breakfast',
    date: '2031-05-16',
    time: '07:00',
    ...overrides,
  }
}
