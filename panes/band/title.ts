/** Words a cut title must not end on: "Project read-only Codex roles and a…" reads as broken. */
const DANGLING = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with', 'from', 'by', 'at', 'as', 'is'])

/** Characters of the band's text one cell holds on the desktop: a title's character is about 6pt, a cell about 8pt (2026-10-17). A terminal's cell holds one. */
export const DESKTOP_CHARS_PER_CELL = 1.3
/**
 * A cell of the band across, in points: the label column's 9 cells and a gap put the agent dot
 * 88pt in, and 85 columns less the band's padding spanned the 733pt from the label column to the
 * pills' trailing edge (a desktop shot, 2026-10-28, issue 119), the card lab's measure too (#103).
 */
export const DESKTOP_CELL_PT = 8.8
/** Cells a pill takes beyond its label: the desktop button's padding, about 16pt (2026-10-17). */
const PILL_PADDING = 2

/**
 * Characters a band row's title may take: the `cells` the row leaves after its
 * label and number, less each pill at its right end and the gap before it, at
 * `perCell` characters a cell, less one for the ellipsis a cut adds. A long
 * status ("Waiting on you (16)") cuts the title shorter rather than drawing it
 * under the pill; a wide band still cuts at 40.
 */
export function titleRoom(cells: number, pills: readonly string[], perCell: number): number {
  const pillCells = pills.reduce((sum, pill) => sum + Math.ceil(pill.length / perCell) + PILL_PADDING + 1, 0)
  return Math.min(40, Math.max(8, Math.floor((cells - pillCells) * perCell) - 1))
}

/**
 * A title the band can hold whole: at most `maxWords` words and `maxChars`
 * characters, cut at a word, never on a dangling word, an ellipsis when cut.
 * The rows themselves are drawn by the AbovePrompt handler in hooks/register.tsx,
 * which shares the pane's session.
 */
export function shortTitle(title: string, maxWords = 6, maxChars = 40): string {
  const words = title.trim().split(/\s+/).filter(word => word !== '')
  const kept: string[] = []
  for (const word of words) {
    if (kept.length === maxWords || [...kept, word].join(' ').length > maxChars) break
    kept.push(word)
  }
  if (kept.length === words.length) return kept.join(' ')
  // A word in punctuation dangles too: "page (the…" ends on "the".
  while (kept.length > 1 && DANGLING.has((kept[kept.length - 1] as string).toLowerCase().replace(/^\W+|\W+$/g, ''))) kept.pop()
  // One word longer than the limit is cut inside it.
  const text = kept.length === 0 ? (words[0] ?? '').slice(0, maxChars - 1) : kept.join(' ')
  return `${text.replace(/[\s,;:.\-–—]+$/, '')}…`
}
