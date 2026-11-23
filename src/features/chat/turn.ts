import type { ChatEvent, ChatMessage, TurnStep } from '@shared/chats.ts'

import type { FailureCode } from '@/lib/api'

/**
 * Where one send stands. `thinking` waits on the first event, `working` has
 * steps and no words yet, and `replying` streams words. The rest are ends:
 * `unavailable` and `refused` were turned away before the message saved.
 */
export type TurnPhase =
  | 'thinking'
  | 'working'
  | 'replying'
  | 'done'
  | 'stopped'
  | 'failed'
  | 'unavailable'
  | 'refused'

export interface Turn {
  phase: TurnPhase
  sent: { id: string; text: string }
  steps: TurnStep[]
  reply: string
  changeIds: string[]
  /** The saved reply, once a `done` or `error` event carried it. */
  message: ChatMessage | null
  /** Whether the plan changed before the turn ended, read by a failed card. */
  changed: boolean
  /** Why the send was turned away, on `refused`. */
  refusal: FailureCode | null
}

export type TurnAction =
  | { type: 'event'; event: ChatEvent }
  | { type: 'stop' }
  /** The stream ended or broke with no closing event. */
  | { type: 'dropped' }
  | { type: 'refused'; code: FailureCode }

export function startTurn(sent: { id: string; text: string }): Turn {
  return {
    phase: 'thinking',
    sent,
    steps: [],
    reply: '',
    changeIds: [],
    message: null,
    changed: false,
    refusal: null,
  }
}

export function isRunning(turn: Turn): boolean {
  return (
    turn.phase === 'thinking' ||
    turn.phase === 'working' ||
    turn.phase === 'replying'
  )
}

// An action reaching an ended turn changes nothing, so a late event after
// Stop cannot reopen it.
export function turnReducer(turn: Turn, action: TurnAction): Turn {
  if (!isRunning(turn)) return turn
  switch (action.type) {
    case 'stop':
      return { ...turn, phase: 'stopped' }
    case 'dropped':
      return { ...turn, phase: 'failed', changed: turn.changeIds.length > 0 }
    case 'refused':
      return action.code === 'assistant_unavailable'
        ? { ...turn, phase: 'unavailable' }
        : { ...turn, phase: 'refused', refusal: action.code }
    case 'event':
      return applyEvent(turn, action.event)
  }
}

function applyEvent(turn: Turn, event: ChatEvent): Turn {
  const midway = turn.reply === '' ? 'working' : 'replying'
  switch (event.type) {
    case 'step':
      return { ...turn, phase: midway, steps: [...turn.steps, event.step] }
    case 'change':
      return {
        ...turn,
        phase: midway,
        changeIds: [...turn.changeIds, event.changeId],
        changed: true,
      }
    case 'delta':
      return { ...turn, phase: 'replying', reply: turn.reply + event.text }
    case 'done':
      return {
        ...turn,
        phase: 'done',
        message: event.message,
        reply: event.message.text,
      }
    case 'error':
      return {
        ...turn,
        phase: 'failed',
        message: event.message,
        changed: event.changed,
      }
  }
}

/**
 * One row of a thread. `retry` is the text Try again resends, set only on a
 * failed reply that ends the thread.
 */
export type ThreadItem =
  | { kind: 'message'; message: ChatMessage; retry: string | null }
  | { kind: 'sent'; id: string; text: string }
  | { kind: 'live'; turn: Turn; retry: string | null }

/**
 * The saved messages with the turn laid over them until a refresh saves its
 * part, so nothing shows twice and nothing vanishes between the stream
 * ending and the thread reloading.
 */
export function threadItems(
  saved: ChatMessage[],
  turn: Turn | null,
): ThreadItem[] {
  const items: ThreadItem[] = saved.map((message) => ({
    kind: 'message',
    message,
    retry: null,
  }))
  if (
    turn !== null &&
    turn.phase !== 'unavailable' &&
    turn.phase !== 'refused'
  ) {
    const sentAt = saved.findIndex(({ id }) => id === turn.sent.id)
    if (sentAt === -1) {
      items.push({ kind: 'sent', id: turn.sent.id, text: turn.sent.text })
    }
    const replySaved =
      sentAt !== -1 &&
      saved.slice(sentAt + 1).some(({ role }) => role === 'assistant')
    if (turn.message !== null) {
      if (!saved.some(({ id }) => id === turn.message?.id)) {
        items.push({ kind: 'message', message: turn.message, retry: null })
      }
    } else if (!replySaved) {
      items.push({ kind: 'live', turn, retry: null })
    }
  }
  return withRetry(items)
}

function withRetry(items: ThreadItem[]): ThreadItem[] {
  const last = items.at(-1)
  if (last === undefined) return items
  const failed =
    (last.kind === 'message' && last.message.status === 'failed') ||
    (last.kind === 'live' && last.turn.phase === 'failed')
  if (!failed) return items
  const asked = items.findLast(
    (item) =>
      item.kind === 'sent' ||
      (item.kind === 'message' && item.message.role === 'user'),
  )
  const retry =
    asked === undefined
      ? null
      : asked.kind === 'sent'
        ? asked.text
        : asked.kind === 'message'
          ? asked.message.text
          : null
  return [...items.slice(0, -1), { ...last, retry }]
}
