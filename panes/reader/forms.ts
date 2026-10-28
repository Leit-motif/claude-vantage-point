// Forms: what does not belong in rapid serial reading, mixed into it (#49).
// The brain reads a symbol, not its characters: `vantage-point@my-app`
// is one pointer to one concept. So a symbol is one beat, never divided
// across beats, held for a concept and a little longer since it breaks the
// prose; the picture wraps it onto lines inside its one frame when it is too
// long for one. A code block plays on plates of whole source lines, one
// after another, each held by its row count. Everything else is a word,
// paced as Interlace paces it.
//
// A pass over the pacer's beats, so `pace.ts` stays Interlace's port.
import { lengthShare, pace } from './pace.ts'
import type { PaceOptions, PacedBeat } from './pace.ts'
import type { Run } from './stream.ts'

/**
 * A symbol's hold, in words at the pace there: one concept, slowed so the
 * change of form is felt (1.6 was too little to notice: the owner, 2026-10-17).
 */
export const SYMBOL_WORDS = 3
/** Each line a wrapped symbol needs past its first adds this much. */
const SYMBOL_LINE_WORDS = 1
/** A code block's hold, in words at the pace there: a lead-in, then this many for each row (2.5 held two shell commands about a second at 400 wpm: the design review, #112). */
const BLOCK_LEAD_WORDS = 3
const BLOCK_LINE_WORDS = 4

/**
 * A word that names something rather than says it: a handle, a reference,
 * an identifier, a path, a file, a version. `@`, `#N`, `::`, `_` and `\\`
 * each name, as does a `label:value`; so does a file extension, a version (`0.41.1`), a path of two
 * slashes or a rooted one, one slash in a name with a digit, dot or hyphen
 * (`evidence/30-interlace-reader`), and lower camel case (`readerWpm`). A brand such as
 * GitHub or macOS, `and/or`, `24/7` or `e.g.` are words, and `2.2` a quantity.
 */
/** A word without the sentence's quotes, brackets and punctuation around it, or a possessive `'s`. */
const bare = (word: string) => word.replace(/^[("'“‘\[]+/, '').replace(/[.,;:!?)"'”’\]]+$/, '').replace(/['’]s$/, '')

export function isSymbol(word: string): boolean {
  const core = bare(word)
  if (!/[\p{L}\p{N}]/u.test(core)) return false
  return (
    /[@_\\]|#\d|\w#\w|::|[a-z]:[a-z]/i.test(core) ||
    /\w{2,}\.[a-z][a-z0-9]{0,5}$|\w\.\w+\.[a-z][a-z0-9]{0,5}$/i.test(core) ||
    (/\w{2,}\/\w{2,}/.test(core) && /[\d.-]/.test(core) && !/^[\d/]+$/.test(core)) ||
    /\d\.\d+\.\d/.test(core) ||
    /\/.*\/|^[~.]{0,2}\/\w/.test(core) ||
    /^[a-z]{2,}[A-Z][a-z]/.test(core)
  )
}

/** A word without the punctuation around it; an apostrophe, a % or a digit's comma inside it stays. */
const unpunctuated = (word: string) =>
  /^[\p{Pd}\p{Po}\p{Ps}\p{Pe}\p{Pi}\p{Pf}]+$/u.test(word) ? '' : word.replace(/^["'“‘([{¿¡*_]+/, '').replace(/[.,;:!?"'”’)\]}…*_]+$/, '')

/** The Reader's beats for `runs`: the pacer's, with symbols and code blocks in their own forms. */
export function play(runs: Run[], options: PaceOptions = {}): PacedBeat[] {
  const beats = pace(runs, options)
  // What a reference word holds at this beat: the pacer's hold without what its length bought.
  const word = (beat: PacedBeat) => beat.ms / lengthShare(beat)
  const out: PacedBeat[] = []
  for (const beat of beats) {
    if (beat.kind === 'code') {
      const last = out.at(-1)
      if (last?.form === 'block' && last.run === beat.run) continue
      // A long block plays as successive plates, each its share of the hold, the place line saying which lines.
      const plates = blockPlates((runs[beat.run]?.text ?? beat.text).replace(/\s+$/, ''))
      const cols = Math.max(...plates.flatMap(plate => plate.rows.map(row => row.length)))
      const rows = Math.max(...plates.map(plate => plate.rows.length))
      const place = runs[beat.run]?.place
      for (const [i, plate] of plates.entries()) {
        const mark = [place?.mark, plate.lines].filter(part => part !== undefined).join(' · ')
        const placed = { ...place, ...(mark === '' ? {} : { mark }) }
        const hold = (i === 0 ? BLOCK_LEAD_WORDS : 0) + BLOCK_LINE_WORDS * plate.rows.length
        out.push({ ...beat, text: plate.rows.join('\n'), form: 'block', pivot: 0, cols, rows, ms: Math.round(word(beat) * hold), ...(Object.keys(placed).length === 0 ? {} : { place: placed }) })
      }
      continue
    }
    if (beat.kind === 'prose' && isSymbol(beat.text)) {
      const lines = symbolRows(beat.text).length
      out.push({ ...beat, form: 'symbol', ms: Math.round(word(beat) * (SYMBOL_WORDS + SYMBOL_LINE_WORDS * (lines - 1))) })
      continue
    }
    // One word at a time, punctuation separates nothing: it is not drawn. The
    // pacer has already read it for its pauses. A beat that was punctuation
    // alone gives its time to the word before it.
    const text = beat.kind === 'prose' ? unpunctuated(beat.text) : beat.text
    if (text === '') {
      const last = out.at(-1)
      if (last !== undefined) last.ms += beat.ms
      continue
    }
    out.push({ ...beat, text })
  }
  // Each beat keeps its run's place in the layout, for the picture to draw above it (#112).
  return out.map(beat => {
    const place = runs[beat.run]?.place
    return place === undefined || beat.place !== undefined ? beat : { ...beat, place }
  })
}

/**
 * How many characters of a symbol one line of the picture holds at its base
 * size: the panel less its margins, over a monospace glyph (picture.ts).
 */
export const SYMBOL_LINE_CHARS = 15

/** How many characters a line of a wrapped symbol holds, at the smaller size two lines draw at. */
const SYMBOL_WRAPPED_CHARS = 19
/** A symbol longer than a line wraps onto the next rather than shrink (the owner, 2026-10-17). */
const SYMBOL_SHRINK = 1
/** The most lines a symbol wraps onto; past them its lines widen and its type shrinks. */
export const SYMBOL_MAX_LINES = 3

/**
 * The lines a symbol is drawn on, the sentence's quotes, brackets and
 * punctuation around it left off: one when it fits, else wrapped after its joints onto
 * up to SYMBOL_MAX_LINES. The hold and the picture both count these.
 */
export function symbolRows(text: string): string[] {
  const name = bare(text) || text
  if (name.length <= SYMBOL_LINE_CHARS * SYMBOL_SHRINK) return [name]
  // Two lines draw smaller than one, so a line holds up to 19 characters, but
  // never so many that a name too long for one line packs back onto one.
  const lines = symbolLines(name, Math.min(SYMBOL_WRAPPED_CHARS, Math.ceil(name.length / 2) + 4))
  return lines.length <= SYMBOL_MAX_LINES ? lines : symbolLines(name, Math.ceil(name.length / SYMBOL_MAX_LINES) + 4)
}

/**
 * A symbol broken onto lines of at most `width` characters before its joints
 * (`- / _ @ . : #`), so a line never ends in a hyphen that reads as a word
 * hyphenated; mid-run only where a run is longer than a line. The lines are
 * drawn together, in one frame.
 */
export function symbolLines(text: string, width: number): string[] {
  const parts = text.match(/[-/_@.:#]*[^-/_@.:#]+|[-/_@.:#]+/g) ?? [text]
  // A file's extension stays with its name: `reader` / `-record.mts`, never `reader-record` / `.mts`.
  if (parts.length > 1 && /^\.\w{1,6}$/.test(parts.at(-1)!)) parts.splice(-2, 2, parts.at(-2)! + parts.at(-1)!)
  const lines: string[] = []
  for (let part of parts) {
    while (part.length > width) {
      lines.push(part.slice(0, width))
      part = part.slice(width)
    }
    if (part === '') continue
    const last = lines.at(-1)
    if (last !== undefined && last.length + part.length <= width) lines[lines.length - 1] = last + part
    else lines.push(part)
  }
  return lines.length > 0 ? lines : [text]
}

/** The most characters of code one row of a plate holds before it wraps: what the rail's width holds at the plate's type, which its height sets (the design review, #112). */
export const BLOCK_LINE_CHARS = 46
/**
 * The most rows one plate draws: six fit under the place line and over the
 * rail at about 12pt on the desktop (the design review, #112). A longer
 * block plays as successive plates.
 */
export const BLOCK_MAX_LINES = 6
/** The most plates one block plays; past them the last row counts the rest, so a long tool output cannot hold the read for minutes. */
export const BLOCK_MAX_PLATES = 4

/** What starts a wrapped line's continuation row; the picture draws it quiet, so it never reads as the code's own indent. */
export const CONTINUED = '↳ '

/** One source line's rows: itself, or wrapped when longer than BLOCK_LINE_CHARS. */
function lineRows(line: string): string[] {
  return wrapLine(line.replace(/\t/g, '  '), BLOCK_LINE_CHARS)
}

/** The rows one plate draws: at most BLOCK_MAX_LINES, the last counting the rest. */
export function blockRows(text: string): string[] {
  const all = text.split('\n').flatMap(lineRows)
  return all.length > BLOCK_MAX_LINES ? [...all.slice(0, BLOCK_MAX_LINES - 1), `… ${all.length - BLOCK_MAX_LINES + 1} more lines`] : all
}

/**
 * A code block as the plates it plays on: whole source lines, as many as fit
 * BLOCK_MAX_LINES rows, so no plate splits a line unless that one line is
 * longer than a plate. With more than one plate, each names the source lines
 * it shows ("lines 4–6 of 8"). Past BLOCK_MAX_PLATES the last row counts the
 * source lines left (the design review, #112).
 */
export function blockPlates(text: string): { rows: string[]; lines?: string }[] {
  const source = text.split('\n').map(lineRows)
  if (source.flat().length <= BLOCK_MAX_LINES) return [{ rows: source.flat() }]
  const n = source.length
  const plates: { rows: string[]; first: number; last: number }[] = []
  let rows: string[] = []
  let first = 0
  source.forEach((own, i) => {
    if (rows.length > 0 && rows.length + own.length > BLOCK_MAX_LINES) {
      plates.push({ rows, first, last: i - 1 })
      rows = []
    }
    // A line longer than a plate fills plates of its own, and its rest starts the next.
    let rest = own
    while (rest.length > BLOCK_MAX_LINES) {
      plates.push({ rows: rest.slice(0, BLOCK_MAX_LINES), first: i, last: i })
      rest = rest.slice(BLOCK_MAX_LINES)
    }
    if (rows.length === 0) first = i
    rows.push(...rest)
  })
  if (rows.length > 0) plates.push({ rows, first, last: n - 1 })
  const kept = plates.slice(0, BLOCK_MAX_PLATES)
  if (plates.length > BLOCK_MAX_PLATES) {
    const end = kept.at(-1)!
    // The last kept plate gives its last whole line, or its last row, to the count of what is left.
    if (end.rows.length >= BLOCK_MAX_LINES) {
      const own = source[end.last]!.length
      const isWhole = end.last > end.first && end.rows.length - own >= 1
      end.rows = isWhole ? end.rows.slice(0, end.rows.length - own) : end.rows.slice(0, BLOCK_MAX_LINES - 1)
      if (isWhole) end.last -= 1
    }
    end.rows = [...end.rows, `… ${n - end.last - 1} more lines`]
  }
  return kept.map(plate => ({ rows: plate.rows, lines: plate.first === plate.last ? `line ${plate.first + 1} of ${n}` : `lines ${plate.first + 1}–${plate.last + 1} of ${n}` }))
}

/**
 * A line cut into rows of at most `most`: at the last space past a third of
 * the row, else after the last `/`, `-` or `=` there, so a path or flag is
 * never cut mid-name; a hard cut only when none is found.
 */
function wrapLine(line: string, most: number): string[] {
  const out: string[] = []
  let rest = line
  while (rest.length > most) {
    const space = rest.lastIndexOf(' ', most)
    // A slash first, as a path's own joint, then a hyphen or equals sign.
    const slash = rest.lastIndexOf('/', most - 1) + 1
    const joint = Math.max(rest.lastIndexOf('-', most - 1), rest.lastIndexOf('=', most - 1)) + 1
    const cut = space > most / 3 ? space : slash > most / 3 ? slash : joint > most / 3 ? joint : most
    out.push(rest.slice(0, cut))
    rest = CONTINUED + rest.slice(cut).trimStart()
  }
  return [...out, rest]
}
