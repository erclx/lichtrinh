import type { Run } from '../run.ts'

export interface CardMemory {
  totalMiB: number
  usedMiB: number
}

const READ_EVERY_MS = 10_000

/** Reads the card at most every ten seconds. Answers null when it cannot. */
export function createGpuReader(run: Run, now: () => Date) {
  let last: { at: number; memory: CardMemory | null } | undefined

  return async (): Promise<CardMemory | null> => {
    const at = now().getTime()
    if (last !== undefined && at - last.at < READ_EVERY_MS) return last.memory
    const { code, stdout } = await run([
      'nvidia-smi',
      '--query-gpu=memory.total,memory.used',
      '--format=csv,noheader,nounits',
    ])
    last = { at, memory: code === 0 ? readMemory(stdout) : null }
    return last.memory
  }
}

// The first line is the first card, and the workspace PC holds one.
function readMemory(stdout: string): CardMemory | null {
  const match = /^(\d+), (\d+)$/m.exec(stdout)
  if (match === null) return null
  const [totalMiB, usedMiB] = [Number(match[1]), Number(match[2])]
  return totalMiB > 0 ? { totalMiB, usedMiB } : null
}
