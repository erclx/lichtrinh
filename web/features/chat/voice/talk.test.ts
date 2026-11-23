import {
  isRecording,
  readyTalk,
  type TalkAction,
  talkReducer,
  type TalkState,
} from '@/features/chat/voice/talk'

const clipId = '0b6f3a52-5d3e-4c1a-9f7e-1c2d3e4f5a6b'

function run(...actions: TalkAction[]): TalkState {
  return actions.reduce(talkReducer, readyTalk)
}

const listening: TalkAction[] = [{ type: 'tap' }, { type: 'opened' }]

describe('talkReducer', () => {
  it('starts on a tap and listens once the mic opens', () => {
    expect(run({ type: 'tap' })).toEqual({ phase: 'starting' })
    expect(run(...listening)).toEqual({ phase: 'listening' })
  })

  it('returns to ready on Stop before the mic opens, ignoring a late open', () => {
    const state = run({ type: 'tap' }, { type: 'stop' }, { type: 'opened' })

    expect(state).toEqual(readyTalk)
  })

  it('transcribes on Stop', () => {
    const state = run(...listening, { type: 'stop' })

    expect(state).toEqual({ phase: 'transcribing', capped: false, slow: false })
  })

  it('transcribes what it holds at the 60 second cap, marked capped', () => {
    const state = run(...listening, { type: 'capped' })

    expect(state).toEqual({ phase: 'transcribing', capped: true, slow: false })
  })

  it('marks a slow transcription', () => {
    const state = run(...listening, { type: 'stop' }, { type: 'slow' })

    expect(state).toEqual({ phase: 'transcribing', capped: false, slow: true })
  })

  it('reviews the words once they land, keeping the cap mark', () => {
    const state = run(
      ...listening,
      { type: 'capped' },
      { type: 'landed', transcriptionId: clipId, text: 'doi an toi' },
    )

    expect(state).toEqual({
      phase: 'review',
      transcriptionId: clipId,
      capped: true,
    })
  })

  it('asks to try again when the clip held no speech', () => {
    const state = run(
      ...listening,
      { type: 'stop' },
      { type: 'landed', transcriptionId: clipId, text: '  ' },
    )

    expect(state).toEqual({ phase: 'retry' })
  })

  it('drops the clip when the page hides mid-clip', () => {
    expect(run(...listening, { type: 'dropped' })).toEqual(readyTalk)
  })

  it('keeps transcribing when the page hides after Stop', () => {
    const state = run(...listening, { type: 'stop' }, { type: 'dropped' })

    expect(state.phase).toBe('transcribing')
  })

  it('shows voice off when voice goes away mid-clip', () => {
    expect(run(...listening, { type: 'unavailable' })).toEqual({
      phase: 'off',
    })
  })

  it('shows the failure line when the transcription fails', () => {
    const state = run(...listening, { type: 'stop' }, { type: 'failed' })

    expect(state).toEqual({ phase: 'failed' })
  })

  it('shows the denied card when the mic is refused', () => {
    expect(run({ type: 'tap' }, { type: 'denied' })).toEqual({
      phase: 'denied',
    })
  })

  it('starts again from review, retry, denied, off, and failed', () => {
    const review = run(
      ...listening,
      { type: 'stop' },
      { type: 'landed', transcriptionId: clipId, text: 'a' },
    )

    expect(talkReducer(review, { type: 'tap' })).toEqual({ phase: 'starting' })
    expect(talkReducer({ phase: 'retry' }, { type: 'tap' }).phase).toBe(
      'starting',
    )
    expect(talkReducer({ phase: 'denied' }, { type: 'tap' }).phase).toBe(
      'starting',
    )
    expect(talkReducer({ phase: 'off' }, { type: 'tap' }).phase).toBe(
      'starting',
    )
    expect(talkReducer({ phase: 'failed' }, { type: 'tap' }).phase).toBe(
      'starting',
    )
  })

  it('ignores a second tap while recording', () => {
    expect(run(...listening, { type: 'tap' })).toEqual({ phase: 'listening' })
  })

  it('returns to ready on a send from review', () => {
    const state = run(
      ...listening,
      { type: 'stop' },
      { type: 'landed', transcriptionId: clipId, text: 'a' },
      { type: 'sent' },
    )

    expect(state).toEqual(readyTalk)
  })
})

describe('isRecording', () => {
  it('holds the row from starting through transcribing alone', () => {
    expect(isRecording({ phase: 'starting' })).toBe(true)
    expect(isRecording({ phase: 'listening' })).toBe(true)
    expect(
      isRecording({ phase: 'transcribing', capped: false, slow: false }),
    ).toBe(true)
    expect(isRecording({ phase: 'retry' })).toBe(false)
    expect(isRecording(readyTalk)).toBe(false)
  })
})
