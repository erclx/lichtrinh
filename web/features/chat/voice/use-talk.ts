import type { AssistantStatus } from '@shared/assistant.ts'
import { transcription } from '@shared/voice.ts'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useReducer, useRef, useState } from 'react'

import { chatKeys, warm } from '@/features/chat/chat-api'
import { runLive, sendPiece } from '@/features/chat/voice/live'
import {
  MicDenied,
  openMic,
  pickFormat,
  record,
  type Recording,
} from '@/features/chat/voice/recorder'
import { isRecording, readyTalk, talkReducer } from '@/features/chat/voice/talk'
import { ApiFailure, apiFetch } from '@/lib/api'

const SLOW_MS = 5_000

/** Sends a clip under the id given, so a retried send reaches the same row. */
export function transcribe(id: string, clip: Blob) {
  return apiFetch(`/voice/transcriptions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    blob: clip,
    schema: transcription,
  })
}

/**
 * Runs the mic: a tap warms voice and opens the microphone, Stop sends the
 * whole clip under a fresh id, and `onLanded` gets the words. Each tap opens
 * a session, so a late answer from a dropped one changes nothing. `words` is
 * the preview so far, empty once the clip lands, fails, or drops.
 */
export function useTalk(onLanded: (text: string) => void) {
  const client = useQueryClient()
  const [state, dispatch] = useReducer(talkReducer, readyTalk)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [words, setWords] = useState('')
  const session = useRef(0)
  const recording = useRef<Recording | null>(null)
  const endLive = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      session.current += 1
      recording.current?.cancel()
      endLive.current?.()
    },
    [],
  )

  function letGo() {
    endLive.current?.()
    endLive.current = null
    recording.current = null
    setStream(null)
  }

  async function tap() {
    if (isRecording(state)) return
    session.current += 1
    const id = session.current
    dispatch({ type: 'tap' })
    setWords('')
    // Loads the speech model while the traveler speaks.
    warm().catch(() => undefined)
    const format = pickFormat()
    if (format === null) {
      dispatch({ type: 'failed' })
      return
    }
    let opened: MediaStream
    try {
      opened = await openMic()
    } catch (error) {
      if (session.current !== id) return
      dispatch({ type: error instanceof MicDenied ? 'denied' : 'failed' })
      return
    }
    // Stop came while the permission prompt was open.
    if (session.current !== id) {
      for (const track of opened.getTracks()) track.stop()
      return
    }
    const recorded = record(opened, format, {
      onCap: (clip) => {
        letGo()
        dispatch({ type: 'capped' })
        void send(id, clip)
      },
      onHidden: () => {
        session.current += 1
        letGo()
        dispatch({ type: 'dropped' })
      },
      // Listening starts with the first audio, so a Stop always sends some.
      onAudio: () => {
        if (session.current !== id) return
        dispatch({ type: 'opened' })
        const turnId = crypto.randomUUID()
        endLive.current = runLive({
          since: recorded.since,
          send: (from, piece, signal) => sendPiece(turnId, from, piece, signal),
          onWords: setWords,
        })
      },
    })
    recording.current = recorded
    setStream(opened)
  }

  function stop() {
    if (state.phase === 'starting') {
      session.current += 1
      recording.current?.cancel()
      letGo()
      dispatch({ type: 'stop' })
      return
    }
    if (state.phase !== 'listening' || recording.current === null) return
    const clip = recording.current.stop()
    letGo()
    dispatch({ type: 'stop' })
    void send(session.current, clip)
  }

  async function send(id: number, clip: Promise<Blob>) {
    const slow = setTimeout(() => {
      if (session.current === id) dispatch({ type: 'slow' })
    }, SLOW_MS)
    try {
      const audio = await clip
      const transcriptionId = crypto.randomUUID()
      const text =
        audio.size === 0 ? '' : (await transcribe(transcriptionId, audio)).text
      if (session.current !== id) return
      dispatch({ type: 'landed', transcriptionId, text })
      if (text.trim() !== '') onLanded(text.trim())
    } catch (error) {
      if (session.current !== id) return
      if (error instanceof ApiFailure && error.code === 'voice_unavailable') {
        dispatch({ type: 'unavailable' })
        markVoiceOffline()
      } else {
        dispatch({ type: 'failed' })
      }
    } finally {
      clearTimeout(slow)
    }
  }

  function markVoiceOffline() {
    client.setQueryData<AssistantStatus>(chatKeys.status(), (status) =>
      status?.voice === undefined
        ? status
        : { ...status, voice: { ...status.voice, online: false } },
    )
    void client.invalidateQueries({ queryKey: chatKeys.status() })
  }

  /** Clears the review or a notice once the box's text is sent. */
  function sent() {
    dispatch({ type: 'sent' })
  }

  const live = state.phase === 'listening' || state.phase === 'transcribing'

  return { state, stream, words: live ? words : '', tap, stop, sent }
}
