import { type LiveText, liveText } from '@shared/voice.ts'

const GAP_MS = 500
const LONGEST_GAP_MS = 2_000
// Past the relay's own wait, so this only ends a request the network lost.
const GIVE_UP_MS = 8_000

interface LiveOptions {
  /** The bytes the clip has recorded past an offset. */
  since: (from: number) => Blob
  send: (from: number, piece: Blob, signal: AbortSignal) => Promise<LiveText>
  onWords: (words: string) => void
}

/**
 * Sends a clip piece by piece while it records and hands over the words so
 * far, one request at a time, so a slow link sends fewer and longer pieces.
 * Returns the call that ends it, after which nothing more is handed over.
 */
export function runLive({ since, send, onWords }: LiveOptions): () => void {
  let from = 0
  let gap = GAP_MS
  let ended = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let request: AbortController | undefined

  async function step() {
    const startedAt = Date.now()
    const piece = since(from)
    if (piece.size > 0) await ask(piece)
    if (ended) return
    timer = setTimeout(
      () => void step(),
      Math.max(0, gap - (Date.now() - startedAt)),
    )
  }

  async function ask(piece: Blob) {
    const current = new AbortController()
    request = current
    const late = setTimeout(() => current.abort(), GIVE_UP_MS)
    try {
      const answer = await send(from, piece, current.signal)
      if (ended) return
      from = answer.heard
      gap = GAP_MS
      // Empty until the first word, and after a restart until it catches up.
      if (answer.text !== '') onWords(answer.text)
    } catch {
      gap = Math.min(gap * 2, LONGEST_GAP_MS)
    } finally {
      clearTimeout(late)
    }
  }

  void step()

  return () => {
    ended = true
    clearTimeout(timer)
    request?.abort()
  }
}

/**
 * Sends one piece of the turn `id`. It goes around `apiFetch`, which tells
 * the whole app about a lost connection or a lapsed session, and a preview
 * failing may change nothing but itself.
 */
export async function sendPiece(
  id: string,
  from: number,
  piece: Blob,
  signal: AbortSignal,
): Promise<LiveText> {
  const response = await fetch(`/api/voice/live/${id}?from=${from}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': piece.type },
    body: piece,
    signal,
  })
  if (!response.ok) throw new Error('no live words')
  return liveText.parse(await response.json())
}
