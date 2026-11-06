// Search boxes match each word the user types against the start of a word in the fields,
// so one letter finds names starting with it instead of nearly every row.

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
const compact = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

/** True when every word of `query` starts a word in `fields`, or (3+ letters) appears inside one. */
export function matchesSearch(query: string, fields: (string | null | undefined)[]): boolean {
  const terms = words(query)
  if (terms.length === 0) return true
  const texts = fields.filter((f): f is string => Boolean(f))
  const fieldWords = texts.flatMap(words)
  // "cs6301" should find "CS 6301", so also compare with spaces and punctuation removed.
  const joined = texts.map(compact)
  return terms.every(
    (term) =>
      fieldWords.some((w) => w.startsWith(term)) ||
      (term.length >= 3 && (fieldWords.some((w) => w.includes(term)) || joined.some((j) => j.includes(term)))),
  )
}
