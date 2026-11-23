/**
 * The share of words the traveler changed between the box right after a
 * transcript landed and the text sent, from 0 untouched to 1 rewritten.
 * It counts words rather than letters, as a word error rate does, so a
 * diacritic added to a word counts that word as changed.
 */
export function editRatio(landed: string, sent: string): number {
  const before = words(landed)
  const after = words(sent)
  const longest = Math.max(before.length, after.length)
  if (longest === 0) return 0
  return distance(before, after) / longest
}

function words(text: string): string[] {
  return text.normalize('NFC').trim().split(/\s+/).filter(Boolean)
}

// Levenshtein over words, one row at a time.
function distance(a: string[], b: string[]): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const swap = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, swap)
    }
    previous = current
  }
  return previous[b.length]
}
