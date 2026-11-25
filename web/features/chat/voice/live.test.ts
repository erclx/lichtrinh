import type { LiveText } from '@shared/voice.ts'

import { runLive } from '@/features/chat/voice/live'

interface Sent {
  from: number
  bytes: number
  at: number
  signal: AbortSignal
  answer: (text: string, heard: number) => void
  fail: () => void
}

/** A clip that has recorded `size` bytes so far, and a server to answer by hand. */
function aTurn() {
  const clip = { size: 0 }
  const sent: Sent[] = []
  const words: string[] = []
  const end = runLive({
    since: (from) => new Blob([new Uint8Array(Math.max(0, clip.size - from))]),
    send: (from, piece, signal) =>
      new Promise<LiveText>((resolve, reject) => {
        sent.push({
          from,
          bytes: piece.size,
          at: Date.now(),
          signal,
          answer: (text, heard) => resolve({ text, heard }),
          fail: () => reject(new Error('lost')),
        })
      }),
    onWords: (text) => words.push(text),
  })
  return { clip, sent, words, end }
}

/** Runs the clock and lets an answer already given land. */
const pass = (ms: number) => vi.advanceTimersByTimeAsync(ms)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('runLive', () => {
  it('waits for the first bytes, then sends them from the start', async () => {
    const turn = aTurn()
    await pass(1_000)
    expect(turn.sent).toEqual([])

    turn.clip.size = 40
    await pass(500)

    expect(turn.sent).toMatchObject([{ from: 0, bytes: 40 }])
  })

  it('hands over the words and sends on from the byte heard', async () => {
    const turn = aTurn()
    turn.clip.size = 40
    await pass(500)

    turn.sent[0].answer('Invented', 40)
    turn.clip.size = 100
    await pass(500)

    expect(turn.words).toEqual(['Invented'])
    expect(turn.sent[1]).toMatchObject({ from: 40, bytes: 60 })
  })

  it('never has two pieces in flight', async () => {
    const turn = aTurn()
    turn.clip.size = 40
    await pass(500)

    turn.clip.size = 400
    await pass(4_000)

    expect(turn.sent).toHaveLength(1)
  })

  it('starts each piece at least half a second after the last', async () => {
    const turn = aTurn()
    turn.clip.size = 40
    await pass(500)

    turn.sent[0].answer('Invented', 40)
    turn.clip.size = 80
    await pass(499)
    expect(turn.sent).toHaveLength(1)
    await pass(1)

    expect(turn.sent).toHaveLength(2)
  })

  it('sends the next piece at once after a slow answer', async () => {
    const turn = aTurn()
    turn.clip.size = 40
    await pass(500)
    await pass(1_200)

    turn.clip.size = 80
    turn.sent[0].answer('Invented', 40)
    await pass(0)

    expect(turn.sent).toHaveLength(2)
  })

  it('sends the clip from its start once the voice server lost the turn', async () => {
    const turn = aTurn()
    turn.clip.size = 40
    await pass(500)
    turn.sent[0].answer('Invented', 40)
    turn.clip.size = 80
    await pass(500)

    turn.sent[1].answer('', 0)
    await pass(500)

    expect(turn.sent[2]).toMatchObject({ from: 0, bytes: 80 })
    // The words already standing stay until the new turn has some.
    expect(turn.words).toEqual(['Invented'])
  })

  it('resends a lost piece after waiting longer each time, to two seconds', async () => {
    const turn = aTurn()
    turn.clip.size = 40
    await pass(500)

    turn.sent[0].fail()
    await pass(2_000)
    turn.sent[1].fail()
    await pass(2_000)
    turn.sent[2].fail()
    await pass(2_000)

    const waits = turn.sent.slice(1).map((one, i) => one.at - turn.sent[i].at)
    expect(waits).toEqual([1_000, 2_000, 2_000])
    expect(turn.sent.map((one) => one.from)).toEqual([0, 0, 0, 0])
  })

  it('returns to half a second once a piece lands again', async () => {
    const turn = aTurn()
    turn.clip.size = 40
    await pass(500)
    turn.sent[0].fail()
    await pass(1_000)

    turn.sent[1].answer('Invented', 40)
    turn.clip.size = 80
    await pass(500)

    expect(turn.sent).toHaveLength(3)
  })

  it('ends with the piece in flight dropped and its words unheard', async () => {
    const turn = aTurn()
    turn.clip.size = 40
    await pass(500)

    turn.end()
    turn.sent[0].answer('Late words', 40)
    turn.clip.size = 400
    await pass(5_000)

    expect(turn.sent[0].signal.aborted).toBe(true)
    expect(turn.words).toEqual([])
    expect(turn.sent).toHaveLength(1)
  })

  it('ends between pieces too', async () => {
    const turn = aTurn()
    turn.clip.size = 40
    await pass(500)
    turn.sent[0].answer('Invented', 40)
    await pass(0)

    turn.end()
    turn.clip.size = 400
    await pass(5_000)

    expect(turn.sent).toHaveLength(1)
  })

  it('gives up on a piece that never answers and sends it again', async () => {
    const turn = aTurn()
    turn.clip.size = 40
    await pass(500)

    await pass(8_000)
    expect(turn.sent[0].signal.aborted).toBe(true)
    turn.sent[0].fail()
    await pass(2_000)

    expect(turn.sent).toHaveLength(2)
  })
})
