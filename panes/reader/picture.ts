// The Reader's picture: one word at a time, hung by its pivot letter at the
// focal point, drawn as an Svg whose own animation holds each word for its
// beat. Interlace's word view (PortalViews.kt) sets the look: monospace ink,
// the pivot letter red, tick marks above and below the focal point, and a word
// shrunk only when it would leave the panel. The red anchor letter is RSVP
// itself and an invariant; only the shift to blue on dense prose is gone (the
// owner, 2026-10-28, #112). Above the word, a dim line says where it sits in
// the reply's layout.

import { esc } from '../svg.ts'
import { BLOCK_LINE_CHARS, BLOCK_MAX_LINES, blockRows, CONTINUED, SYMBOL_MAX_LINES, symbolRows } from './forms.ts'
import type { PacedBeat } from './pace.ts'

/**
 * The picture is always drawn this wide, wider than any band; the desktop caps
 * an Svg at the band's width and scales it down whole. So the Reader spans the
 * band at any width, its word keeps its size relative to the band, and a
 * change of width never changes the picture's source (which would restart its
 * animation mid-read).
 */
export const PICTURE_WIDTH = 1600

/** The picture's size and the word's base size for a picture `width` pixels wide. */
export function layout(width: number) {
  const w = Math.round(Math.max(width, 360))
  const size = Math.round(Math.max(w / 10, 32))
  const height = Math.round(size * 4)
  return {
    width: w,
    height,
    size,
    /** Left of centre, as Interlace's FOCAL_FRACTION: a word hangs mostly right of its pivot. */
    focal: Math.round(w * 0.4),
    margin: Math.round(w * 0.03),
    baseline: Math.round(height * 0.5 + size * 0.36),
  }
}
export type Layout = ReturnType<typeof layout>
export const LAYOUT = layout(PICTURE_WIDTH)

/** A monospace glyph's advance, in ems. */
const ADVANCE = 0.6
const FONT = `ui-monospace, 'SF Mono', Menlo, monospace`
/**
 * The most characters of one word the picture draws: a longer token (a hash, a
 * minified line) would only shrink past reading, so its tail gives way to an
 * ellipsis. Its beat still holds for the whole token.
 */
export const DRAWN_CHARS = 40

/** The most beats one picture animates. */
export const MAX_BEATS = 300
/** The most characters one picture's source may take: under the Svg's 131,072 with room to spare. */
export const MAX_SOURCE = 110_000
/** The picture's characters besides its words. */
const FRAME_CHARS = 1_200

/** The Reader's black: the picture and the band around it, so nothing else draws the eye. */
export const PANEL = '#111111'

const C = {
  panel: PANEL,
  ink: '#E4E2D8',
  /** The anchor letter: the fixation point every word hangs on, always red. */
  orp: '#D8483F',
  tick: '#3A3F44',
  /** signal.ts's QUIET: the dimmest text that still reads on the panel. */
  cue: '#898781',
  /** The plate a symbol or a code block sits on, and its edge: signal.ts's FILL and CARD_LINE. */
  plate: '#20201f',
  plateLine: '#2a2a2a',
  track: '#262626',
  progress: '#5b5a56',
}

const isLow = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff

/** Where the progress rail runs, near the panel's foot. */
const rail = (at: Layout) => at.height - Math.max(10, Math.round(at.height * 0.08))

/** Where the ticks stand: their length, their distance from the middle, the middle, and a line's width. */
function marks(at: Layout) {
  // Lines stay a hair's width once the desktop scales the picture down to the band.
  return { tick: Math.round(at.size * 0.3), gap: Math.round(at.size * 0.95), mid: Math.round(at.height * 0.5), line: Math.max(2, Math.round(at.width / 400)) }
}

/** One beat's picture: a word, a symbol, or a code block, under the line that places it. */
export function word(beat: PacedBeat, at: Layout, widest = beat.place?.mark?.length ?? 0): string {
  return placeLine(beat, at, widest) + (beat.form === 'block' ? block(beat, at) : beat.form === 'symbol' ? symbol(beat.text, at) : plain(beat, at))
}

/**
 * Where the word sits, on one line at the panel's top left, clear above the
 * tick: the section's heading quiet, then the item, quote or table row a step
 * brighter, as a screen would have shown them (#112). The line keeps within
 * the rail's width, cutting the section first so the mark stays whole.
 * Nothing when the word sits in plain prose outside any section.
 */
function placeLine(beat: PacedBeat, at: Layout, widest: number): string {
  const place = beat.place
  if (place === undefined || (place.section === undefined && place.mark === undefined)) return ''
  const { size, y, most } = placeMetrics(at)
  const mark = place.mark === undefined ? '' : place.mark.slice(0, most)
  // The section is cut once for the widest mark it ever stands beside, at a word, so it holds still
  // while the marks change under it; the mark keeps to the rail's right end (the design review, #112).
  const section = place.section === undefined ? '' : wordsWithin(place.section, most - (widest > 0 ? Math.min(widest, most) + 3 : 0))
  const drawn = (x: number, anchor: string, fill: string, text: string) =>
    `<text x="${x}" y="${y}" font-size="${size}"${anchor} fill="${fill}" xml:space="preserve">${esc(text)}</text>`
  return (section === '' ? '' : drawn(at.margin, '', C.cue, section)) + (mark === '' ? '' : drawn(at.width - at.margin, ' text-anchor="end"', C.ink, mark))
}

/** The place line's type size, baseline and how many characters fit the rail's width. */
function placeMetrics(at: Layout) {
  const size = Math.round(at.size * 0.3)
  const { tick, gap, mid } = marks(at)
  // Clear of the tick, so the tick does not read as underlining a word of it, and as far from the panel's top as the controls are from its foot.
  return { size, y: Math.round(mid - gap - tick - 0.8 * size), most: Math.floor((at.width - 2 * at.margin) / (ADVANCE * size)) }
}

/** `text` as whole words within `room` characters, an ellipsis after a cut; nothing when no word fits. */
function wordsWithin(text: string, room: number): string {
  if (text.length <= room) return text
  let kept = ''
  for (const one of text.split(' ')) {
    const next = kept === '' ? one : `${kept} ${one}`
    if (next.length + 1 > room) break
    kept = next
  }
  // An ellipsis after a function word reads as broken, so the cut steps back past one.
  const words = kept.split(' ')
  while (words.length > 1 && FUNCTION_WORDS.has(words.at(-1)!.toLowerCase().replace(/[,;:]$/, ''))) words.pop()
  return kept === '' ? '' : `${words.join(' ').replace(/[,;:]$/, '')}…`
}

const FUNCTION_WORDS = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'to', 'on', 'in', 'for', 'with', 'at', 'by'])

type Widest = { sections: Map<string, number>; blocks: Map<number, number> }
const widestMarks = new WeakMap<readonly PacedBeat[], Widest>()

/**
 * The widest mark the section is cut for: across a section's words, and,
 * for a code plate, across its own block's plates alone. A plate replaces
 * the whole picture, so its own cut reads as part of that change, and its
 * long line counts never shorten the section over the words (the design
 * review, #112).
 */
function widestOf(beats: readonly PacedBeat[], beat: PacedBeat): number {
  let held = widestMarks.get(beats)
  if (held === undefined) {
    held = { sections: new Map(), blocks: new Map() }
    for (const one of beats) {
      const length = one.place?.mark?.length ?? 0
      const section = one.place?.section
      if (one.form === 'block') held.blocks.set(one.run, Math.max(held.blocks.get(one.run) ?? 0, length))
      else if (section !== undefined) held.sections.set(section, Math.max(held.sections.get(section) ?? 0, length))
    }
    widestMarks.set(beats, held)
  }
  const own = beat.place?.mark?.length ?? 0
  return (beat.form === 'block' ? held.blocks.get(beat.run) : held.sections.get(beat.place?.section ?? '')) ?? own
}

/** A plate's padding, in ems: the drawn plate is the text and this much on each side. */
const PAD = 0.35
const LINE_HEIGHT = 1.15

/** Lines of monospace text on a plate centred at `cx`; `size` already fits them. */
function plate(lines: string[], size: number, cx: number, at: Layout, fixed?: { left: number; top: number; cols: number; width?: number }): string {
  const pad = size * PAD
  const widest = fixed?.width !== undefined ? fixed.width - 2 * pad : Math.max(fixed?.cols ?? 0, ...lines.map(line => line.length), 1) * ADVANCE * size
  const x = fixed === undefined ? cx - widest / 2 : fixed.left + pad
  const top = fixed?.top ?? at.height / 2 - (lines.length * LINE_HEIGHT * size) / 2
  const edge = Math.max(2, Math.round(at.width / 800))
  // A wrapped line's continuation mark is quiet, so it never reads as the code's own indent.
  const text = (line: string) => (line.startsWith(CONTINUED) ? `<tspan fill="${C.cue}">${esc(CONTINUED)}</tspan>${esc(line.slice(CONTINUED.length))}` : esc(line))
  const rows = lines
    .map((line, i) => `<text x="${x.toFixed(1)}" y="${(top + LINE_HEIGHT * size * (i + 0.78)).toFixed(1)}" font-size="${size.toFixed(1)}" fill="${C.ink}" xml:space="preserve">${text(line)}</text>`)
    .join('')
  return `<g><rect x="${(x - pad).toFixed(1)}" y="${(top - pad).toFixed(1)}" width="${(widest + 2 * pad).toFixed(1)}" height="${(lines.length * LINE_HEIGHT * size + 2 * pad).toFixed(1)}" rx="${(size * 0.18).toFixed(1)}" fill="${C.plate}" stroke="${C.plateLine}" stroke-width="${edge}"/>${rows}</g>`
}

/** The largest size at which `lines` on a plate are at most `width` wide and `height` tall. */
function fitting(lines: string[], width: number, height: number, most: number): number {
  const widest = Math.max(...lines.map(line => line.length), 1)
  const size = Math.min(most, width / (widest * ADVANCE + 2 * PAD), height / (lines.length * LINE_HEIGHT + 2 * PAD))
  return Math.floor(size * 10) / 10
}

/** A symbol's type, as a share of a word's: a step down, so the plate does not outweigh the words. */
const SYMBOL_SCALE = 0.75

/**
 * A symbol, whole in its one frame, on the lines `symbolRows` gives it. Its
 * plate is centred on the focal point, where the eye already rests, and
 * stays between the ticks, so the anchor shows in every frame. No pivot: it
 * is read as one shape, not letter by letter.
 */
function symbol(text: string, at: Layout): string {
  const lines = symbolRows(text.length > DRAWN_CHARS * SYMBOL_MAX_LINES ? `${text.slice(0, DRAWN_CHARS * SYMBOL_MAX_LINES - 1)}…` : text)
  const half = Math.min(at.focal - at.margin, at.width - at.margin - at.focal)
  const between = 2 * Math.round(at.size * 0.95) - Math.round(at.size * 0.12)
  return plate(lines, fitting(lines, 2 * half, between, at.size * SYMBOL_SCALE), at.focal, at)
}

/**
 * A code plate, between the place line and the rail, on the place line's
 * left edge. Every plate draws at one size, its top where a full plate's
 * would be and as wide as its block's widest row, so the plates of one block
 * play as one frame that turns its page rather than one that moves (the
 * design review, #112). It is read as a whole, not from the focal point, so
 * the ticks give way for it rather than stray over the plate.
 */
function block(beat: PacedBeat, at: Layout): string {
  const lines = blockRows(beat.text)
  const room = at.width - 2 * at.margin
  const full = Array.from({ length: BLOCK_MAX_LINES }, () => 'x'.repeat(BLOCK_LINE_CHARS))
  const size = fitting(full, room, at.height * 0.62, at.size * 0.6)
  // The block's tallest plate is centred between the place line's descenders and the rail; its shorter plates keep that top.
  const place = placeMetrics(at)
  const between = (place.y + place.size * 0.25 + rail(at)) / 2
  const top = between - ((beat.rows ?? lines.length) * LINE_HEIGHT * size) / 2
  const { tick, gap, mid, line } = marks(at)
  // A pixel wider than the tick all round, so no anti-aliased edge of it shows.
  const hide = (y: number) => `<rect x="${at.focal - line / 2 - 1}" y="${y - 1}" width="${line + 2}" height="${tick + 2}" fill="${C.panel}"/>`
  // A block that wraps runs to the rail's end, sharing its right edge with the mark rather than stopping just short of it.
  const cols = beat.cols ?? 0
  return hide(mid - gap - tick) + hide(mid + gap) + plate(lines, size, 0, at, { left: at.margin, top, cols, ...(cols >= BLOCK_LINE_CHARS - 2 ? { width: room } : {}) })
}

/**
 * One word, hung by its pivot at the focal point. A hyphenated word too long
 * for the panel breaks at the hyphen nearest its middle onto two lines
 * between the ticks, the pivot on the first, rather than shrink (the owner,
 * 2026-10-17): it is prose, so it gets no plate.
 */
function plain(beat: PacedBeat, at: Layout): string {
  const text = beat.text.length > DRAWN_CHARS ? `${beat.text.slice(0, DRAWN_CHARS - 1)}…` : beat.text
  const hyphens = [...text.matchAll(/(?<=\p{L})-(?=\p{L})/gu)].map(m => m.index! + 1)
  const oneLine = fitSize(text, beat.pivot, at)
  if (hyphens.length > 0 && oneLine < at.size) {
    const cut = hyphens.reduce((best, i) => (Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2) ? i : best))
    // Split only where two lines draw larger than one line shrunk would.
    if (beat.pivot < cut && twoLineSize(beat.pivot, text.slice(0, cut), text.slice(cut), at) > oneLine) return twoLines(beat, text.slice(0, cut), text.slice(cut), at)
  }
  let pivot = Math.min(Math.max(beat.pivot, 0), Math.max(text.length - 1, 0))
  // A pivot inside a character drawn from two code units (an emoji) moves to its start.
  if (pivot > 0 && isLow(text.charCodeAt(pivot))) pivot -= 1
  const span = (text.codePointAt(pivot) ?? 0) > 0xffff ? 2 : 1
  const before = text.slice(0, pivot)
  const letter = text.slice(pivot, pivot + span)
  const after = text.slice(pivot + span)
  const left = before.length + 0.5
  const right = after.length + 0.5
  // Rounded down, as drawn, so the word placed by it never passes the margin.
  const size = Math.floor(10 * Math.min(at.size, (at.focal - at.margin) / (left * ADVANCE), (at.width - at.focal - at.margin) / (right * ADVANCE))) / 10
  const x = at.focal - left * ADVANCE * size
  const ink = beat.kind === 'cue' ? C.cue : C.ink
  const scaled = size < at.size ? ` font-size="${size.toFixed(1)}"` : ''
  // A heading's own words draw bold: the one trace of the screen's type that plays.
  const weight = beat.place?.heading ? ' font-weight="700"' : ''
  return `<text x="${x.toFixed(1)}" y="${at.baseline}"${scaled}${weight} fill="${ink}">${esc(before)}<tspan fill="${C.orp}">${esc(letter)}</tspan>${esc(after)}</text>`
}

/** The size a word hung by `pivot` fits the panel at. */
function fitSize(text: string, pivot: number, at: Layout): number {
  const left = pivot + 0.5
  const right = text.length - pivot - 0.5
  return Math.floor(10 * Math.min(at.size, (at.focal - at.margin) / (left * ADVANCE), (at.width - at.focal - at.margin) / (right * ADVANCE))) / 10
}

/** The size a word on two lines between the ticks draws at, hung by `pivot` on the first. */
function twoLineSize(pivot: number, first: string, second: string, at: Layout): number {
  const between = 2 * Math.round(at.size * 0.95) - Math.round(at.size * 0.12)
  return Math.min(fitSize(first, pivot, at), fitSize(second.padStart(second.length + pivot, ' '), pivot, at), Math.floor((10 * between) / (2 * LINE_HEIGHT)) / 10)
}

/** A word on two lines between the ticks, the first hung by its pivot, the second starting under it. */
function twoLines(beat: PacedBeat, first: string, second: string, at: Layout): string {
  const pivot = beat.pivot
  const size = twoLineSize(pivot, first, second, at)
  const x = at.focal - (pivot + 0.5) * ADVANCE * size
  const mid = at.height / 2
  const weight = beat.place?.heading ? ' font-weight="700"' : ''
  const top = (mid - LINE_HEIGHT * size * 0.5 + size * 0.36).toFixed(1)
  const bottom = (mid + LINE_HEIGHT * size * 0.5 + size * 0.36).toFixed(1)
  return (
    `<text x="${x.toFixed(1)}" y="${top}" font-size="${size.toFixed(1)}"${weight} fill="${C.ink}">${esc(first.slice(0, pivot))}<tspan fill="${C.orp}">${esc(first.slice(pivot, pivot + 1))}</tspan>${esc(first.slice(pivot + 1))}</text>` +
    `<text x="${x.toFixed(1)}" y="${bottom}" font-size="${size.toFixed(1)}"${weight} fill="${C.ink}">${esc(second)}</text>`
  )
}

/** One beat in a playing picture: its word, shown from `begin` for its hold. */
function shown(beat: PacedBeat, begin: number, isLast: boolean, at: Layout, widest?: number): string {
  const hold = isLast ? ' fill="freeze"' : ''
  return `<g visibility="hidden"><set attributeName="visibility" to="visible" begin="${begin}ms" dur="${beat.ms}ms"${hold}/>${word(beat, at, widest)}</g>`
}

/**
 * One past the last beat of the picture that starts at `from`: at most
 * MAX_BEATS, and never more than one Svg can hold, however long the words.
 */
export function chunkEnd(beats: readonly PacedBeat[], from: number, at: Layout = LAYOUT): number {
  let size = FRAME_CHARS
  let to = from
  while (to < beats.length && to - from < MAX_BEATS) {
    const beat = beats[to]
    if (beat === undefined) break
    size += shown(beat, 999_999_999, true, at).length
    if (size > MAX_SOURCE && to > from) break
    to += 1
  }
  return Math.max(to, Math.min(from + 1, beats.length))
}

/**
 * The picture for beats `from` to `to`: playing, each word shows for its
 * beat from the moment the picture loads and the last one stays; held, only
 * the word at `from`. `done` and `total` place the progress line.
 */
export function picture(beats: readonly PacedBeat[], from: number, to: number, playing: boolean, done: number, total: number, at: Layout = LAYOUT): string {
  const { width, height, size, focal, margin } = at
  const track = width - 2 * margin
  const fraction = (ms: number) => (total <= 0 ? 0 : Math.min(1, ms / total))
  let words = ''
  let span = 0
  const widest = (beat: PacedBeat) => widestOf(beats, beat)
  if (!playing) {
    const beat = beats[from]
    words = beat === undefined ? '' : word(beat, at, widest(beat))
  } else {
    for (let i = from; i < to; i++) {
      const beat = beats[i]
      if (beat === undefined) continue
      words += shown(beat, span, i === to - 1, at, widest(beat))
      span += beat.ms
    }
  }
  const startWidth = (track * fraction(done)).toFixed(1)
  const endWidth = (track * fraction(done + span)).toFixed(1)
  const grow = playing && span > 0 ? `<animate attributeName="width" from="${startWidth}" to="${endWidth}" dur="${span}ms" fill="freeze"/>` : ''
  const { tick, gap, mid, line } = marks(at)
  const y = rail(at)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}" font-size="${size}">` +
    `<rect width="${width}" height="${height}" fill="${C.panel}"/>` +
    `<rect x="${focal - line / 2}" y="${mid - gap - tick}" width="${line}" height="${tick}" fill="${C.tick}"/>` +
    `<rect x="${focal - line / 2}" y="${mid + gap}" width="${line}" height="${tick}" fill="${C.tick}"/>` +
    `<rect x="${margin}" y="${y}" width="${track}" height="${line}" rx="${line / 2}" fill="${C.track}"/>` +
    `<rect x="${margin}" y="${y}" width="${startWidth}" height="${line}" rx="${line / 2}" fill="${C.progress}">${grow}</rect>` +
    words +
    `</svg>`
  )
}
