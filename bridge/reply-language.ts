// Above this share of marked words a reply holds Vietnamese of its own, past
// a name it quotes from no title.
const MARKED_SHARE = 0.35

/**
 * Whether `reply` reads as English once the words of the Vietnamese `titles`
 * it may quote are set aside, judged by the words still carrying Vietnamese
 * marks. Vietnamese typed without marks reads as English.
 */
export function repliesInEnglish(reply: string, titles: string[]): boolean {
  const quoted = new Set(titles.flatMap(words))
  const prose = words(reply).filter((word) => !quoted.has(word))
  const marked = prose.filter((word) => /\p{Mn}|đ/u.test(word))
  return prose.length > 0 && marked.length / prose.length < MARKED_SHARE
}

// Decomposed, so a mark stands apart from the letter it sits on.
function words(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .match(/[\p{L}\p{Mn}]+/gu) ?? []
  )
}
