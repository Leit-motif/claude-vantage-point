// The Svg views: each draws one fact kind of an ask item (panes/visuals/facts.ts)
// as the catalog's technique of the same name, so the queue card and the mock
// album (`/vantage-point album`) draw through the same functions. Pure: each
// takes the facts and the width it fills, the card's, and returns an SVG source
// and its size in CSS pixels. Positions stretch with the width; type stays one size,
// so a wide pane gets room rather than bigger letters.
//
// One channel carries one datum (visual-brief's channel table): green is the
// recommended answer, red a shortfall, amber only what waits on the person,
// a dash only what is not live yet, and everything else grey or white.
import { esc } from '../svg.ts'
import { FILL, PANE, PICTURE_LINE, QUIET, RECOMMENDED, REST_LINE, SIGNAL_YELLOW, TEXT } from '../../hooks/signal.ts'
import { joined, TRUSTS, type Facts, type Trust } from './facts.ts'

export type Picture = { source: string; width: number; height: number; alt: string }

/** The narrowest card a picture is laid out for; a narrower one draws it at this width. */
export const MIN_W = 300

/**
 * A cell across, in CSS pixels: `1ch` of the pane's font, system-ui at 14px, which
 * Chrome draws 8.8125 wide on the owner's Mac. The desktop measures its cell with a
 * `width:1ch` span and counts a pane's `bodyColumns` as the body's width over it,
 * rounded down (its remote-surface bundle, desktop 2.1.321), and a Box's width cell
 * is the same measure (docs/palette.md).
 */
export const CELL_PX = 8.8125

/**
 * The width every card picture is drawn at, in CSS pixels: the widest a body of
 * `bodyColumns` can be. The desktop rounds the body down to whole cells and takes no
 * pixel width outside an Svg, so the body's real width is anywhere in the cell past
 * `bodyColumns`; it scales a picture wider than its Box down to fit (docs/palette.md),
 * so a picture drawn at the top of that range meets its frame's edges at any pane
 * width, for a shrink of at most one cell (1.5% at 64 columns). Sized at the low end,
 * a picture ended up to a cell inside the item frame above it (issue 165).
 */
export const cardWidth = (bodyColumns: number) => Math.ceil((bodyColumns + 1) * CELL_PX)

const FONT = 'font-family="-apple-system, system-ui, sans-serif"'
/** A line that carries meaning on the pane's ground: the darkest grey that passes 3:1. */
export const LINE = PICTURE_LINE
/** The smallest type a picture draws (the design review, 2026-10-23). */
export const SMALL = 11

export const svg = (width: number, height: number, body: string, alt: string): Picture => ({
  source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  width,
  height,
  alt,
})

type TextOpts = { size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; halo?: boolean }
/** Text; a halo in the tile's fill keeps a label legible where a line runs under it, with no dark edge of its own (#105's design review). */
export const t = (x: number, y: number, s: string, o: TextOpts = {}) =>
  `<text x="${x}" y="${y}" ${FONT} font-size="${o.size ?? 12}" fill="${o.fill ?? TEXT}" text-anchor="${o.anchor ?? 'start'}"${o.halo ? ` stroke="${FILL}" stroke-width="4" paint-order="stroke"` : ''}>${esc(s)}</text>`
const box = (x: number, y: number, w: number, h: number, o: { stroke?: string; dash?: boolean } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${FILL}" stroke="${o.stroke ?? REST_LINE}"${o.dash ? ' stroke-dasharray="4 3"' : ''}/>`
const arrowDefs = `<defs><marker id="a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${LINE}"/></marker></defs>`
const line = (x1: number, y1: number, x2: number, y2: number, o: { dash?: boolean; arrow?: boolean; stroke?: string } = {}) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.stroke ?? LINE}"${o.dash ? ' stroke-dasharray="3 3"' : ''}${o.arrow === false ? '' : ' marker-end="url(#a)"'}/>`

const fit = (width: number) => Math.max(MIN_W, Math.round(width))
/** A context picture (#102) also draws in half a page, beside another tile, so it goes narrower than a card's picture. */
const fitTile = (width: number) => Math.max(200, Math.round(width))

// --- Views that read an item's facts ----------------------------------------------

type F = Required<Facts>

/** About how wide a run of text draws, for fitting labels without a DOM: a generous average glyph. */
export const textWidth = (s: string, size = 12) => Math.ceil(s.length * size * 0.58)

/** Shortens a label to fit `room` pixels, ending in an ellipsis. */
export const clip = (s: string, room: number, size = 12) => {
  if (textWidth(s, size) <= room) return s
  let out = s
  while (out.length > 1 && textWidth(`${out}…`, size) > room) out = out.slice(0, -1)
  return `${out.trimEnd()}…`
}

/** A value with its unit: `$` before, `%` after, a noun after a space. */
export const withUnit = (value: number, unit = '') => (unit === '$' ? money(value) : unit === '' ? String(value) : unit === '%' ? `${value}%` : `${value} ${unit}`)

/** Dollars as the owner reads them: a sub-cent spend keeps its digits. */
export const money = (n: number) => (n === 0 ? '$0' : n < 0.01 ? `$${Number(n.toPrecision(2))}` : `$${n.toFixed(2)}`)

/** Progress as blocks: one per thing, dashed while not in the state, white once in it. In the state, not passed: never green. */
export function blocks(counts: F['counts'], width: number): Picture {
  const w = fit(width)
  const [before, after_] = [counts.states?.now ?? 'now', counts.states?.after ?? 'after yes']
  const x0 = Math.min(w / 3, Math.max(textWidth(before), textWidth(after_)) + 10)
  const n = counts.total
  const cw = (w - x0 - (n - 1) * 4) / n
  const cell = (i: number, y: number, on: boolean) =>
    `<rect x="${x0 + i * (cw + 4)}" y="${y}" width="${cw}" height="22" rx="4" fill="${on ? TEXT : FILL}" stroke="${on ? TEXT : REST_LINE}"${on ? '' : ' stroke-dasharray="3 3"'}/>`
  const row = (y: number, lit: number) => Array.from({ length: n }, (_, i) => cell(i, y, i < lit)).join('')
  const after = counts.after ?? counts.now
  return svg(
    w,
    64,
    t(0, 23, clip(before, x0 - 8), { fill: QUIET }) + row(8, counts.now) + t(0, 57, clip(after_, x0 - 8), { fill: QUIET }) + row(42, after),
    `${n} ${counts.noun}: ${counts.now} ${before}, ${after} ${after_}`,
  )
}

/** A unit chart: each case a square, the ones in the state lit, against the target's slots. */
export function units(counts: F['counts'], width: number): Picture {
  const w = fit(width)
  // A target that is the whole count draws one row, filled as far as it has come: two rows of the same seven
  // said the one number twice (the design review, 2026-10-24).
  if ((counts.target ?? counts.total) === counts.total && counts.after === undefined && counts.total <= 19) {
    const gap1 = 3
    const size1 = Math.min(16, Math.floor((w - (counts.total - 1) * gap1) / counts.total))
    const said = `${counts.now} of ${counts.total} ${counts.noun}${counts.lit === undefined ? '' : ` ${counts.lit}`}${counts.goal === undefined ? '' : ` ${counts.goal}`}`
    let one = t(0, 13, clip(said, w), { fill: QUIET })
    for (let i = 0; i < counts.total; i++) {
      const on = i < counts.now
      one += `<rect x="${i * (size1 + gap1)}" y="22" width="${size1}" height="${size1}" rx="2" fill="${on ? TEXT : 'none'}" stroke="${on ? TEXT : LINE}"/>`
    }
    const used = Math.min(w, Math.ceil(Math.max(counts.total * (size1 + gap1), textWidth(said) + 4)))
    return svg(used, 22 + size1 + 4, one, `${counts.now} of ${counts.total} ${counts.noun}${counts.lit === undefined ? '' : ` ${counts.lit}`}${counts.goal === undefined ? '' : ` ${counts.goal}`}`)
  }
  const gap = 3
  const perRow = Math.min(19, counts.total)
  const size = Math.min(16, Math.floor((w - (perRow - 1) * gap) / perRow))
  const rows = Math.ceil(counts.total / perRow)
  let body = t(0, 13, `${counts.total} ${counts.noun}`, { fill: QUIET })
  for (let i = 0; i < counts.total; i++) {
    body += `<rect x="${(i % perRow) * (size + gap)}" y="${22 + Math.floor(i / perRow) * (size + gap)}" width="${size}" height="${size}" rx="2" fill="${i < counts.now ? TEXT : REST_LINE}"/>`
  }
  const target = counts.target ?? counts.total
  const y = 22 + rows * (size + gap) + 22
  body += t(0, y, clip(`${counts.lit === undefined ? '' : `${counts.lit}, `}of the ${target} ${counts.goal ?? 'needed'}`, w), { fill: QUIET })
  for (let i = 0; i < target; i++) {
    const on = i < counts.now
    body += `<rect x="${i * (size + gap)}" y="${y + 8}" width="${size}" height="${size}" rx="2" fill="${on ? TEXT : 'none'}" stroke="${on ? TEXT : LINE}"/>`
  }
  return svg(w, y + 8 + size + 4, body, `${counts.total} ${counts.noun}, ${counts.now} of them counted; the target is ${target}`)
}

/**
 * Bars against a threshold: each value a bar from zero, the line drawn through
 * them. The line and its caption are the one bright thing; every bar is quiet
 * until `lit` raises one to white and sets the rest back (the Highlight picker).
 */
export function threshold(fact: F['threshold'], width: number, lit?: number): Picture {
  const w = fit(width)
  const x0 = Math.min(w / 2, Math.max(...fact.values.map(v => textWidth(v.label))) + 12)
  const top = Math.max(fact.line.value, ...fact.values.map(v => v.value))
  const right = Math.max(...fact.values.map(v => textWidth(withUnit(v.value, v.unit)))) + 8
  const per = (w - x0 - right) / top
  const rowH = 32
  let body = ''
  fact.values.forEach((v, i) => {
    const y = 4 + i * rowH
    // Green is the recommended answer's alone and red reads as a no (docs/design.md); a bar is white only when
    // the picker lifts it, so the picture never says more than its control (the design review, 2026-10-23).
    const lifted = lit === i
    body +=
      t(0, y + 13, clip(v.label, x0 - 8), { fill: lifted ? TEXT : QUIET }) +
      // A quiet bar is the quiet grey every picture's unlit marks share, so it reads on the tile and the white line still leads (#105's design review).
      `<rect x="${x0}" y="${y}" width="${v.value * per}" height="18" rx="3" fill="${lifted ? TEXT : QUIET}"/>` +
      // The value sits after its bar; its halo, in the tile's fill, breaks the line where it crosses (the owner's queue, 2026-10-24).
      t(x0 + v.value * per + 6, y + 13, withUnit(v.value, v.unit), { fill: lifted ? TEXT : QUIET, halo: true })
  })
  const lineX = x0 + fact.line.value * per
  const bottom = 4 + fact.values.length * rowH
  const caption = `${fact.line.label}: ${withUnit(fact.line.value, fact.line.unit)}`
  const half = textWidth(caption) / 2
  // The line goes under the bars' labels, so their halos keep a value legible where it crosses.
  body = line(lineX, 0, lineX, bottom - 6, { arrow: false, stroke: TEXT }) + body + t(Math.min(w - half, Math.max(half, lineX)), bottom + 12, caption, { anchor: 'middle' })
  return svg(w, bottom + 18, body, `${fact.values.map(v => `${v.label} ${withUnit(v.value, v.unit)}`).join(', ')}; ${fact.line.label} ${withUnit(fact.line.value, fact.line.unit)}`)
}

/** How each trust draws in the weight picture: one channel, the bar's fill, carries it (most trusted brightest). */
const TRUST_DRAW: Record<Trust, { fill: string; stroke: string; dash: boolean; says: string }> = {
  checked: { fill: TEXT, stroke: TEXT, dash: false, says: 'white: checked by a person' },
  measured: { fill: QUIET, stroke: QUIET, dash: false, says: 'grey: measured by a run' },
  reported: { fill: 'none', stroke: QUIET, dash: false, says: 'outline: reported' },
  guess: { fill: 'none', stroke: LINE, dash: true, says: 'dashed: a guess' },
}

/**
 * Evidence by weight (#102): each source a bar as long as how much of it there
 * is, its fill how far it can be trusted, and the answer it points to after it,
 * green only where that is the recommended answer. A key under the bars names
 * only the trusts drawn.
 */
export function weight(evidence: F['evidence'], recommend: 'yes' | 'no' | undefined, width: number): Picture {
  const w = fitTile(width)
  const tail = (one: F['evidence'][number]) => withUnit(one.weight ?? 0, one.unit)
  // Each source on two lines, its name over its bar, so a half-page tile still draws whole names and long bars.
  const right = Math.max(...evidence.map(one => textWidth(tail(one)))) + 8
  const top = Math.max(...evidence.map(one => one.weight ?? 0))
  const per = (w - right) / top
  let body = ''
  let y = 0
  evidence.forEach(one => {
    const how = TRUST_DRAW[one.trust]
    // A source that points to the recommended answer says what the question already says; only one against it is marked (#105).
    const mark = one.favours === undefined || one.favours === recommend ? '' : `→ ${one.favours}`
    const name = wrap(one.label, w - textWidth(mark) - 10)
    const [names, under] = lines(0, y + 13, name, { fill: one.trust === 'checked' ? TEXT : QUIET })
    body += names + (mark === '' ? '' : t(w, y + 13, mark, { anchor: 'end', fill: QUIET }))
    const barY = under + 8
    const bar = Math.max(4, (one.weight ?? 0) * per)
    body +=
      `<rect x="0.5" y="${barY + 0.5}" width="${bar - 1}" height="13" rx="3" fill="${how.fill}" stroke="${how.stroke}"${how.dash ? ' stroke-dasharray="3 3"' : ''}/>` +
      t(bar + 6, barY + 11, tail(one), { size: SMALL, fill: QUIET })
    y = barY + 13 + 12
  })
  const drawn = TRUSTS.filter(trust => evidence.some(one => one.trust === trust))
  const [key, bottom] = lines(0, y + 6, wrap(drawn.map(trust => TRUST_DRAW[trust].says).join(' · '), w, SMALL), { size: SMALL, fill: QUIET, lead: 14 })
  return svg(
    w,
    bottom + 5,
    body + key,
    evidence.map(one => `${one.label}: ${withUnit(one.weight ?? 0, one.unit)}, ${one.trust}${one.favours === undefined ? '' : `, favours ${one.favours}`}`).join('; '),
  )
}

/** Words laid into lines no wider than `room` pixels: a context picture wraps its text rather than cut it. */
export function wrap(s: string, room: number, size = 12): string[] {
  const out: string[] = []
  let now = ''
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const next = now === '' ? word : `${now} ${word}`
    if (now !== '' && textWidth(next, size) > room) {
      out.push(now)
      now = word
    } else now = next
  }
  if (now !== '') out.push(now)
  return out.map(one => (textWidth(one, size) > room ? clip(one, room, size) : one))
}

/** Lines of text from `y`, `lead` apart; returns the drawn text and the y under it. */
const lines = (x: number, y: number, said: string[], o: TextOpts & { lead?: number } = {}): [string, number] => {
  const lead = o.lead ?? 16
  return [said.map((one, i) => t(x, y + i * lead, one, o)).join(''), y + (said.length - 1) * lead]
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** How far a change reaches, as a share of the rail: nothing a dot, a little a third, everything all of it. */
const REACH_SHARE = { none: 0, small: 0.34, wide: 1 } as const

/**
 * What each answer changes (#102): a lane per answer, each change a rail as long
 * as its reach (a dot for nothing, a third for a little, the whole lane for
 * everything), white where it reaches wide, its words under it and its undo
 * after a ↺. The recommended answer's name alone is green.
 */
export function reach(impact: F['impact'], recommend: 'yes' | 'no' | undefined, width: number): Picture {
  const w = fitTile(width)
  let body = ''
  let y = 14
  for (const which of ['yes', 'no'] as const) {
    body += t(0, y, which === 'yes' ? 'If yes' : 'If no', { fill: recommend === which ? RECOMMENDED : QUIET })
    y += 12
    for (const one of impact[which]) {
      const len = REACH_SHARE[one.reach] * w
      body +=
        one.reach === 'none'
          ? `<circle cx="5" cy="${y + 4}" r="4" fill="none" stroke="${LINE}"/>`
          : `<rect x="0" y="${y}" width="${len}" height="8" rx="4" fill="${one.reach === 'wide' ? TEXT : QUIET}"/>` +
            (one.reach === 'small' ? `<rect x="${len + 4}" y="${y + 3}" width="${w - len - 4}" height="2" fill="${REST_LINE}"/>` : '')
      const [text, last] = lines(0, y + 26, wrap(capital(one.what), w), { fill: one.reach === 'none' ? QUIET : TEXT })
      body += text
      y = last
      if (one.undo !== undefined) {
        const [undo, below] = lines(0, y + 17, wrap(`↺ ${one.undo}`, w, SMALL), { size: SMALL, fill: QUIET, lead: 14 })
        body += undo
        y = below
      }
      y += 16
    }
    y += 12
  }
  const said = (which: 'yes' | 'no') => impact[which].map(one => `${one.what} (${one.reach})`).join('; ')
  return svg(w, y - 18, body, `If yes: ${said('yes')}. If no: ${said('no')}.`)
}

/**
 * For and against as a balance (#102): a beam on a fulcrum, the case for
 * hanging on the left and against on the right, each line a weight with its
 * words. The beam tips toward whichever side holds more lines, level on a tie:
 * the count is the only weight the facts carry.
 */
export function balance(tradeoffs: F['tradeoffs'], width: number): Picture {
  const w = fitTile(width)
  const col = (w - 24) / 2
  // The heavier side sits lower: the case for on the left, so more pros tip the left end down.
  const tilt = Math.sign(tradeoffs.cons.length - tradeoffs.pros.length) * 12
  const cx = w / 2
  const beamY = 16
  const yAt = (x: number) => beamY + ((x - cx) / (w / 2)) * tilt
  let body = `<line x1="0" y1="${yAt(0)}" x2="${w}" y2="${yAt(w)}" stroke="${LINE}" stroke-width="2"/>` + `<path d="M${cx - 9},${beamY + 14} L${cx},${beamY} L${cx + 9},${beamY + 14} z" fill="${REST_LINE}"/>`
  let bottom = 0
  const side = (said: string[], x0: number, mark: string, title: string) => {
    const hang = x0 + col / 2
    // Each side's cord runs to one baseline, so the two headings and lists line up (the design review, 2026-10-24).
    const base = beamY + 12 + 14
    body += `<line x1="${hang}" y1="${yAt(hang)}" x2="${hang}" y2="${base}" stroke="${LINE}"/>`
    let y = base
    body += t(x0 + 10, y + 16, title, { fill: QUIET, size: SMALL })
    y += 24
    for (const one of said) {
      const words = wrap(capital(one), col - 30)
      const h = words.length * 16 + 12
      // A line of text, not an outlined box: beside the comment field, a box read as one (the design review, 2026-10-24).
      body += t(x0 + 10, y + 19, mark, { fill: QUIET })
      body += lines(x0 + 24, y + 19, words)[0]
      y += h + 6
    }
    bottom = Math.max(bottom, y)
  }
  side(tradeoffs.pros, 0, '+', 'For')
  side(tradeoffs.cons, w - col, '−', 'Against')
  return svg(w, bottom, body, `For: ${tradeoffs.pros.join('; ')}. Against: ${tradeoffs.cons.join('; ')}.`)
}

/**
 * What a yes touches, as a map (#102): the decision at the centre and a line out
 * to each thing it changes, each named in its box with how it changes beneath,
 * laid around the centre as Graphite's bloom lays its widgets.
 */
export function touchMap(touches: F['touches'], width: number): Picture {
  const w = fitTile(width)
  const n = touches.length
  const cols = n <= 2 ? n : 2
  const cw = (w - (cols - 1) * 16) / cols
  const hubW = Math.min(140, w * 0.4)
  const hub = { x: (w - hubW) / 2, y: 0, h: 28 }
  let body = box(hub.x, hub.y, hubW, hub.h, { stroke: LINE }) + t(w / 2, 18, 'a yes', { anchor: 'middle', fill: QUIET })
  let y = hub.h + 30
  let bottom = y
  for (let i = 0; i < n; i += cols) {
    const row = touches.slice(i, i + cols)
    let rowBottom = y
    row.forEach((one, j) => {
      const x = row.length === 1 ? (w - cw) / 2 : j * (cw + 16)
      const name = wrap(one.name, cw - 16)
      const change = wrap(one.change, cw - 16, SMALL)
      const h = 10 + name.length * 16 + change.length * 14 + 8
      const [names, under] = lines(x + 8, y + 18, name)
      body += line(w / 2, hub.y + hub.h, x + cw / 2, y - 2)
      body += box(x, y, cw, h) + names + lines(x + 8, under + 18, change, { size: SMALL, fill: QUIET, lead: 14 })[0]
      rowBottom = Math.max(rowBottom, y + h)
    })
    y = rowBottom + 16
    bottom = rowBottom
  }
  return svg(w, bottom + 1, arrowDefs + body, `A yes touches ${touches.map(one => `${one.name}: ${one.change}`).join('; ')}`)
}

/**
 * The person's earlier rulings on asks like this one, on a line in time (#102):
 * a filled dot for a yes, a hollow one for a no, when above it, and what was
 * asked and what came of it beside.
 */
export function rulings(precedent: F['precedent'], width: number): Picture {
  const w = fitTile(width)
  const x0 = 10
  let y = 4
  let body = ''
  for (const one of precedent) {
    body += `<circle cx="${x0}" cy="${y + 12}" r="5" fill="${one.ruled === 'yes' ? TEXT : PANE}" stroke="${TEXT}"/>`
    body += t(26, y + 16, `${one.when} · ruled ${one.ruled}`, { size: SMALL, fill: QUIET })
    const [asked, under] = lines(26, y + 34, wrap(capital(one.ask), w - 30))
    body += asked
    y = under
    if (one.came !== undefined) {
      const [came, below] = lines(26, y + 16, wrap(one.came, w - 30, SMALL), { size: SMALL, fill: QUIET, lead: 14 })
      body += came
      y = below
    }
    y += 18
  }
  // The line in time runs through every dot.
  const spine = `<line x1="${x0}" y1="16" x2="${x0}" y2="${Math.max(16, y - 30)}" stroke="${REST_LINE}"/>`
  return svg(w, y - 8, spine + body, precedent.map(one => `${one.when}: ${one.ask}, ruled ${one.ruled}${one.came === undefined ? '' : `, ${one.came}`}`).join('; '))
}

/** A decision tree rooted in the card's own question: each answer, where it leads, and what it costs. */
export function tree(question: string, answers: F['answers'], width: number): Picture {
  const w = fit(width)
  const half = (w - 16) / 2
  const lx = half / 2
  const rx = w - half / 2
  const side = (which: 'yes' | 'no') => {
    const said = answers[which]
    const cost = said.reduce((a, c) => a + (c.cost ?? 0), 0)
    const upTo = said.some(c => c.upTo === true)
    return { does: joined(said), then: said.find(c => c.then !== undefined)?.then ?? '', cost: `${upTo ? 'up to ' : ''}${money(cost)}` }
  }
  const yes = side('yes')
  const no = side('no')
  const rec = answers.recommend
  const body =
    arrowDefs +
    `<circle cx="${w / 2}" cy="8" r="4" fill="${QUIET}"/>` +
    line(w / 2 - 4, 10, lx, 54) +
    line(w / 2 + 4, 10, rx, 54) +
    t(w / 2 - 50, 40, 'yes', { size: SMALL, fill: rec === 'yes' ? RECOMMENDED : QUIET, anchor: 'end', halo: true }) +
    t(w / 2 + 50, 40, 'no', { size: SMALL, fill: rec === 'no' ? RECOMMENDED : QUIET, halo: true }) +
    box(0, 56, half, 26) +
    t(lx, 73, clip(yes.does, half - 12), { anchor: 'middle', fill: rec === 'yes' ? TEXT : QUIET }) +
    box(w - half, 56, half, 26) +
    t(rx, 73, clip(no.does, half - 12), { anchor: 'middle', fill: rec === 'no' ? TEXT : QUIET }) +
    line(lx, 82, lx, 102) +
    line(rx, 82, rx, 102) +
    box(0, 104, half, 42) +
    t(lx, 121, clip(yes.then, half - 12), { anchor: 'middle', fill: rec === 'yes' ? TEXT : QUIET }) +
    t(lx, 138, yes.cost, { anchor: 'middle', size: SMALL, fill: QUIET }) +
    box(w - half, 104, half, 42) +
    t(rx, 121, clip(no.then, half - 12), { anchor: 'middle', fill: rec === 'no' ? TEXT : QUIET }) +
    t(rx, 138, no.cost, { anchor: 'middle', size: SMALL, fill: QUIET })
  return svg(w, 150, body, `Decision tree for “${question}”: yes, ${yes.does}, leads to ${yes.then} at ${yes.cost}; no, ${no.does}, leads to ${no.then} at ${no.cost}`)
}

/** A flow split by width: a total into its parts, each band as thick as its share. */
export function sankey(fact: F['parts'], width: number): Picture {
  const w = fit(width)
  const gap = 10
  const h = 114
  const scale = (h - gap * (fact.parts.length - 1)) / fact.total
  const totalLabel = `${withUnit(fact.total)}${fact.label === undefined ? '' : ` ${fact.label}`}`
  const a = Math.min(w / 3, Math.max(84, textWidth(totalLabel) + 32))
  const labelRoom = Math.min(w / 2, Math.max(...fact.parts.map(p => textWidth(`${withUnit(p.value, p.unit)} ${p.label}`, SMALL))) + 18)
  const b = w - labelRoom
  const band = (y0: number, y1: number, height: number, colour: string, opacity: number) =>
    `<path d="M${a},${y0} C${(a + b) / 2},${y0} ${(a + b) / 2},${y1} ${b},${y1} L${b},${y1 + height} C${(a + b) / 2},${y1 + height} ${(a + b) / 2},${y0 + height} ${a},${y0 + height} Z" fill="${colour}" opacity="${opacity}"/>`
  let body = `<rect x="${a - 12}" y="4" width="12" height="${fact.total * scale}" fill="${QUIET}"/>` + t(a - 18, 4 + h / 2 + 4, clip(totalLabel, a - 20), { anchor: 'end' })
  let from = 4
  let to = 4
  fact.parts.forEach((p, i) => {
    const height = p.value * scale
    const colour = i === 0 ? TEXT : REST_LINE
    body += band(from, to, height, colour, i === 0 ? 0.9 : 0.8)
    body += `<rect x="${b}" y="${to}" width="12" height="${height}" fill="${colour}"/>`
    body += t(b + 18, to + Math.max(height / 2, 6) + 4, clip(`${withUnit(p.value, p.unit)} ${p.label}`, labelRoom - 18, SMALL), { size: SMALL, fill: i === 0 ? TEXT : QUIET })
    from += height
    to += height + gap
  })
  return svg(w, h + 8, body, `${withUnit(fact.total)} split into ${fact.parts.map(p => `${withUnit(p.value, p.unit)} ${p.label}`).join(', ')}`)
}

type Placed = { name: string; x: number; y: number }

/**
 * Lays a flow out: the chain of moves from the first box runs across the top,
 * up to three wide; every other box sits under the box that moves to it.
 */
function layout(fact: F['flow'], w: number, top: number) {
  const across: string[] = [fact.nodes[0] as string]
  while (across.length < 3) {
    const next = fact.moves.find(m => m.from === across[across.length - 1] && !across.includes(m.to))
    if (next === undefined) break
    across.push(next.to)
  }
  const bw = Math.min(110, (w - 56) / Math.max(3, across.length))
  const step = across.length === 1 ? 0 : (w - bw) / (across.length - 1)
  const placed: Placed[] = across.map((name, i) => ({ name, x: i * step, y: top }))
  for (const name of fact.nodes) {
    if (across.includes(name)) continue
    const source = placed.find(p => fact.moves.some(m => m.from === p.name && m.to === name)) ?? placed[0]!
    const below = placed.filter(p => p.x === source.x && p.y > top).length
    placed.push({ name, x: source.x, y: top + 68 * (below + 1) })
  }
  return { bw, placed, at: (name: string) => placed.find(p => p.name === name) }
}

/** The ends of a move between two placed boxes: side to side across a row, bottom to top between rows. */
function ends(a: Placed, b: Placed, bw: number): [number, number, number, number] {
  return a.y === b.y ? [a.x + bw, a.y + 14, b.x - 2, b.y + 14] : [a.x + bw / 2, a.y + 28, b.x + bw / 2, b.y - 2]
}

/** The never-pair: a grey line from one box to the other, struck with ✕, and what it means. */
function never(fact: F['flow'], at: (name: string) => Placed | undefined, bw: number, w: number): string {
  const from = fact.never && at(fact.never.from)
  const to = fact.never && at(fact.never.to)
  if (!fact.never || !from || !to) return ''
  const x2 = to.x + bw + 6
  const y2 = to.y + 8
  const label = fact.never.label ?? `${fact.never.from} never reaches ${fact.never.to}`
  return (
    line(from.x + bw / 2, from.y + 28, x2, y2, { arrow: false, stroke: REST_LINE }) +
    t((from.x + bw / 2 + x2) / 2, (from.y + 28 + y2) / 2 + 4, '✕', { size: 13, fill: QUIET, anchor: 'middle', halo: true }) +
    t(x2 + 10, to.y + 22, clip(label, w - x2 - 10, SMALL), { size: SMALL, fill: QUIET })
  )
}

/** A flowchart: what moves where (a dashed box is not live yet), and what never touches what. */
export function flow(fact: F['flow'], width: number): Picture {
  const w = fit(width)
  const { bw, placed, at } = layout(fact, w, 16)
  const pending = new Set(fact.pending ?? [])
  let body = arrowDefs
  for (const m of fact.moves) {
    const a = at(m.from)
    const b = at(m.to)
    if (!a || !b) continue
    const [x1, y1, x2, y2] = ends(a, b, bw)
    body += line(x1, y1, x2, y2)
    if (m.label !== undefined && a.y === b.y) body += t((x1 + x2) / 2, a.y - 6, clip(m.label, x2 - x1, SMALL), { size: SMALL, anchor: 'middle', fill: QUIET })
  }
  for (const p of placed) body += box(p.x, p.y, bw, 28, pending.has(p.name) ? { dash: true, stroke: LINE } : {}) + t(p.x + bw / 2, p.y + 18, clip(p.name, bw - 8), { anchor: 'middle' })
  body += never(fact, at, bw, w)
  const bottom = Math.max(...placed.map(p => p.y)) + 32
  return svg(w, bottom, body, flowAlt(fact))
}

/** The same flow, animated: a dot travels each move; a box's tooltip is its term's meaning, where the item defines one. */
export function flowLive(fact: F['flow'], terms: Facts['terms'], width: number): Picture {
  const w = fit(width)
  const { bw, placed, at } = layout(fact, w, fact.moves.some(m => m.label !== undefined) ? 16 : 4)
  const pending = new Set(fact.pending ?? [])
  const meaning = (name: string) => terms?.find(one => one.term === name)?.meaning
  let body = `<style>g:hover rect{stroke:${TEXT}}</style>` + arrowDefs
  let dots = ''
  for (const m of fact.moves) {
    const a = at(m.from)
    const b = at(m.to)
    if (!a || !b) continue
    const [x1, y1, x2, y2] = ends(a, b, bw)
    body += line(x1, y1, x2, y2)
    if (m.label !== undefined && a.y === b.y) body += t((x1 + x2) / 2, a.y - 4, clip(m.label, x2 - x1, SMALL), { size: SMALL, anchor: 'middle', fill: QUIET })
    dots += `<circle r="4" fill="${TEXT}"><animateMotion dur="2.4s" repeatCount="indefinite" path="M${x1},${y1} L${x2 + 2},${y2 + (a.y === b.y ? 0 : 2)}"/></circle>`
  }
  for (const p of placed) {
    const tip = meaning(p.name)
    body += `<g>${tip === undefined ? '' : `<title>${esc(tip)}</title>`}${box(p.x, p.y, bw, 28, pending.has(p.name) ? { dash: true, stroke: LINE } : {})}${t(p.x + bw / 2, p.y + 18, clip(p.name, bw - 8), { anchor: 'middle' })}</g>`
  }
  body += never(fact, at, bw, w) + dots
  const bottom = Math.max(...placed.map(p => p.y)) + 32
  return svg(w, bottom, body, `Animated: ${flowAlt(fact)}`)
}

const flowAlt = (fact: F['flow']) =>
  `${fact.moves.map(m => `${m.from} to ${m.to}${m.label ? ` (${m.label})` : ''}`).join('; ')}${fact.never ? `; ${fact.never.from} never reaches ${fact.never.to}` : ''}`

/** A timeline: the steps in order; the first and last quiet, the stretch between them a bar. */
export function timeline(steps: F['steps'], width: number, quiet = false): Picture {
  const w = fit(width)
  const n = steps.length
  const pad = Math.min(w / (2 * n), Math.max(textWidth(steps[0]!.what), textWidth(steps[n - 1]!.what)) / 2 + 4)
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (n - 1)
  const room = (w - 2 * pad) / (n - 1) - 6
  let body = line(x(0), 14, x(n - 1), 14, { arrow: false, stroke: REST_LINE })
  if (n >= 4) body += `<rect x="${x(1)}" y="11" width="${x(n - 2) - x(1)}" height="${quiet ? 2 : 6}" rx="${quiet ? 1 : 3}" fill="${quiet ? REST_LINE : QUIET}"/>`
  steps.forEach((s, i) => {
    const edge = i === 0 || i === n - 1
    // As a support the timeline lifts nothing, so the lead stays the one bright thing on the card.
    body += `<circle cx="${x(i)}" cy="14" r="5" fill="${edge || quiet ? QUIET : TEXT}"/>`
    body += t(x(i), 38, clip(s.when, room, SMALL), { size: SMALL, fill: QUIET, anchor: 'middle' }) + t(x(i), 54, clip(s.what, room), { anchor: 'middle', ...(quiet ? { fill: QUIET } : {}) })
  })
  return svg(w, 60, body, `Timeline: ${steps.map(s => `${s.when}, ${s.what}`).join('; ')}`)
}

/**
 * A process, top to bottom (the owner, 2026-10-29: a narrated workflow is a
 * process diagram): a spine of steps, an arrow from each to the next, each
 * step's `when` in a quiet column beside its `what`, wrapped rather than cut.
 * Nothing reaches the right edge, so a frame wider than the page's estimate
 * shows no slack.
 */
export function processDiagram(steps: F['steps'], width: number): Picture {
  const w = fitTile(width)
  const x0 = 6
  const col = Math.max(...steps.map(s => textWidth(s.when, SMALL))) + 14
  const said = steps.map(s => wrap(capital(s.what), w - 22 - col))
  const gap = 14
  let y = 14
  let body = arrowDefs
  steps.forEach((s, i) => {
    body += `<circle cx="${x0}" cy="${y - 4}" r="4" fill="${QUIET}"/>` + t(22, y, s.when, { size: SMALL, fill: QUIET })
    const [text, last] = lines(22 + col, y, said[i]!)
    body += text
    const next = last + 16 + gap
    if (i < steps.length - 1) body += line(x0, y + 4, x0, next - 12)
    y = i < steps.length - 1 ? next : last
  })
  return svg(w, y + 6, body, `Process: ${steps.map(s => `${s.when}, ${s.what}`).join('; ')}`)
}

/**
 * The second option against the first on one honest scale: how much better
 * (left) or worse (right) it does on each row, as a share of the first's value.
 * Each row prints both values, so the bar is never the only source of a number.
 */
export function diffBars(comparison: F['comparison'], width: number): Picture {
  // A row said in words ("none", "free") has no share to draw: it is the ledger's.
  const drawn = comparison.rows.filter(r => r.cells === undefined && r.values[0] !== 0)
  // The rows the recommended option wins come first, as the ledger orders them, so the bars read the way the
  // recommendation goes (the design review, 2026-10-23).
  const wins = (r: F['comparison']['rows'][number]) => {
    const best = r.better === 'lower' ? Math.min(...r.values) : Math.max(...r.values)
    return r.values.filter(v => v === best).length === 1 && r.values.indexOf(best) === comparison.recommended
  }
  const fact = { ...comparison, rows: comparison.recommended === undefined ? drawn : [...drawn.filter(wins), ...drawn.filter(r => !wins(r))] }
  const w = fit(width)
  const [a, b] = fact.options as [string, string]
  const vals = Math.max(...fact.rows.map(r => textWidth(`${fmt(r.values[0]!, r.unit)} → ${fmt(r.values[1]!, r.unit)}`))) + 8
  const x0 = Math.min(w * 0.42, Math.max(...fact.rows.map(r => textWidth(r.label))) + 10)
  const changes = fact.rows.map(r => {
    const [first, second] = r.values as [number, number]
    const raw = first === 0 ? 0 : ((second - first) / Math.abs(first)) * 100
    return r.better === 'lower' ? raw : -raw
  })
  const worst = Math.max(...changes.map(c => (c > 0 ? c : 0)), 1)
  const best = Math.max(...changes.map(c => (c < 0 ? -c : 0)), 1)
  const zero = x0 + ((w - x0 - vals) * best) / (best + worst)
  const per = (w - x0 - vals) / (best + worst)
  const rowH = 26
  const n = fact.rows.length
  // Whose better, and what a bar measures, are read before the bars (the design review, 2026-10-23).
  const top = 16
  let body =
    t(0, 12, clip(`% change from ${a} to ${b}`, w, SMALL), { size: SMALL, fill: QUIET }) +
    t(zero - 4, top + 12, '← better', { size: SMALL, fill: QUIET, anchor: 'end' }) +
    t(zero + 4, top + 12, 'worse →', { size: SMALL, fill: QUIET }) +
    line(zero, top + 18, zero, top + 22 + n * rowH, { arrow: false, stroke: LINE })
  const liftOf = (change: number) => (fact.recommended === 0 ? change > 0 : change < 0)
  const allLifted = changes.every(liftOf)
  fact.rows.forEach((r, i) => {
    const y = top + 24 + i * rowH
    const change = changes[i]!
    const len = Math.abs(change) * per
    const better = change < 0
    // White marks a row the recommended option wins; with none recommended, a row the second option improves.
    // Where every row would be white, none is: lifting all of them raises nothing (#105's design review).
    const lifted = !allLifted && liftOf(change)
    // A lifted row is white from label to value, as a lifted threshold bar is.
    body += t(0, y + 13, clip(r.label, x0 - 6), { fill: lifted ? TEXT : QUIET })
    // A row that is not lifted takes the quiet grey every picture's unlit marks share, so it reads and never outweighs the lifted one (#105's design review).
    body += `<rect x="${better ? zero - len : zero}" y="${y + 2}" width="${len}" height="14" rx="2" fill="${lifted ? TEXT : QUIET}"/>`
    body += t(w, y + 13, `${fmt(r.values[0]!, r.unit)} → ${fmt(r.values[1]!, r.unit)}`, { anchor: 'end', fill: lifted ? TEXT : QUIET })
  })
  return svg(w, top + 28 + n * rowH, body, `${b} against ${a}: ${fact.rows.map((r, i) => `${r.label} ${fmt(r.values[0]!, r.unit)} to ${fmt(r.values[1]!, r.unit)}, ${changes[i]! < 0 ? 'better' : 'worse'}`).join('; ')}`)
}

/** A comparison's value: a percentage keeps one decimal, so 3.0 stays 3.0. */
export const fmt = (n: number, unit: string) => (unit === '%' ? `${n.toFixed(1)}%` : withUnit(n, unit))

// --- The request as a whole ------------------------------------------------------

/** A log cost scale: every item's spend, the $1 cap, and a $0.01 floor below which an agent acts and reports. */
export function costScale(width: number): Picture {
  const w = fit(width)
  const lo = Math.log10(0.0001)
  const hi = Math.log10(1)
  const X = (v: number) => 20 + ((Math.log10(v) - lo) / (hi - lo)) * (w - 44)
  const floor = X(0.01)
  const mark = (v: number, label: string, row: number, colour = TEXT) =>
    `<circle cx="${X(v)}" cy="40" r="4" fill="${colour}"/>` + t(X(v), row, label, { size: SMALL, anchor: 'middle', fill: colour })
  const body =
    `<rect x="20" y="30" width="${floor - 20}" height="20" fill="${QUIET}" opacity="0.15"/>` +
    line(20, 40, w - 24, 40, { arrow: false, stroke: LINE }) +
    line(floor, 24, floor, 56, { arrow: false, stroke: TEXT }) +
    t(floor, 18, '$0.01 floor', { size: SMALL, anchor: 'middle' }) +
    mark(0.0002, 'item 1', 66) +
    mark(0.005, 'item 3', 66) +
    `<rect x="${X(0.03)}" y="37" width="${X(0.12) - X(0.03)}" height="6" rx="3" fill="${TEXT}"/>` +
    t((X(0.03) + X(0.12)) / 2, 66, 'item 2, if run', { size: SMALL, anchor: 'middle' }) +
    mark(1, '$1 cap', 18, QUIET) +
    t((20 + floor) / 2, 86, 'under the floor: act, then report', { size: SMALL, anchor: 'middle', fill: QUIET }) +
    t(w - 24, 86, 'item 4 spends nothing', { size: SMALL, anchor: 'end', fill: QUIET }) +
    (['$0.0001', '$0.001', '', '$0.1', '$1'] as const)
      .map((s, i) => (s === '' ? '' : t(X(10 ** (i - 4)), 104, s, { size: SMALL, anchor: i === 0 ? 'start' : i === 4 ? 'end' : 'middle', fill: QUIET })))
      .join('')
  return svg(w, 110, body, 'Cost on a log scale: item 1 at $0.0002 and item 3 at $0.005 sit under a $0.01 floor; item 2 would cost $0.03 to $0.12; item 4 is free; the cap is $1')
}

/**
 * The request as a local graph, as design.md's graph ruling asks: small round
 * nodes sized by degree, thin grey links, quiet labels; and, as visual-brief's
 * concept map asks, at most seven nodes with every link named. A node an item
 * rules on carries an amber ring and the item's number: it waits on the person.
 */
export function askGraph(width: number): Picture {
  const w = fit(width)
  type P = [number, number]
  const hub: P = [w * 0.4, 84]
  const tests: P = [w * 0.12, 30]
  const exp: P = [w * 0.12, 140]
  const mac: P = [w * 0.72, 30]
  const phone: P = [w * 0.72, 140]
  const apple: P = [w - 18, 84]
  const node = ([x, y]: P, r: number) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${QUIET}"/>`
  const ring = ([x, y]: P, r: number) => `<circle cx="${x}" cy="${y}" r="${r + 4}" fill="none" stroke="${SIGNAL_YELLOW}" stroke-width="1.5"/>`
  const label = (x: number, y: number, s: string, fill = QUIET, anchor: 'start' | 'middle' | 'end' = 'middle') => t(x, y, s, { size: SMALL, fill, anchor, halo: true })
  const link = (a: P, b: P, name: string) =>
    line(a[0], a[1], b[0], b[1], { arrow: false, stroke: REST_LINE }) + label((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 4, name, '#666664')
  const body =
    link(hub, tests, 'checked by') +
    link(hub, exp, 'measured by') +
    link(hub, mac, 'tried on') +
    line(mac[0], mac[1], phone[0], phone[1], { arrow: false, stroke: REST_LINE }) +
    label(mac[0] - 6, 118, 'then', '#666664', 'end') +
    node(hub, 8) +
    label(hub[0] + 14, hub[1] + 8, 'respell from screen', TEXT, 'start') +
    node(tests, 5) + ring(tests, 5) + label(tests[0], tests[1] - 14, 'item 1 · 4 tests', SIGNAL_YELLOW, 'start') +
    node(exp, 5) + ring(exp, 5) + label(exp[0], exp[1] + 24, 'item 2 · names test', SIGNAL_YELLOW, 'start') +
    node(mac, 6) + ring(mac, 6) + label(mac[0], mac[1] - 14, 'item 3 · Mac trial', SIGNAL_YELLOW) +
    node(phone, 5) + label(phone[0], phone[1] + 24, 'phone trial') +
    node(apple, 5) + ring(apple, 5) + label(apple[0] + 9, apple[1] + 26, 'item 4 · Apple', SIGNAL_YELLOW, 'end')
  return svg(w, 172, body, 'Local graph of the request: the merged respell-from-screen work is checked by item 1, measured by item 2 and tried on the Mac by item 3, then the phone; item 4, the Apple default, stands apart')
}

// --- A bitmap, and Mermaid --------------------------------------------------------

/** A shot embedded as a data-URI JPEG, which only a plain Svg draws, at the card's width. */
export function bitmap(jpegBase64: string, size: { width: number; height: number }, width: number, alt: string): Picture {
  const w = fit(width)
  const h = Math.round((w * size.height) / size.width)
  return svg(w, h, `<image x="0" y="0" width="${w}" height="${h}" href="data:image/jpeg;base64,${jpegBase64}"/>`, alt)
}

/** A Mermaid diagram rendered ahead of time to plain SVG (no foreignObject), at the card's width or its own, whichever is less. */
export function mermaid(source: string, width: number, alt: string): Picture {
  const vb = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(source)
  const [vw, vh] = vb === null ? [width, width] : [Number(vb[3]), Number(vb[4])]
  const w = Math.round(Math.min(fit(width), vw))
  const height = Math.round((w * vh) / vw)
  const root = source.replace(/<svg\b[^>]*>/, open =>
    open
      .replace(/\swidth="[^"]*"/, '')
      .replace(/\sheight="[^"]*"/, '')
      .replace(/\sstyle="[^"]*"/, '')
      .replace('<svg', `<svg width="${w}" height="${height}"`),
  )
  return { source: root, width: w, height, alt }
}

/** What a picture view reads: the item's facts and question, the card's width, the value a Highlight lifts, and the card's lead. */
export type PictureInput = { facts: Facts; question: string; room: number; lit?: number; lead?: string }

/**
 * Every view drawn as one Svg picture, by id: the one map from a view to its
 * picture, read by the queue card, the deck and the evaluation script alike.
 */
export const PICTURES: Readonly<Record<string, (p: PictureInput) => Picture>> = {
  blocks: p => blocks((p.facts as F).counts, p.room),
  units: p => units((p.facts as F).counts, p.room),
  threshold: p => threshold((p.facts as F).threshold, p.room, p.lit),
  tree: p => tree(p.question, (p.facts as F).answers, p.room),
  sankey: p => sankey((p.facts as F).parts, p.room),
  'flow-live': p => flowLive((p.facts as F).flow, p.facts.terms, p.room),
  flow: p => flow((p.facts as F).flow, p.room),
  // As a support the timeline lifts nothing, so the lead stays the one bright thing.
  timeline: p => timeline((p.facts as F).steps, p.room, p.lead !== undefined && p.lead !== 'timeline'),
  process: p => processDiagram((p.facts as F).steps, p.room),
  'diff-bars': p => diffBars((p.facts as F).comparison, p.room),
  weight: p => weight((p.facts as F).evidence, p.facts.answers?.recommend, p.room),
  reach: p => reach((p.facts as F).impact, p.facts.answers?.recommend, p.room),
  balance: p => balance((p.facts as F).tradeoffs, p.room),
  map: p => touchMap((p.facts as F).touches, p.room),
  rulings: p => rulings((p.facts as F).precedent, p.room),
}

/** Whether every picture among `views` draws its labels whole at this width: a label cut short ("nam…") misleads. */
export const drawsWhole = (views: readonly string[], p: Omit<PictureInput, 'lead'>, lead?: string) =>
  views.every(id => !(PICTURES[id]?.({ ...p, ...(lead === undefined ? {} : { lead }) }).source.includes('…') ?? false))

/** The views a card draws natively, not as one Svg; with PICTURES, every view a composed card can draw. */
export const NATIVE_VIEWS: readonly string[] = [
  'answers',
  'outcomes',
  'tiles',
  'ledger',
  'table',
  'sources',
  'glossary',
  'reveal',
  'what-if',
  'type',
  'evidence',
  'impact',
  'tradeoffs',
  'gotchas',
  'precedent',
  'touches',
]

/** Every view a composed card can draw. The sequence is drawn by Mermaid ahead of time, so no item's facts draw it yet. */
export const DRAWN_VIEWS: ReadonlySet<string> = new Set([...Object.keys(PICTURES), ...NATIVE_VIEWS])
