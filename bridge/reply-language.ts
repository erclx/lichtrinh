// Words an English reply leans on and a Vietnamese one does not spell. `do`
// and `an` stay out, since both are Vietnamese words too.
const ENGLISH_WORDS = new Set(
  `a the this that it its is are was be will would should can could have has
  i you your my which what when all there and or of for from in on at to with
  added moved removed renamed changed updated done`.split(/\s+/),
)

const ENGLISH_SHARE = 0.2

/**
 * Whether `reply` reads as English once the Vietnamese `titles` it may quote
 * are set aside. A share of common words decides, so a reply holding a whole
 * Vietnamese sentence beside an English one can still pass.
 */
export function repliesInEnglish(reply: string, titles: string[]): boolean {
  const prose = titles
    .map((title) => title.toLowerCase().normalize('NFC'))
    // Longest first, so a title inside another leaves nothing of it behind.
    .sort((a, b) => b.length - a.length)
    .reduce(
      (text, title) => (title === '' ? text : text.replaceAll(title, ' ')),
      reply.toLowerCase().normalize('NFC'),
    )
  const words = prose.match(/\p{L}+/gu) ?? []
  const english = words.filter((word) => ENGLISH_WORDS.has(word))
  return words.length > 0 && english.length / words.length >= ENGLISH_SHARE
}
