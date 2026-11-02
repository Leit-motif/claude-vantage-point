// The Decision pane's option pages (#134): one tab per option, each a sentence on
// what the option is and the diagrams that make its case, fitted to the pane so it
// never scrolls. Pure: the fork's JSON in, checked pages out, and each diagram's
// picture as an SVG source at the width it fills.
import type { HumanQueueDiagram, HumanQueueDiagramDraw, HumanQueueDiagramPoint, HumanQueueOptionPage } from '../../types'
import { FILL, QUIET, REST_LINE, SIGNAL_YELLOW, TEXT } from '../../hooks/signal.ts'
import { esc, sfWidth } from '../svg.ts'
import { clip, LINE, type Picture, SMALL, svg, t, textWidth } from './draw.ts'

export type OptionPage = HumanQueueOptionPage
export type Diagram = HumanQueueDiagram

export const POINTS: readonly HumanQueueDiagramPoint[] = ['why', 'how', 'work', 'control', 'passed', 'risk']

/** How many diagrams a page holds, and how many rows, stages, lines or risks one diagram draws. */
export const MAX_DIAGRAMS = 5
const MAX_ROWS = 5

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim().replace(/\s+/g, ' ') : null)
const count = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null)
/** The entries of a list that parse, at most `max`; null when none does. */
function some<T>(value: unknown, parse: (one: unknown) => T | null, max = MAX_ROWS): T[] | null {
  if (!Array.isArray(value)) return null
  const kept = value.map(parse).filter((one): one is T => one !== null).slice(0, max)
  return kept.length === 0 ? null : kept
}
const optional = <K extends string, V>(key: K, value: V | null | undefined) => (value === null || value === undefined ? {} : { [key]: value }) as Partial<Record<K, V>>

/** A diagram's picture as the fork wrote it, or null when its shape is unknown or holds nothing. */
export function drawOf(value: unknown): HumanQueueDiagramDraw | null {
  const raw = object(value)
  switch (raw?.shape) {
    case 'bars': {
      const rows = some(raw.rows, one => {
        const row = object(one)
        const label = text(row?.label)
        const amount = count(row?.value)
        return label === null || amount === null ? null : { label, value: amount, ...optional('unit', text(row?.unit)), ...(row?.lit === true ? { lit: true } : {}) }
      })
      return rows === null ? null : { shape: 'bars', rows }
    }
    case 'route': {
      const stages = some(raw.stages, stage => some(Array.isArray(stage) ? stage : [stage], one => {
        const node = object(one)
        const name = text(node?.name)
        return name === null ? null : { name, ...optional('note', text(node?.note)), ...(node?.lit === true ? { lit: true } : {}) }
      }, 3))
      return stages === null || stages.length < 2 ? null : { shape: 'route', stages }
    }
    case 'work': {
      const rows = some(raw.rows, one => {
        const row = object(one)
        const minutes = count(row?.minutes)
        const who = row?.who === 'me' ? 'me' as const : row?.who === 'you' ? 'you' as const : null
        return who === null || minutes === null ? null : { who, minutes, ...optional('plus', text(row?.plus)) }
      }, 2)
      // Nothing for either side is no chart: the fork is told to leave it out, and one that slips through drops.
      return rows === null || rows.every(r => r.minutes === 0 && r.plus === undefined) ? null : { shape: 'work', rows }
    }
    case 'lines': {
      const lines = some(raw.lines, one => {
        const line = typeof one === 'string' ? { text: one } : object(one)
        const said = text(line?.text)
        return said === null ? null : { text: said }
      })
      return lines === null ? null : { shape: 'lines', lines }
    }
    case 'risk': {
      const risks = some(raw.risks, one => {
        const row = object(one)
        const risk = text(row?.risk)
        const fallback = text(row?.fallback)
        return risk === null || fallback === null ? null : { risk, fallback, ...optional('why', text(row?.why)) }
      }, 3)
      return risks === null ? null : { shape: 'risk', risks }
    }
  }
  return null
}

/** One diagram, or null when its point, title or picture is missing: a bad diagram drops, never its page. */
export function diagramOf(value: unknown): Diagram | null {
  const raw = object(value)
  const point = POINTS.find(one => one === raw?.point)
  const title = text(raw?.title)
  const draw = drawOf(raw?.draw)
  if (point === undefined || title === null || draw === null) return null
  const terms = some(raw?.terms, one => {
    const term = object(one)
    const word = text(term?.term)
    const meaning = text(term?.meaning)
    return word === null || meaning === null ? null : { term: word, meaning }
  }, 4)
  return { point, title, draw, ...optional('says', text(raw?.says)), ...optional('terms', terms) }
}

/** A page's diagrams with each term explained once: a term an earlier diagram on the page explained drops from the later. */
function explainedOnce(diagrams: Diagram[]): Diagram[] {
  // A route box with a note explains its own name, so the name needs no term line anywhere on the page.
  const seen = new Set<string>(diagrams.flatMap(one => (one.draw.shape === 'route' ? one.draw.stages.flat() : []).filter(node => node.note !== undefined).map(node => node.name.toLowerCase())))
  return diagrams.map(one => {
    if (one.terms === undefined) return one
    const terms = one.terms.filter(term => !seen.has(term.term.toLowerCase()))
    for (const term of terms) seen.add(term.term.toLowerCase())
    const { terms: _terms, ...rest } = one
    return terms.length === 0 ? rest : { ...rest, terms }
  })
}

/**
 * The fork's pages by option index: each page names its option exactly, says what it is, and keeps the
 * diagrams that parse. An option with no page is null; undefined when no option has one.
 */
export function pagesOf(value: unknown, options: readonly string[]): (OptionPage | null)[] | undefined {
  if (!Array.isArray(value)) return undefined
  const key = (s: string) => s.trim().toLowerCase()
  const pages = options.map(option => {
    const raw = value.map(object).find(one => typeof one?.option === 'string' && key(one.option) === key(option))
    const what = text(raw?.what)
    const diagrams = some(raw?.diagrams, diagramOf, MAX_DIAGRAMS)
    return what === null || diagrams === null ? null : { what, diagrams: explainedOnce(diagrams) }
  })
  return pages.every(page => page === null) ? undefined : pages
}

// --- Pictures ---------------------------------------------------------------------

/** Minutes as a person reads them. */
export const minutesSaid = (minutes: number) =>
  minutes === 0 ? 'nothing' : minutes < 60 ? `${Math.round(minutes)} min` : `${Math.floor(minutes / 60)} h${minutes % 60 === 0 ? '' : ` ${Math.round(minutes % 60)} min`}`

const rect = (x: number, y: number, w: number, h: number, stroke: string, dash = false) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${FILL}" stroke="${stroke}"${dash ? ' stroke-dasharray="4 3"' : ''}/>`

/**
 * Bars to compare, one row each, the value printed after it; the row the point is about is white, the rest grey.
 * Where the labels would take more than two fifths of the width, each sits on its own line over its bar, never cut.
 */
function bars(draw: Extract<HumanQueueDiagramDraw, { shape: 'bars' }>, w: number): Picture {
  const said = (r: { value: number; unit?: string }) => (r.unit === undefined ? String(r.value) : `${r.value} ${r.unit}`)
  // Measured as `clip` measures, so a label the column was sized for is never cut.
  const widest = Math.max(...draw.rows.map(r => textWidth(r.label, 12))) + 12
  // Labels stay left of their bars, as every other tile's do, until the picture is too narrow for both.
  const stacked = w < 360 && widest > w * 0.4
  const x0 = stacked ? 0 : Math.min(widest, Math.round(w * 0.55))
  const right = Math.max(...draw.rows.map(r => sfWidth(said(r), 12))) + 10
  const per = (w - x0 - right) / Math.max(1, ...draw.rows.map(r => r.value))
  // Every row lit raises nothing: the chart draws unlit, as a route lit end to end does.
  const anyLit = draw.rows.some(r => r.lit) && !draw.rows.every(r => r.lit)
  // Stacked, a label wraps to a second line over its bar rather than lose its end.
  const labels = draw.rows.map(r => (stacked ? upTo(r.label, w, 12, 2) : [clip(r.label, x0 - 8)]))
  let body = ''
  let top = 0
  draw.rows.forEach((r, i) => {
    const y = top + (stacked ? labels[i]!.length * 15 + 1 : 0)
    top = y + 24
    const ink = r.lit || !anyLit ? TEXT : QUIET
    labels[i]!.forEach((line, k) => {
      body += t(0, stacked ? y - 3 - (labels[i]!.length - 1 - k) * 15 : y + 14, line, { fill: ink })
    })
    body += `<rect x="${x0}" y="${y + 5}" width="${Math.max(2, r.value * per)}" height="11" rx="2" fill="${r.lit && anyLit ? TEXT : QUIET}"/>`
    body += t(x0 + Math.max(2, r.value * per) + 6, y + 14, said(r), { fill: ink })
  })
  return svg(w, top, body, draw.rows.map(r => `${r.label}: ${said(r)}`).join(', '))
}

/** Words in lines no wider than `room`, measured by the font's own widths, so a line that fits is never pushed down. */
function wrap(said: string, room: number, size = 12): string[] {
  const out: string[] = []
  let now = ''
  for (const word of said.split(/\s+/).filter(Boolean)) {
    const next = now === '' ? word : `${now} ${word}`
    if (now !== '' && sfWidth(next, size) > room) {
      out.push(now)
      now = word
    } else now = next
  }
  return now === '' ? out : [...out, now]
}

/** Text wrapped to `room`, at most `max` lines; what is left over ends the last line in an ellipsis, never dropped unsaid. */
function upTo(said: string, room: number, size: number, max: number): string[] {
  const all = wrap(said, room, size)
  return all.length <= max ? all : [...all.slice(0, max - 1), clip(`${all.slice(max - 1).join(' ')}`, room, size).replace(/([^…])$/, '$1…')]
}

/**
 * Stages in order, each one or more boxes, every box linked to the next stage's; the option's own path is white.
 * Left to right where each box gets 100 pixels, else top to bottom, a stage's alternatives side by side, so a narrow
 * pane never cuts a name to a fragment.
 */
function route(given: Extract<HumanQueueDiagramDraw, { shape: 'route' }>, w: number): Picture {
  // A route lit end to end raises nothing, and its white boxes read as buttons: it draws unlit (the design review of #134).
  const draw: typeof given = given.stages.flat().every(node => node.lit) ? { ...given, stages: given.stages.map(stage => stage.map(({ lit: _lit, ...node }) => node)) } : given
  const n = draw.stages.length
  // Five steps close their gaps so each box keeps room for a two-line name.
  const gap = n >= 5 ? 16 : 26
  // Left to right while every box keeps 80 pixels and each name fits two lines: five steps in a half tile stay a row.
  const across = Math.floor((w - (n - 1) * gap) / n) >= 80 && draw.stages.every(stage => stage.length === 1 || Math.floor((w - (n - 1) * gap) / n) >= 100) && draw.stages.flat().every(node => wrap(node.name, Math.min(170, Math.floor((w - (n - 1) * gap) / n)) - 14, 12).length <= 2)
  const widest = Math.max(...draw.stages.map(stage => stage.length))
  // Stacked, a box keeps a step's width: one spanning the tile reads as a button (the design review of #134).
  const bw = across ? Math.min(170, Math.floor((w - (n - 1) * gap) / n)) : Math.min(220, Math.floor((w - (widest - 1) * 12) / widest))
  const nameLines = (name: string) => upTo(name, bw - 14, 12, 2)
  const noteLines = (note: string | undefined) => (note === undefined ? [] : upTo(note, bw - 14, SMALL, 3))
  const own = (node: { name: string; note?: string }) => 12 + nameLines(node.name).length * 15 + noteLines(node.note).length * 14 + 4
  // Left to right, every box is as tall as the tallest, so a row of steps reads as one row.
  const tallest = Math.max(...draw.stages.flat().map(own))
  const heightOf = (node: { name: string; note?: string }) => (across ? tallest : own(node))
  type Placed = { name: string; note?: string; lit?: boolean; x: number; y: number; h: number }
  let placed: Placed[][]
  let height: number
  if (across) {
    const columns = draw.stages.map(stage => stage.reduce((sum, node) => sum + heightOf(node), 0) + (stage.length - 1) * 12)
    height = Math.max(...columns)
    placed = draw.stages.map((stage, s) => {
      let y = (height - columns[s]!) / 2
      return stage.map(node => {
        const at = { ...node, x: s * (bw + gap), y, h: heightOf(node) }
        y += at.h + 12
        return at
      })
    })
  } else {
    let y = 0
    placed = draw.stages.map(stage => {
      const h = Math.max(...stage.map(heightOf))
      const left = (w - (stage.length * bw + (stage.length - 1) * 12)) / 2
      const row = stage.map((node, i) => ({ ...node, x: left + i * (bw + 12), y, h }))
      y += h + gap
      return row
    })
    height = y - gap
  }
  let edges = ''
  placed.slice(0, -1).forEach((stage, s) => {
    for (const a of stage) {
      for (const b of placed[s + 1]!) {
        const lit = a.lit === true && b.lit === true
        const d = across
          ? `M${a.x + bw},${a.y + a.h / 2} C${a.x + bw + gap / 2},${a.y + a.h / 2} ${b.x - gap / 2},${b.y + b.h / 2} ${b.x},${b.y + b.h / 2}`
          : `M${a.x + bw / 2},${a.y + a.h} C${a.x + bw / 2},${a.y + a.h + gap / 2} ${b.x + bw / 2},${b.y - gap / 2} ${b.x + bw / 2},${b.y}`
        edges += `<path d="${d}" fill="none" stroke="${lit ? TEXT : LINE}" stroke-width="1"/>`
      }
    }
  })
  let boxes = ''
  for (const node of placed.flat()) {
    // A lit step raises its words alone: a white frame round white words reads as a button (the design review of #134).
    boxes += rect(node.x + 0.5, node.y + 0.5, bw - 1, node.h - 1, LINE)
    // A box taller than its own words (a row's boxes share the tallest's height) centres them.
    let y = node.y + 20 + (node.h - own(node)) / 2
    for (const one of nameLines(node.name)) {
      boxes += t(node.x + bw / 2, y, one, { fill: node.lit ? TEXT : QUIET, anchor: 'middle' })
      y += 15
    }
    for (const one of noteLines(node.note)) {
      boxes += t(node.x + bw / 2, y - 1, one, { size: SMALL, fill: QUIET, anchor: 'middle' })
      y += 14
    }
  }
  const alt = draw.stages.map(stage => stage.map(node => `${node.name}${node.lit ? ' (this option)' : ''}`).join(' or ')).join(', then ')
  return svg(w, Math.ceil(height) + 1, edges + boxes, alt)
}


/**
 * Who does the work: my minutes and yours as bars over a faint track of `scale` minutes, the most any tab spends, so
 * a short bar reads against the longest on this tab too; yours in amber, since it waits on the person. A side with no
 * minutes is a tick, amber where something still falls to the person ("install"). The times stand in one column after
 * the track, the minutes white and what they miss grey.
 */
function work(draw: Extract<HumanQueueDiagramDraw, { shape: 'work' }>, w: number, scale: number): Picture {
  const rows = (['me', 'you'] as const).map(who => draw.rows.find(r => r.who === who) ?? { who, minutes: 0 })
  const x0 = 40
  const span = Math.max(40, Math.round((w - x0) * 0.45))
  const at = x0 + span + 8
  let body = ''
  let y = 0
  for (const r of rows) {
    const colour = r.who === 'you' ? SIGNAL_YELLOW : QUIET
    const length = r.minutes === 0 ? 0 : Math.max(4, (r.minutes / Math.max(1, scale)) * span)
    body += t(0, y + 15, r.who, { fill: QUIET })
    body += `<rect x="${x0}" y="${y + 4}" width="${span}" height="14" rx="2" fill="${REST_LINE}"/>`
    body += length === 0
      ? `<rect x="${x0}" y="${y + 3}" width="2" height="16" fill="${r.plus === undefined ? QUIET : colour}"/>`
      : `<rect x="${x0}" y="${y + 4}" width="${length}" height="14" rx="2" fill="${colour}"/>`
    // An extra with no minutes is said alone ("install and permissions"), never as "nothing + install"; one that does
    // not fit after the minutes wraps under them, grey, never cut.
    const minutes = r.plus !== undefined && r.minutes === 0 ? '' : minutesSaid(r.minutes)
    const extra = r.plus === undefined ? [] : wrap(r.minutes === 0 ? r.plus.replace(/^\+\s*/, '') : r.plus, w - at - (minutes === '' ? 0 : sfWidth(`${minutes} `, 12)), 12)
    const fits = extra.length <= 1
    const under = fits ? [] : wrap(extra.join(' '), w - at, 12)
    body += `<text x="${at}" y="${y + 15}" font-family="-apple-system, system-ui, sans-serif" font-size="12">` +
      `${minutes === '' ? '' : `<tspan fill="${TEXT}">${esc(minutes)}</tspan>`}` +
      `${!fits || extra.length === 0 ? '' : `<tspan fill="${QUIET}">${esc(`${minutes === '' ? '' : ' '}${extra[0]}`)}</tspan>`}</text>`
    under.forEach((line, i) => (body += t(at, y + 31 + i * 16, line, { fill: QUIET })))
    y += 28 + under.length * 16
  }
  const said = (r: { minutes: number; plus?: string }) => `${minutesSaid(r.minutes)}${r.plus === undefined ? '' : ` ${r.plus}`}`
  return svg(w, y - 6, body, `On a scale of ${minutesSaid(scale)}: ${rows.map(r => `${r.who === 'me' ? 'I' : 'you'} spend ${said(r)}`).join(', ')}`)
}

/**
 * What could go wrong, in an amber frame, linked by "if so" to the fallback that answers it: side by side where each
 * box gets 170 pixels, else the fallback under the risk, so a narrow pane never wraps a box to a column of words.
 */
function risk(draw: Extract<HumanQueueDiagramDraw, { shape: 'risk' }>, w: number): Picture {
  const link = 52
  const across = (w - link) / 2 >= 170
  const bw = across ? Math.floor((w - link) / 2) : w
  let y = 0
  let body = ''
  for (const one of draw.risks) {
    const said = wrap(one.risk, bw - 20, 12)
    const why = one.why === undefined ? [] : wrap(one.why, bw - 20, SMALL)
    const fallback = wrap(one.fallback, bw - 20, 12)
    const riskH = said.length * 16 + why.length * 14 + 16
    const fallH = fallback.length * 16 + 16
    const h = across ? Math.max(riskH, fallH) : riskH
    const fx = across ? bw + link : 0
    const fy = across ? y : y + riskH + 28
    body += rect(0.5, y + 0.5, bw - 1, h - 1, SIGNAL_YELLOW) + rect(fx + 0.5, fy + 0.5, bw - 1, (across ? h : fallH) - 1, LINE)
    said.forEach((line, i) => (body += t(10, y + 20 + i * 16, line)))
    why.forEach((line, i) => (body += t(10, y + 20 + said.length * 16 + i * 14 - 2, line, { size: SMALL, fill: QUIET })))
    fallback.forEach((line, i) => (body += t(fx + 10, fy + 20 + i * 16, line)))
    body += across
      ? `<line x1="${bw}" y1="${y + h / 2}" x2="${bw + link}" y2="${y + h / 2}" stroke="${LINE}" stroke-dasharray="3 3"/>` +
        t(bw + link / 2, y + h / 2 - 5, 'if so', { size: SMALL, fill: QUIET, anchor: 'middle' })
      : `<line x1="24" y1="${y + riskH}" x2="24" y2="${fy}" stroke="${LINE}" stroke-dasharray="3 3"/>` +
        t(34, y + riskH + 18, 'if so', { size: SMALL, fill: QUIET })
    y = (across ? y + h : fy + fallH) + 10
  }
  return svg(w, y - 10, body, draw.risks.map(one => `If ${one.risk}, then ${one.fallback}`).join('; '))
}

/** A diagram's picture at width `w`; null for lines, which the pane draws as its own text. */
export function diagramPicture(draw: HumanQueueDiagramDraw, w: number, workScale: number): Picture | null {
  switch (draw.shape) {
    case 'bars': return bars(draw, w)
    case 'route': return route(draw, w)
    case 'work': return work(draw, w, workScale)
    case 'risk': return risk(draw, w)
    case 'lines': return null
  }
}

/** The most minutes any option's work diagram spends on one side: every tab's bars share that scale. */
export const workScale = (pages: readonly (OptionPage | null)[]) =>
  Math.max(1, ...pages.flatMap(page => page?.diagrams ?? []).flatMap(one => (one.draw.shape === 'work' ? one.draw.rows.map(r => r.minutes) : [])))

/** A half diagram shares its row with the next half: who does the work and short lines are narrow enough. */
export const isHalf = (one: Diagram) => one.draw.shape === 'work' || one.draw.shape === 'lines'

/** The narrowest page that sets two halves side by side, and the narrowest that splits the page into two columns. */
export const PAIR_ROOM = 520
export const WIDE_ROOM = 900

/** Diagrams in rows: two halves side by side where the page is wide enough for them, every other diagram alone. */
export function rowsOf(diagrams: readonly Diagram[], room: number): Diagram[][] {
  const rows: Diagram[][] = []
  for (const one of diagrams) {
    const last = rows[rows.length - 1]
    if (room >= PAIR_ROOM && isHalf(one) && last?.length === 1 && isHalf(last[0]!)) last.push(one)
    else rows.push([one])
  }
  return rows
}

/**
 * A wide page's two columns, each stacked on its own so a short tile leaves no gap beside a tall one (the design
 * review of #134): each diagram in turn goes to the shorter column, so the page reads why, how, then down.
 */
export function columnsOf(diagrams: readonly Diagram[], room: number, scale: number): [Diagram[], Diagram[]] {
  const columns: [Diagram[], Diagram[]] = [[], []]
  const heights = [0, 0]
  for (const one of diagrams) {
    const c = heights[1]! < heights[0]! ? 1 : 0
    columns[c].push(one)
    heights[c]! += tileHeight(one, room, true, scale) + STEP_PT
  }
  return columns
}

// --- Fitting the page -------------------------------------------------------------

/** A line of body text in the pane, and a step between blocks, in points (docs/palette.md). */
const LINE_PT = 20
const STEP_PT = 10
/** A tile's frame: its border and the padding a round Box keeps above and below. */
const TILE_PT = 26
/** The padding and border a tile keeps at each side, in pixels: what its picture's width loses. */
export const TILE_INSET = 26

/** How many lines `said` wraps to in `room` points of body text. */
const linesOf = (said: string, room: number, size = 13) => Math.max(1, Math.ceil(sfWidth(said, size) / Math.max(80, room)))

/** The width a diagram's picture fills, alone on its row or beside another half. */
export const pictureRoom = (room: number, paired: boolean) => Math.floor((paired ? (room - STEP_PT) / 2 : room) - TILE_INSET)

/** About how tall a diagram's tile draws, in points, at the room its row gives it. */
export function tileHeight(one: Diagram, room: number, paired: boolean, scale: number): number {
  const inner = pictureRoom(room, paired)
  const picture = diagramPicture(one.draw, inner, scale)
  const body = picture?.height ?? (one.draw.shape === 'lines' ? one.draw.lines.reduce((sum, line) => sum + linesOf(line.text, inner) * LINE_PT, 0) : 0)
  const says = one.says === undefined ? 0 : STEP_PT + linesOf(one.says, inner) * LINE_PT
  const terms = (one.terms ?? []).reduce((sum, term) => sum + linesOf(`${term.term} ${term.meaning}`, inner, 12) * 18, 0)
  return TILE_PT + linesOf(one.title, inner, 12) * 18 + STEP_PT + body + says + (terms === 0 ? 0 : STEP_PT + terms)
}

/** About how tall the diagrams draw, in two columns on a wide page, else in rows, gaps between them included. */
export function diagramsHeight(diagrams: readonly Diagram[], room: number, scale: number): number {
  const stack = (tiles: readonly Diagram[]) => tiles.reduce((sum, one) => sum + tileHeight(one, room, true, scale), 0) + Math.max(0, tiles.length - 1) * STEP_PT
  if (room >= WIDE_ROOM) return Math.max(...columnsOf(diagrams, room, scale).map(stack))
  const rows = rowsOf(diagrams, room)
  return rows.reduce((sum, row) => sum + Math.max(...row.map(one => tileHeight(one, room, row.length === 2, scale))), 0) + Math.max(0, rows.length - 1) * STEP_PT
}

/** The order diagrams give way in when a page would scroll: what the agent controls first, why last. */
const GIVES_WAY: readonly HumanQueueDiagramPoint[] = ['control', 'work', 'risk', 'how', 'passed', 'why']

/**
 * The diagrams that fit in `height` points, in the fork's order: a page never scrolls (#134), so while
 * they overflow, the diagram whose point matters least gives way. The first always stays.
 */
export function fitDiagrams(diagrams: readonly Diagram[], room: number, height: number, scale: number): Diagram[] {
  let kept = [...diagrams]
  while (kept.length > 1 && diagramsHeight(kept, room, scale) > height) {
    const drop = GIVES_WAY.map(point => kept.findLastIndex(one => one.point === point)).find(i => i > 0) ?? kept.length - 1
    kept = kept.filter((_, i) => i !== drop)
  }
  // A diagram that gave way to make room may still be shorter than the room left: the most important comes back first.
  const order = (one: Diagram) => -GIVES_WAY.indexOf(one.point)
  for (const one of diagrams.filter(d => !kept.includes(d)).sort((a, b) => order(a) - order(b))) {
    const tried = diagrams.filter(d => kept.includes(d) || d === one)
    if (diagramsHeight(tried, room, scale) <= height) kept = tried
  }
  return kept
}

/**
 * What the page holds above and below its diagrams, in points: the question, the tab row (a line a tab once they
 * stack), the sentence on what the option is, the line saying what gave way, Choose this, and the steps between them.
 */
export function chromeHeight(question: string, what: string, room: number, stackedTabs = 0): number {
  const tabs = stackedTabs === 0 ? 34 : stackedTabs * 20 + 6
  return linesOf(question, room, 15) * 24 + STEP_PT + tabs + STEP_PT + linesOf(what, room, 14) * 22 + STEP_PT + 20 + STEP_PT + STEP_PT + 30
}

/** The pane's height in points from its body rows: 36 rows drew about 740pt (desktop, 2026-11-01, #134). */
export const paneHeight = (bodyRows: number) => bodyRows * 20
