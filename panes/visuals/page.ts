// The context page (#102): an ask item drawn as one page of many tiles, as
// gain-function's Graphite canvas composes its scene. Jev scores every tile the
// item's facts admit; here the scores become groups (the primary tile, its
// supports, the detail), each group a size, and the tiles pack into rows under
// the page's height, detail yielding first. The question and the answers frame
// the page and are never packed away, and each of the four questions (what, how,
// why, so what) gets its best tile before the rest. Pure.

import { pageRefusals, sizesOf, TECHNIQUES, type Technique, type TileSize } from './catalog.ts'
import type { Plan, Ranked, Surface } from './compose.ts'
import { WHY } from './plans.ts'
import { ANSWERS_QUESTION, QUESTIONS, type Question } from './facts.ts'

/** A tile is drawn only when Jev's score for it is above this; the priors alone all clear it. A starting value. */
export const TILE_MIN_SCORE = 0.15
/** A tile scoring at least this share of the best tile's score supports it; below, it is detail. A starting value. */
export const SUPPORT_SHARE = 0.6
/** A page draws at most this many tiles: a page that holds everything compresses nothing (the owner, 2026-10-24). */
export const MAX_TILES = 5
/** Of them, at most this many are sentences in a frame; the rest are pictures. */
export const MAX_TEXT_TILES = 2
/** A queue card draws at most two pictures, its embedded images among them, and at most one of them sentences (the owner, 2026-10-26, #105). */
export const CARD_CAP: Cap = { tiles: 2, text: 1 }

/** How many tiles a page may draw, and how many of them sentences in a frame. */
export type Cap = { tiles: number; text: number }

export type Group = 'primary' | 'support' | 'detail'
export type Tile = { view: string; size: TileSize; group: Group; score: number }
/** A row of the page: one wide tile, or one or two half tiles. */
export type Row = readonly Tile[]
export type Page = {
  rows: Row[]
  /** The answers view, drawn wide under the tiles. */
  answers: string
  /** The tiles that scored but found no room, best first: what a taller pane would show. */
  held: string[]
}

/**
 * About how many rows a tile takes at a size, or null when it would not draw
 * whole there (a label cut short misleads). The page's caller measures; the
 * composer only packs.
 */
export type Measure = (view: string, size: TileSize) => number | null

const byId = new Map(TECHNIQUES.map(one => [one.id, one]))
const technique = (id: string): Technique => byId.get(id)!
/** A tile drawn as sentences in a frame rather than a picture. */
const isText = (id: string) => !technique(id).elements.includes('Svg')

/**
 * The views less every sentence form of a fact a picture of it can draw whole:
 * the picture carries the same facts in less room, so it wins however the two
 * scored (the owner, 2026-10-24: the list kept beating the picture).
 */
function picturesFirst(views: readonly Ranked[], measure: Measure): Ranked[] {
  const whole = (id: string) => sizesOf(technique(id)).some(size => measure(id, size) !== null)
  const pictured = new Set(views.filter(one => !isText(one.view) && whole(one.view)).map(one => technique(one.view).reads))
  return views.filter(one => !isText(one.view) || !pictured.has(technique(one.view).reads))
}

/** A row of two halves stands as tall as its taller tile. */
const rowHeight = (row: Row, measure: Measure) => Math.max(...row.map(one => measure(one.view, one.size) ?? Infinity))

/**
 * The page a surface draws from a plan: every tile above TILE_MIN_SCORE that the
 * page's rules admit, best first, the best one primary and wide where it can be,
 * the rest half where they draw whole, packed into rows while the rows fit
 * `budget`. A tile that does not fit tries its other size, then waits in `held`.
 */
export function page(p: Plan, surface: Surface, measure: Measure, budget = Infinity, given: readonly Question[] = [], cap: Cap = { tiles: MAX_TILES, text: MAX_TEXT_TILES }): Page {
  const answers = p.answers.find(id => technique(id).surfaces.includes(surface)) ?? 'answers'
  const drawable = picturesFirst(p.views.filter(one => technique(one.view).surfaces.includes(surface)), measure)
  // Each of the four questions gets its best tile first, whatever its score, so no question goes unanswered
  // for want of room (the owner, 2026-10-23); the rest then fill by score.
  const questionOf = (view: string) => {
    const reads = technique(view).reads
    return reads === null ? undefined : ANSWERS_QUESTION[reads]
  }
  const reserved = QUESTIONS.filter(q => !given.includes(q)).flatMap(q => {
    const best = drawable.find(one => questionOf(one.view) === q && measure(one.view, 'wide') !== null)
    return best === undefined ? [] : [best]
  })
  const scored = [...reserved.sort((a, b) => b.score - a.score), ...drawable.filter(one => one.score > TILE_MIN_SCORE && !reserved.includes(one))]
  const top = scored[0]?.score ?? 0
  const rows: Tile[][] = []
  const held: string[] = []
  const chosen: string[] = []
  // The budget counts only the tiles the card draws: it draws no answers (#105), so their height holds no room (the owner, 2026-10-28).
  const height = () => rows.reduce((sum, row) => sum + rowHeight(row, measure), 0)
  // A tile past the caps is never drawn, not held for a taller pane: the page compresses, it does not collect.
  const capped = (view: string) => chosen.length >= cap.tiles || (isText(view) && chosen.filter(isText).length >= cap.text)
  for (const one of scored) {
    if (capped(one.view) || pageRefusals([...chosen, one.view, answers], surface).length > 0) continue
    const group: Group = chosen.length === 0 ? 'primary' : one.score >= top * SUPPORT_SHARE ? 'support' : 'detail'
    const placed = place(rows, one, group, measure, () => height() <= budget)
    if (placed) chosen.push(one.view)
    else held.push(one.view)
  }
  const fits = () => height() <= budget
  widenLone(rows, measure, fits)
  // A lone half that widened gave back rows, so a tile held for want of them gets a second try.
  for (const view of [...held]) {
    const one = scored.find(r => r.view === view)!
    if (capped(view) || pageRefusals([...chosen, view, answers], surface).length > 0) continue
    const group: Group = one.score >= top * SUPPORT_SHARE ? 'support' : 'detail'
    if (!place(rows, one, group, measure, fits)) continue
    chosen.push(view)
    held.splice(held.indexOf(view), 1)
    widenLone(rows, measure, fits)
  }
  return { rows, answers, held }
}

/**
 * The sizes a tile tries, best first: as narrow as it draws whole, the primary
 * included. A picture stretched to the page's width spends it on empty space
 * (the owner, 2026-10-24), so width goes to what fills it.
 */
function tries(one: Ranked): TileSize[] {
  return [...sizesOf(technique(one.view))].sort((a, b) => (a === 'half' ? -1 : 0) - (b === 'half' ? -1 : 0))
}

/** Places a tile in the first size that draws whole and fits: a half beside an open half, else a row of its own. */
function place(rows: Tile[][], one: Ranked, group: Group, measure: Measure, fits: () => boolean): boolean {
  for (const size of tries(one)) {
    if (measure(one.view, size) === null) continue
    const tile: Tile = { view: one.view, size, group, score: one.score }
    const open = size === 'half' ? rows.find(row => row.length === 1 && row[0]!.size === 'half') : undefined
    if (open) open.push(tile)
    else rows.push([tile])
    if (fits()) return true
    if (open) open.pop()
    else rows.pop()
  }
  return false
}

/** A half text tile left alone in its row takes the whole row where it still fits: its lines wrap less. A picture keeps its size. */
function widenLone(rows: Tile[][], measure: Measure, fits: () => boolean): void {
  for (const row of rows) {
    const lone = row.length === 1 ? row[0]! : null
    if (lone === null || lone.size !== 'half' || !isText(lone.view) || !sizesOf(technique(lone.view)).includes('wide') || measure(lone.view, 'wide') === null) continue
    row[0] = { ...lone, size: 'wide' }
    if (!fits()) row[0] = lone
  }
}

/** The page in one dim line, for the hover under it: each tile and its score, and what waited for room. */
export function explainPage(p: Plan, pg: Page): string {
  const tiles = pg.rows.flat().map(one => `${one.view} ${one.score.toFixed(2)}`)
  const why = p.source === 'jev' ? 'scored by Jev' : `ranked by prior (${WHY[p.why ?? ''] ?? p.why})`
  return `${tiles.length === 0 ? 'no tiles' : tiles.join(' · ')}${pg.held.length === 0 ? '' : ` · no room: ${pg.held.join(', ')}`} · ${why}`
}
