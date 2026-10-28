// Gist: the short version of a reply that keeps its bottom-line meaning,
// written by the reply's author (Interlace's term, `CONTEXT.md` in
// interlace-android; decided on interlace-android#222). The Reader plays the
// gist by default and the full reply on request (#49). The author writes it
// in the reply itself, in a <gist> block the mod hides from the transcript;
// no model is asked for one afterwards, since a call per read costs too much
// (the owner, 2026-10-17). Pure, so node runs it.

/** The most words a gist may run to; the ask says so, and a longer answer is cut at a sentence. */
export const GIST_MAX_WORDS = 120

/** The words a reply must pass before its author writes a gist of it: a short reply is its own gist. */
export const GIST_FROM_WORDS = 150

/**
 * The line the mod adds to the system prompt: the reply's author writes the
 * gist at the end of a long reply, in a block the mod hides from the
 * transcript and the Reader plays (#49). Written in the same reply, so it
 * costs a few dozen output tokens and no extra step.
 */
export const GIST_SECTION = [
  `The person may read your reply on a speed reader that shows one word at a time. When your final reply to them runs past about ${GIST_FROM_WORDS} words, end it with its gist inside <gist></gist> tags, as the very last thing you write. The tags and what is inside them are hidden from the person's transcript; only the speed reader shows the gist.`,
  'The gist: plain spoken prose in short sentences, no lists, headings, markdown, code, brackets or emoji. Lead with the bottom line: what is now true, what you found, or what you need from the person. Keep anything that would change what they do if they missed it: a condition, an exception, a negation, a decision they owe, a number that matters. Name a file, issue or identifier only when they need it, written whole. Leave out hashes, line numbers, folders and anything they can look up later. About a third of the reply at most, and never more than ' + GIST_MAX_WORDS + ' words.',
].join(' ')

const GIST_BLOCK = /\s*<gist>([\s\S]*?)<\/gist>\s*$/

/** A reply's text split into what the person reads and the gist its author wrote, if any. */
export function splitGist(text: string): { reply: string; gist: string | null } {
  const m = GIST_BLOCK.exec(text)
  if (m === null) return { reply: text, gist: null }
  return { reply: text.slice(0, m.index), gist: checkGist(m[1] ?? '') }
}

/**
 * A written gist as one the Reader can play, or null when it is not one
 * (empty, structured data, or no sentence of words): the Reader then plays
 * the full reply. Markdown the author let through is flattened, and an
 * answer past GIST_MAX_WORDS is cut at the last sentence that fits.
 */
export function checkGist(answer: string): string | null {
  const text = answer
    .replace(/^```[\s\S]*?```$/gm, ' ')
    .replace(/^\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/gm, '')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const words = text.split(' ').filter(word => /\p{L}/u.test(word))
  if (words.length < 3 || /^[{[]/.test(text)) return null
  if (text.split(' ').length <= GIST_MAX_WORDS) return text
  const cut = text.split(' ').slice(0, GIST_MAX_WORDS).join(' ')
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '))
  return end > 0 ? cut.slice(0, end + 1) : cut
}
