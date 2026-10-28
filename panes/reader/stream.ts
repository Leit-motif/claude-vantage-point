// The Reader's stream: what the linearizer hands the pacing engine, and what
// the pacing engine hands the Reader. Plain data with no engine imports, so
// node runs it as well as the mod.

/**
 * One stretch of a reply in reading order, as the linearizer emits it. Each
 * run ends at a block boundary (a paragraph, a list item, a table row, a code
 * block); the pacing engine decelerates there.
 */
export type Run = {
  /**
   * `prose`: the reply's own words. `code`: code or tool output, verbatim.
   * `cue`: words the linearizer adds to name structure the layout carried
   * (a table's header beside its value, the start and end of a code block).
   */
  kind: 'prose' | 'code' | 'cue'
  text: string
  /** Where the run sits in the reply's layout, which the Reader draws above the word rather than speaks (#112). */
  place?: Place
}

/**
 * A run's place in the layout a screen would have drawn: the section it is
 * in, whether it is a heading's own words, and the mark of the list item,
 * quote or table row it belongs to (`• 2 of 4`, `2.1`, `quote`, `row 3 of 5`).
 */
export type Place = { section?: string; heading?: true; mark?: string }

/** One word on screen, as the pacing engine emits it. */
export type Beat = {
  text: string
  kind: Run['kind']
  /** How long the word holds, in milliseconds, at the pace asked for. */
  ms: number
  /** The index of the run the word came from. */
  run: number
}
