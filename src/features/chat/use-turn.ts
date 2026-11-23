import type { AssistantStatus } from '@shared/assistant.ts'
import type { ChatEvent } from '@shared/chats.ts'
import { useQueryClient } from '@tanstack/react-query'
import { useReducer, useRef } from 'react'

import { calendarKeys } from '@/calendar-data/queries'
import { chatKeys } from '@/features/chat/chat-api'
import { sendMessage } from '@/features/chat/stream'
import {
  isRunning,
  startTurn,
  type Turn,
  type TurnAction,
  turnReducer,
} from '@/features/chat/turn'
import { ApiFailure } from '@/lib/api'

type Action = TurnAction | { type: 'start'; sent: Turn['sent'] }

function reduce(turn: Turn | null, action: Action): Turn | null {
  if (action.type === 'start') return startTurn(action.sent)
  return turn === null ? null : turnReducer(turn, action)
}

/**
 * Runs one chat's sends. Each change refreshes the calendar as it lands,
 * and the end of a turn refreshes the thread and the chat list. Leaving the
 * page lets a running turn finish rather than stopping it, since the API
 * reads a dropped reader as Stop.
 */
export function useTurn(chatId: string) {
  const client = useQueryClient()
  const [turn, dispatch] = useReducer(reduce, null)
  const controller = useRef<AbortController | null>(null)

  const refreshCalendar = () =>
    void client.invalidateQueries({ queryKey: calendarKeys.all })

  /** Resolves false when the send was turned away before it saved. */
  async function send(text: string): Promise<boolean> {
    if (turn !== null && isRunning(turn)) return false
    const abort = new AbortController()
    controller.current = abort
    const sent = { id: crypto.randomUUID(), text }
    dispatch({ type: 'start', sent })
    let events: AsyncIterable<ChatEvent>
    try {
      events = await sendMessage(chatId, sent, abort.signal)
    } catch (error) {
      if (abort.signal.aborted) {
        void client.invalidateQueries({ queryKey: chatKeys.all })
        return true
      }
      const code =
        error instanceof ApiFailure ? error.code : 'unexpected_response'
      dispatch({ type: 'refused', code })
      if (code === 'assistant_unavailable') {
        client.setQueryData<AssistantStatus>(chatKeys.status(), (status) =>
          status === undefined ? status : { ...status, online: false },
        )
        void client.invalidateQueries({ queryKey: chatKeys.status() })
      }
      return false
    }
    try {
      for await (const event of events) {
        dispatch({ type: 'event', event })
        if (event.type === 'change') refreshCalendar()
      }
      dispatch({ type: 'dropped' })
    } catch {
      dispatch(abort.signal.aborted ? { type: 'stop' } : { type: 'dropped' })
    } finally {
      refreshCalendar()
      void client.invalidateQueries({ queryKey: chatKeys.all })
    }
    return true
  }

  /** Ends the turn, keeping every change it already made. */
  function stop() {
    dispatch({ type: 'stop' })
    controller.current?.abort()
    void client.invalidateQueries({ queryKey: chatKeys.thread(chatId) })
  }

  return { turn, send, stop }
}
