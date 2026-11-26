import type { AssistantStatus } from '@shared/assistant.ts'
import type { ChatEvent } from '@shared/chats.ts'
import type { VoiceSend } from '@shared/voice.ts'
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
import { hold } from '@/update/holds'

type Action = TurnAction | { type: 'start'; sent: Turn['sent'] }

function reduce(turn: Turn | null, action: Action): Turn | null {
  if (action.type === 'start') return startTurn(action.sent)
  return turn === null ? null : turnReducer(turn, action)
}

/**
 * Runs one chat's sends, refreshing the calendar on each change and the chat
 * reads at the end. Leaving the page never aborts a running turn, since the
 * API reads a dropped reader as Stop.
 */
export function useTurn(chatId: string) {
  const client = useQueryClient()
  const [turn, dispatch] = useReducer(reduce, null)
  const controller = useRef<AbortController | null>(null)

  const refreshCalendar = () =>
    void client.invalidateQueries({ queryKey: calendarKeys.all })

  /** Resolves false when turned away. `voice` rides a transcript's send. */
  async function send(text: string, voice?: VoiceSend): Promise<boolean> {
    if (turn !== null && isRunning(turn)) return false
    // Held here, not in an effect, since the turn outlives its page.
    const release = hold()
    try {
      return await run(text, voice)
    } finally {
      release()
    }
  }

  async function run(text: string, voice?: VoiceSend): Promise<boolean> {
    const abort = new AbortController()
    controller.current = abort
    const sent = { id: crypto.randomUUID(), text }
    dispatch({ type: 'start', sent })
    let events: AsyncIterable<ChatEvent>
    try {
      events = await sendMessage(chatId, { ...sent, voice }, abort.signal)
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
