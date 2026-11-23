/**
 * Where the mic stands, from a tap to the words landing in the box. Only
 * starting, listening, and transcribing take the message row, so the box
 * stays typable in every other phase.
 */
export type TalkState =
  | { phase: 'ready' }
  | { phase: 'starting' }
  | { phase: 'listening' }
  | { phase: 'transcribing'; capped: boolean; slow: boolean }
  | { phase: 'review'; transcriptionId: string; capped: boolean }
  | { phase: 'retry' }
  | { phase: 'denied' }
  | { phase: 'off' }
  | { phase: 'failed' }

export type TalkAction =
  | { type: 'tap' }
  | { type: 'opened' }
  | { type: 'stop' }
  | { type: 'capped' }
  | { type: 'dropped' }
  | { type: 'denied' }
  | { type: 'slow' }
  | { type: 'landed'; transcriptionId: string; text: string }
  | { type: 'unavailable' }
  | { type: 'failed' }
  | { type: 'sent' }

export const readyTalk: TalkState = { phase: 'ready' }

/** True while the message row is the bar rather than the box. */
export function isRecording(state: TalkState): boolean {
  return (
    state.phase === 'starting' ||
    state.phase === 'listening' ||
    state.phase === 'transcribing'
  )
}

// An action that does not fit the phase leaves the state alone, since the
// mic, the timer, and the answer race each other and the late one loses.
export function talkReducer(state: TalkState, action: TalkAction): TalkState {
  switch (action.type) {
    case 'tap':
      return isRecording(state) ? state : { phase: 'starting' }
    case 'opened':
      return state.phase === 'starting' ? { phase: 'listening' } : state
    case 'stop':
      if (state.phase === 'starting') return readyTalk
      if (state.phase === 'listening') {
        return { phase: 'transcribing', capped: false, slow: false }
      }
      return state
    case 'capped':
      return state.phase === 'listening'
        ? { phase: 'transcribing', capped: true, slow: false }
        : state
    case 'dropped':
      return state.phase === 'starting' || state.phase === 'listening'
        ? readyTalk
        : state
    case 'denied':
      return state.phase === 'starting' ? { phase: 'denied' } : state
    case 'slow':
      return state.phase === 'transcribing' ? { ...state, slow: true } : state
    case 'landed':
      if (state.phase !== 'transcribing') return state
      return action.text.trim() === ''
        ? { phase: 'retry' }
        : {
            phase: 'review',
            transcriptionId: action.transcriptionId,
            capped: state.capped,
          }
    case 'unavailable':
      return isRecording(state) ? { phase: 'off' } : state
    case 'failed':
      return isRecording(state) ? { phase: 'failed' } : state
    case 'sent':
      return isRecording(state) ? state : readyTalk
  }
}
