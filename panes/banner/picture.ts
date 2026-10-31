// The session banner's picture (issue 119, ADR 0046): this session's files as dots sized by the
// lines they changed, each labelled with its name and the lines it gained and lost, linked to the
// ADR it answers to most strongly, each ADR a white diamond, the flowchart's decision, filled once
// Accepted and hollow while Proposed. The file edited last has the one blue dot in a blue ring, the
// agent's colour; older files fade with their age, as Obsidian's graph banner fades its notes. Pure:
// the band hands it the edits, the ADRs and the places it last drew.

import { esc, sfWidth } from '../svg.ts'
import { DESKTOP_CELL_PT, shortTitle } from '../band/title.ts'
import { BAND, INACTIVE, QUIET, RECOMMENDED, SIGNAL_BLUE, SIGNAL_RED, TEXT } from '../../hooks/signal.ts'
import { BAND_PT } from '../../hooks/steps.ts'
import { recent, type Edited } from './edits.ts'
import { ADR_LABEL_GAP, DESCENT, EDGE, FILE_LABEL_DY, place, samePlaces, type NodeKind, type Placed, type Spec } from './layout.ts'

/**
 * The ADR a file answers to, as the band holds it: its number and words as its file name writes
 * them, its title, and whether it is Accepted. A session's state from before holds neither of the
 * last two: its label falls back to the title, its diamond to hollow.
 */
export type Governing = { n: number; key: string; slug?: string; title: string; accepted?: boolean }

/** A node as drawn: where it stands and what its label says. */
export type Node = { id: string; kind: NodeKind; label: string; x: number; y: number }

export type Banner = { svg: string; width: number; height: number; alt: string; nodes: Node[]; placed: Placed }

/** The most files the strip draws: the ones edited last. */
export const MOST_FILES = 10
/**
 * The strip's height: the approved replay's 150 at least, so its trees hang at their own depths,
 * taller a band row at a time while a file has no clean spot, and never shorter than it last drew.
 * The band scrolls to hold it, which the owner accepted.
 */
export const HEIGHT = { least: 150, most: 330 }
const SIZE = 11.5
/** An ADR's diamond, half its width across: one size, since its files' scale is theirs. */
export const ADR_R = 5
/** A file's dot: one line changed draws the least, 400 or more the most, by the square root between. */
const FILE_R = { least: 2.5, most: 6, lines: 400 }
/** The latest file's ring: the diamond's size round a small dot, a little wider than a large one. */
const RING = { least: ADR_R, clear: 2, stroke: 1.2 }
/**
 * How far an older file fades: its dot, its label where grey still reads at 3:1 on the band, and its
 * link, drawn in the label's grey since the composer's rest line reads at 1.25:1 on the band: at
 * 0.6 it still reads at 2.4:1.
 */
const FADE = { mark: 0.35, label: 0.75, link: 0.6 }
const FONT = 'font-family="-apple-system, system-ui, sans-serif"'
/** The space between a name and its counts, and between the counts, as the replay drew them. */
const NAME_GAP = 6
const COUNT_GAP = 4

/**
 * The strip's width in pixels for a band `bodyColumns` wide: the band's columns less its padding,
 * a cell each side, so the strip runs from the label column to the pills' trailing edge. Drawn at
 * a fixed size, so a label keeps its type size; the desktop scales a wider picture down whole.
 */
export const bannerWidth = (bodyColumns: number) => Math.max(320, Math.round((bodyColumns - 2) * DESKTOP_CELL_PT))

/** A row the band draws under the strip: one with a pill (the agent, subagents and you rows, a reply's headline), or a line of text. */
export type BandRow = 'pill' | 'text'
/** The band the strip heads: its `maxRows`, and the rows under the strip, top first. */
export type Band = { maxRows: number; rows: readonly BandRow[] }
/**
 * The band under the strip as the desktop drew it (a 1x shot of 0.190.0 with 12 rows, issue 119):
 * the strip starts 9.5pt down the band's window, the first row's middle stands 29.5pt under the
 * strip, a pill is 28pt tall, and a line's text about 16.
 */
const UNDER = { top: 9.5, first: 29.5, pill: 14, text: 8 }
/** What the agent row keeps between its pill and the band window's edge when the strip is as tall as it may be. */
const AGENT_ROW_CLEAR = 4

/**
 * The strip's height, `atLeast` or up to a band row taller, that puts the bottom edge of the band's
 * window (`maxRows` rows of about 21.5pt) furthest from any row's ink: in the middle of the gap
 * between the last row it shows whole and the first it hides, so no sliver of a pill shows under it.
 * `atLeast` itself when every row shows, or the window ends inside the strip.
 */
export function stripHeight(atLeast: number, { maxRows, rows }: Band): number {
  const window = maxRows * BAND_PT.row
  const pitch = (row: BandRow) => (row === 'pill' ? BAND_PT.pillRow : BAND_PT.text)
  // The strip's own ink first, then each row's.
  const inks = (h: number) => {
    let middle = UNDER.top + h + UNDER.first
    return [
      [UNDER.top, UNDER.top + h] as const,
      ...rows.map((row, i) => {
        if (i > 0) middle += (pitch(rows[i - 1] as BandRow) + pitch(row)) / 2
        const half = row === 'pill' ? UNDER.pill : UNDER.text
        return [middle - half, middle + half] as const
      }),
    ]
  }
  const clearance = (h: number) => Math.min(...inks(h).map(([top, bottom]) => (top < window && bottom > window ? -1 : Math.min(Math.abs(window - top), Math.abs(window - bottom)))))
  const least = Math.ceil(atLeast)
  if (rows.length === 0 || window <= UNDER.top + least || (inks(least).at(-1)?.[1] ?? 0) <= window) return least
  let best = least
  for (let h = least + 1; h < least + BAND_PT.pillRow; h += 1) if (clearance(h) > clearance(best)) best = h
  return best
}

const baseName = (path: string) => path.split('/').pop() ?? path
const adrId = (n: number) => `adr:${n}`

/** A file's dot radius for the lines it gained and lost: the square root of their sum, from 2.5 at one line to 6 at 400 and past. */
export function fileRadius(lines: number): number {
  const t = (Math.sqrt(Math.max(1, lines)) - 1) / (Math.sqrt(FILE_R.lines) - 1)
  return Math.round((FILE_R.least + (FILE_R.most - FILE_R.least) * Math.min(1, t)) * 10) / 10
}

/** The opacity of the file `rank` places from the newest of `count` drawn: the newest whole, the oldest at `floor`. */
export function fade(rank: number, count: number, floor: number): number {
  return count <= 1 ? 1 : Math.round((1 - ((1 - floor) * rank) / (count - 1)) * 100) / 100
}
const opacity = (alpha: number) => (alpha === 1 ? '' : ` opacity="${alpha}"`)

/** An ADR's diamond at (x, y): filled once Accepted, outlined while Proposed, and never faded, which would read as a third state. */
export function diamond(x: number, y: number, accepted: boolean): string {
  // The outline runs inside the filled one's edge, so both kinds stand the same size.
  const r = accepted ? ADR_R : ADR_R - 0.6
  const d = `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`
  return accepted
    ? `<path d="${d}" fill="${TEXT}"/>`
    : `<path d="${d}" fill="${BAND}" stroke="${TEXT}" stroke-width="1.2" stroke-linejoin="round"/>`
}

/** A file's counts, a zero left out: `+56 −36`, `+236`, `−4`, or nothing. */
export function countsOf(edit: Pick<Edited, 'added' | 'removed'>): { added: string | null; removed: string | null } {
  return { added: edit.added === 0 ? null : `+${edit.added}`, removed: edit.removed === 0 ? null : `−${edit.removed}` }
}

/** A file's whole label as text: `page.ts +56 −36`. */
export function fileLabel(edit: Edited): string {
  const { added, removed } = countsOf(edit)
  return [baseName(edit.path), added, removed].filter(part => part !== null).join(' ')
}

/**
 * An ADR's label: its number and its file name's words, `0037 two picture card`, which name the
 * decision in a few words where its title, cut to fit, lost the point. The title goes in the alt.
 */
export const adrLabel = (adr: Governing) => `${adr.key} ${adr.slug === undefined ? shortTitle(adr.title, 6, 34) : casedLike(adr.slug, adr.title)}`

/**
 * The slug's words as the title writes them, so acronyms and names keep their capitals:
 * `rsvp reader` under "The Reader is an RSVP speed reader" is `RSVP reader`. A word the title
 * also writes as the slug does keeps the slug's.
 */
function casedLike(slug: string, title: string): string {
  const written: string[] = title.match(/[\p{L}\p{N}]+/gu) ?? []
  return slug
    .split(' ')
    .map(word => (written.includes(word) ? word : written.find(one => one.toLowerCase() === word.toLowerCase()) ?? word))
    .join(' ')
}

function fileWidth(edit: Edited): number {
  const { added, removed } = countsOf(edit)
  return sfWidth(baseName(edit.path), SIZE) + (added === null ? 0 : NAME_GAP + sfWidth(added, SIZE)) + (removed === null ? 0 : (added === null ? NAME_GAP : COUNT_GAP) + sfWidth(removed, SIZE))
}

const text = (x: number, y: number, body: string, alpha: number) =>
  `<text x="${x}" y="${y}" ${FONT} font-size="${SIZE}" text-anchor="middle" stroke="${BAND}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"${opacity(alpha)}>${body}</text>`
const span = (fill: string, body: string, dx?: number) => `<tspan fill="${fill}"${dx === undefined ? '' : ` dx="${dx}"`} style="font-variant-numeric:tabular-nums">${esc(body)}</tspan>`

/**
 * The strip for this session's `edits`, `adrs` the ADR each path answers to (null: none; absent:
 * not read yet, so the file waits off the strip rather than move once its ADR is read), in a
 * picture `width` wide over `band`, starting from the places `prior` holds. Null before the first edit.
 */
export function banner(edits: readonly Edited[], adrs: Readonly<Record<string, Governing | null>>, prior: Placed | null, width: number, band: Band | null = null): Banner | null {
  const known = edits.filter(edit => adrs[edit.path] !== undefined)
  const shown = recent(known, MOST_FILES)
  const latest = shown[0]
  if (latest === undefined) return null
  // The ADRs in the order their first file was edited, so the first one placed stays the first.
  const governed = new Map<number, Governing>()
  for (const edit of [...shown].reverse()) {
    const adr = adrs[edit.path]
    if (adr !== undefined && adr !== null && !governed.has(adr.n)) governed.set(adr.n, adr)
  }
  const specs: Spec[] = [
    ...[...governed.values()].map((adr, rank) => ({ id: adrId(adr.n), kind: 'adr' as const, labelWidth: sfWidth(adrLabel(adr), SIZE), radius: ADR_R, link: null, rank })),
    ...shown.map((edit, rank) => {
      const adr = adrs[edit.path]
      // Cleared for the largest dot, so a file whose dot grows never has to move.
      return { id: edit.path, kind: 'file' as const, labelWidth: fileWidth(edit), radius: FILE_R.most, link: adr === undefined || adr === null ? null : adrId(adr.n), rank }
    }),
  ]
  // The agent row stays in the band's window however tall the strip grows: past that, files wait in the count.
  const tallest = band === null ? HEIGHT.most : Math.max(HEIGHT.least, Math.min(HEIGHT.most, Math.floor(band.maxRows * BAND_PT.row - UNDER.top - UNDER.first - UNDER.pill - AGENT_ROW_CLEAR)))
  const fit = (h: number) => (band === null ? h : Math.min(stripHeight(h, band), Math.max(tallest, Math.ceil(h))))
  // Once a file is left off the strip, the trailing bottom corner is kept for its count.
  const counted = sfWidth('+99 earlier', SIZE)
  const corner = known.length > MOST_FILES || (prior?.left.length ?? 0) > 0 ? counted : 0
  let placed = place(prior, specs, width, fit(Math.min(tallest, Math.max(HEIGHT.least, prior?.height ?? 0))), { corner, strict: true })
  // A file with no clean spot grows the strip, a band row at a time, to the least height that finds one
  // a spot; where none does, an older file of its tree gives its place up, or it waits off the strip.
  // A link never crosses a label.
  for (let h = fit(placed.height + BAND_PT.pillRow); placed.left.length > 0 && h <= tallest; h = fit(h + BAND_PT.pillRow)) {
    const taller = place(placed, specs, width, h, { corner, strict: true })
    if (taller.left.length < placed.left.length) placed = taller
  }
  if (placed.left.length > 0) placed = place(placed, specs, width, placed.height, { corner: counted, strict: false })
  // A redraw that places everything where it was hands back `prior` itself, so the band keeps nothing new.
  if (prior !== null && samePlaces(placed, prior)) placed = prior
  const { height } = placed
  const at = (id: string) => placed.at[id] as { x: number; y: number }
  // A file the tallest strip had no room for waits off the picture; an ADR shows while one of its files does,
  // its label as faded as the newest of them.
  const drawn = shown.filter(edit => placed.at[edit.path] !== undefined)
  const newest = new Map<number, number>()
  drawn.forEach((edit, rank) => {
    const n = adrs[edit.path]?.n
    if (n !== undefined && !newest.has(n)) newest.set(n, rank)
  })
  let links = ''
  let marks = ''
  const nodes: Node[] = []
  for (const adr of governed.values()) {
    const rank = newest.get(adr.n)
    if (rank === undefined || placed.at[adrId(adr.n)] === undefined) continue
    const { x, y } = at(adrId(adr.n))
    const label = adrLabel(adr)
    nodes.push({ id: adrId(adr.n), kind: 'adr', label, x, y })
    marks +=
      diamond(x, y, adr.accepted === true) +
      text(x, Math.round((y - ADR_R - ADR_LABEL_GAP) * 10) / 10, span(INACTIVE, label), fade(rank, drawn.length, FADE.label))
  }
  drawn.forEach((edit, rank) => {
    const { x, y } = at(edit.path)
    const adr = adrs[edit.path]
    const mark = opacity(fade(rank, drawn.length, FADE.mark))
    if (adr !== undefined && adr !== null && placed.at[adrId(adr.n)] !== undefined) {
      const a = at(adrId(adr.n))
      links += `<line x1="${a.x}" y1="${a.y}" x2="${x}" y2="${y}" stroke="${QUIET}" stroke-width="1"${opacity(fade(rank, drawn.length, FADE.link))}/>`
    }
    const { added, removed } = countsOf(edit)
    const r = fileRadius(edit.added + edit.removed)
    nodes.push({ id: edit.path, kind: 'file', label: fileLabel(edit), x, y })
    marks +=
      `<circle cx="${x}" cy="${y}" r="${r}" fill="${edit === latest ? SIGNAL_BLUE : QUIET}"${mark}/>` +
      (edit === latest ? `<circle cx="${x}" cy="${y}" r="${Math.max(RING.least, r + RING.clear)}" fill="none" stroke="${SIGNAL_BLUE}" stroke-width="${RING.stroke}"/>` : '') +
      text(
        x,
        y + FILE_LABEL_DY,
        span(QUIET, baseName(edit.path)) +
          (added === null ? '' : span(RECOMMENDED, added, NAME_GAP)) +
          (removed === null ? '' : span(SIGNAL_RED, removed, added === null ? NAME_GAP : COUNT_GAP)),
        fade(rank, drawn.length, FADE.label),
      )
  })
  const titles = [...governed.values()].filter(adr => nodes.some(node => node.id === adrId(adr.n))).map(adr => `${adr.key} ${adr.title}`)
  const answered = drawn.filter(edit => adrs[edit.path] != null).length
  const alt =
    `This session edited ${edits.length} file${edits.length === 1 ? '' : 's'}` +
    (titles.length === 0 ? '' : `, ${answered} of the ${drawn.length} shown under ${titles.length} ADR${titles.length === 1 ? '' : 's'}: ${titles.join('; ')}`)
  if (nodes.length === 0) return null
  // The files edited before the ones drawn leave a count, as the subagent rows do, in the corner kept for it.
  const earlier = known.length - drawn.length
  if (earlier > 0) marks += `<text x="${width}" y="${height - EDGE - DESCENT}" ${FONT} font-size="${SIZE}" text-anchor="end" fill="${QUIET}">+${earlier} earlier</text>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${links}${marks}</svg>`
  return { svg, width, height, alt, nodes, placed }
}
