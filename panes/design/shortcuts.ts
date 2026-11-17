// The design system's number shortcuts (spec 181): an argument with a table of numbers names a form
// and passes the table, and gets a correct chart drawn from the same primitives, its height computed.
// Easel's five forms are the reference; the drawing is ours. Any choice left open is refused with the
// columns found. Pure.
import { esc, sfWidth } from '../svg.ts'
import { DESIGN_WIDTH } from '../visuals/picture.ts'

export const FORMS = ['bars', 'columns', 'line', 'sparks', 'share'] as const
export type Form = (typeof FORMS)[number]

/** What each form is for, as the decide tool's brief names it. */
export const FORM_JOBS: Record<Form, string> = {
  bars: 'a few values compared, horizontal bars from zero (2 to 8 rows)',
  columns: 'values along an ordered x, vertical bars from zero (2 to 12)',
  line: 'change over an ordered x, one to four series',
  sparks: 'several series side by side, a small line each with its last value (2 to 6)',
  share: 'parts of one whole, one stacked bar (2 to 6 parts)',
}

export type Shortcut = { form: Form; data: Record<string, string | number>[]; x: string; y: string | string[]; highlight?: string | number }
export type Drawn = { html: string; height: number }

const LIMITS: Record<Form, [number, number]> = { bars: [2, 8], columns: [2, 12], line: [2, 40], sparks: [2, 40], share: [2, 6] }
const MAX_SERIES: Record<Form, number> = { bars: 1, columns: 1, line: 4, sparks: 6, share: 1 }

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null

/** A number as a label: as given, to at most two decimals, thousands grouped. */
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

/** Whether `value` reads as an exhibit's shortcut rather than an HTML picture. */
export const isShortcut = (value: unknown): boolean => object(value)?.form !== undefined

/** The chart a shortcut draws, or every reason it is refused, each naming the columns found. */
export function drawShortcut(value: unknown): Drawn | { refused: string[] } {
  const given = object(value)
  const form = given?.form
  if (typeof form !== 'string' || !(FORMS as readonly string[]).includes(form)) {
    return { refused: [`form is ${JSON.stringify(form)}: name one of ${FORMS.join(', ')}`] }
  }
  const f = form as Form
  const rows = Array.isArray(given!.data) ? given!.data.map(object) : null
  if (rows === null || rows.length === 0 || rows.includes(null)) return { refused: ['data is not a list of rows: pass [{column: value, ...}, ...]'] }
  const table = rows as Record<string, unknown>[]
  const columns = [...new Set(table.flatMap(row => Object.keys(row)))]
  const found = `the columns found are ${columns.map(one => `"${one}"`).join(', ')}`
  const reasons: string[] = []
  const x = given!.x
  if (typeof x !== 'string' || !columns.includes(x)) reasons.push(`x is ${JSON.stringify(x)}: name the column the rows are labelled or ordered by; ${found}`)
  const ys = typeof given!.y === 'string' ? [given!.y] : Array.isArray(given!.y) && given!.y.every(one => typeof one === 'string') ? given!.y as string[] : null
  if (ys === null || ys.length === 0) reasons.push(`y is ${JSON.stringify(given!.y)}: name the numeric column (or, for line and sparks, a list of them); ${found}`)
  else {
    const missing = ys.filter(one => !columns.includes(one))
    if (missing.length > 0) reasons.push(`y names ${missing.map(one => `"${one}"`).join(', ')}, not a column; ${found}`)
    const words = ys.filter(one => columns.includes(one) && table.some(row => typeof row[one] !== 'number' || !Number.isFinite(row[one])))
    if (words.length > 0) reasons.push(`y column ${words.map(one => `"${one}"`).join(', ')} holds a value that is not a number in some row: pass numbers, not text`)
    if (ys.length > MAX_SERIES[f]) reasons.push(`${f} draws at most ${MAX_SERIES[f]} series, and y names ${ys.length}: pick the ones the claim compares`)
  }
  const [least, most] = LIMITS[f]
  if (table.length < least || table.length > most) reasons.push(`${f} draws ${least} to ${most} rows, and data has ${table.length}: ${table.length > most ? 'group or cut the rows' : 'add rows, or put the number in the claim'}`)
  if (f === 'bars' || f === 'columns' || f === 'share') {
    const negative = ys?.find(one => table.some(row => typeof row[one] === 'number' && (row[one] as number) < 0))
    if (negative !== undefined) reasons.push(`${f} measures from zero, and "${negative}" has a negative value: use line for values below zero`)
  }
  const labels = typeof x === 'string' ? table.map(row => String(row[x] ?? '')) : []
  const highlight = given!.highlight
  if (highlight !== undefined && !labels.includes(String(highlight))) {
    reasons.push(`highlight is ${JSON.stringify(highlight)}, which is no row's ${JSON.stringify(x)}: name one of ${labels.map(one => JSON.stringify(one)).join(', ')}`)
  }
  if (reasons.length > 0) return { refused: reasons }
  const lit = labels.indexOf(String(highlight))
  const series = ys!.map(name => ({ name, values: table.map(row => row[name] as number) }))
  return DRAW[f](labels, series, highlight === undefined ? -1 : lit)
}

type Series = { name: string; values: number[] }
type Draw = (labels: string[], series: Series[], lit: number) => Drawn

const hl = (on: boolean) => (on ? ' highlight' : '')

/** Horizontal bars from zero: a grid of label, track with its bar, and value. */
function bars(labels: string[], [one]: Series[], lit: number): Drawn {
  const top = Math.max(...one!.values, 0) || 1
  const rows = labels.map((label, i) => {
    const v = one!.values[i]!
    const share = Math.max((v / top) * 100, v > 0 ? 1 : 0)
    return `<span class="label">${esc(label)}</span>` +
      `<div class="row gap-2"><div class="track grow"><div class="bar${hl(lit === i)}" style="width:${share.toFixed(1)}%"></div></div>` +
      `<span class="label" style="min-width:40px">${esc(fmt(v))}</span></div>`
  })
  return { html: `<div class="grid" style="row-gap:8px">${rows.join('')}</div>`, height: labels.length * 18 + (labels.length - 1) * 8 + 2 }
}

const W = DESIGN_WIDTH
const PLOT = { left: 34, right: 8, top: 22, bottom: 22 }

/** The y scale for a chart from zero (or from the least value, for a line that dips below it). */
function scale(values: number[], fromZero: boolean, height: number) {
  const hi = Math.max(...values, fromZero ? 0 : -Infinity)
  const lo = fromZero ? 0 : Math.min(...values)
  const span = hi - lo || 1
  const inner = height - PLOT.top - PLOT.bottom
  return { y: (v: number) => PLOT.top + inner - ((v - lo) / span) * inner, hi, lo }
}

const axisLabels = (s: { y: (v: number) => number; hi: number; lo: number }) =>
  [s.lo, s.hi].map(v => `<text class="label" x="${PLOT.left - 6}" y="${s.y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`).join('') +
  `<line class="tick" x1="${PLOT.left}" x2="${W - PLOT.right}" y1="${s.y(s.lo)}" y2="${s.y(s.lo)}"/>`

/** x labels under the plot, thinned so they never collide; the highlighted one always kept. */
function xLabels(labels: string[], at: (i: number) => number, lit: number): string {
  const every = Math.max(1, Math.ceil(labels.length / 6))
  const shown = labels.map((_, i) => i === lit || ((i % every === 0 || i === labels.length - 1) && (lit < 0 || Math.abs(i - lit) >= every)))
  for (let i = labels.length - 1, prev = Infinity; i >= 0; i--) {
    if (!shown[i]) continue
    if (prev - i < every && i !== lit) shown[i] = false
    else prev = i
  }
  return labels.map((label, i) => shown[i] ? `<text class="label" x="${at(i)}" y="${CHART_H - 6}" text-anchor="middle">${esc(label)}</text>` : '').join('')
}

const CHART_H = 140

function columns(labels: string[], [one]: Series[], lit: number): Drawn {
  const s = scale(one!.values, true, CHART_H)
  const slot = (W - PLOT.left - PLOT.right) / labels.length
  const width = Math.min(36, slot * 0.7)
  const at = (i: number) => PLOT.left + slot * (i + 0.5)
  const cols = one!.values.map((v, i) => `<rect class="bar${hl(lit === i)}" x="${(at(i) - width / 2).toFixed(1)}" y="${s.y(v).toFixed(1)}" width="${width.toFixed(1)}" height="${(s.y(0) - s.y(v)).toFixed(1)}" rx="2"/>`).join('')
  const value = lit >= 0 ? `<text class="value" x="${at(lit)}" y="${s.y(one!.values[lit]!) - 5}" text-anchor="middle" style="font-size:13px">${esc(fmt(one!.values[lit]!))}</text>` : ''
  return { html: `<svg width="${W}" height="${CHART_H}" viewBox="0 0 ${W} ${CHART_H}">${axisLabels(s)}${cols}${value}${xLabels(labels, at, lit)}</svg>`, height: CHART_H }
}

function line(labels: string[], series: Series[], lit: number): Drawn {
  const all = series.flatMap(one => one.values)
  const s = scale(all, Math.min(...all) >= 0, CHART_H)
  const legend = series.length > 1
  const right = legend ? 70 : PLOT.right
  const step = (W - PLOT.left - right) / Math.max(1, labels.length - 1)
  const at = (i: number) => PLOT.left + step * i
  const lines = series.map((one, n) => {
    const points = one.values.map((v, i) => `${at(i).toFixed(1)},${s.y(v).toFixed(1)}`).join(' ')
    const lead = n === 0
    const last = one.values.length - 1
    return `<polyline class="edge${lead ? '' : ' dim'}" points="${points}"/>` +
      (legend ? `<text class="label" x="${at(last) + 6}" y="${s.y(one.values[last]!) + 4}">${esc(one.name)}</text>` : '')
  }).join('')
  const point = lit >= 0
    ? `<circle class="dot highlight" cx="${at(lit)}" cy="${s.y(series[0]!.values[lit]!)}" r="4"/>` +
      `<text class="value" x="${at(lit)}" y="${s.y(series[0]!.values[lit]!) - 8}" text-anchor="middle" style="font-size:13px">${esc(fmt(series[0]!.values[lit]!))}</text>`
    : ''
  return { html: `<svg width="${W}" height="${CHART_H}" viewBox="0 0 ${W} ${CHART_H}">${axisLabels(s)}${lines}${point}${xLabels(labels, at, lit)}</svg>`, height: CHART_H }
}

/** A row per series: its name, a small line over x, and its last value. */
function sparks(labels: string[], series: Series[], lit: number): Drawn {
  const rowH = 26
  const name = 96
  const valueW = 56
  const plotW = W - name - valueW - 8
  const rows = series.map((one, n) => {
    const lo = Math.min(...one.values)
    const span = Math.max(...one.values) - lo || 1
    const y0 = n * rowH
    const at = (i: number) => name + (plotW * i) / Math.max(1, labels.length - 1)
    const y = (v: number) => y0 + 4 + (rowH - 10) * (1 - (v - lo) / span)
    const last = one.values.length - 1
    return `<text class="label" x="0" y="${y0 + rowH / 2 + 4}">${esc(one.name)}</text>` +
      `<polyline class="edge" points="${one.values.map((v, i) => `${at(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>` +
      (lit >= 0 ? `<circle class="dot${hl(n === 0)}" cx="${at(lit)}" cy="${y(one.values[lit]!)}" r="2.5"/>` : `<circle class="dot" cx="${at(last)}" cy="${y(one.values[last]!)}" r="2.5"/>`) +
      `<text class="label" x="${W}" y="${y0 + rowH / 2 + 4}" text-anchor="end">${esc(fmt(one.values[lit >= 0 ? lit : last]!))}</text>`
  }).join('')
  const height = series.length * rowH
  return { html: `<svg width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">${rows}</svg>`, height }
}

/** Parts of one whole: one stacked bar, the highlighted part in the accent and the rest in neutral steps, a legend under it. */
function share(labels: string[], [one]: Series[], lit: number): Drawn {
  const total = one!.values.reduce((a, b) => a + b, 0) || 1
  const steps = ['1', '0.75', '0.55', '0.4', '0.3', '0.22']
  let x = 0
  const parts = one!.values.map((v, i) => {
    const w = (v / total) * W
    const rect = `<rect class="bar${hl(lit === i)}" x="${x.toFixed(1)}" y="0" width="${Math.max(w - 2, 0).toFixed(1)}" height="14" rx="2"${lit === i ? '' : ` style="opacity:${steps[i % steps.length]}"`}/>`
    x += w
    return rect
  }).join('')
  const texts = labels.map((label, i) => `${label} ${fmt(Math.round((one!.values[i]! / total) * 100))}%`)
  const legend = texts.map((text, i) =>
    `<div class="row gap-1"><span class="dot" style="${lit === i ? 'background:var(--accent)' : `opacity:${steps[i % steps.length]}`}"></span><span class="label">${esc(text)}</span></div>`).join('')
  // The legend wraps as the browser wraps it: each item a 10px dot, 4px, its label at 12px, 16px between items.
  let lines = 1
  let used = 0
  for (const text of texts) {
    const width = 14 + Math.ceil(sfWidth(text, 12)) + 2
    if (used > 0 && used + 16 + width > W) {
      lines += 1
      used = width
    } else used += (used > 0 ? 16 : 0) + width
  }
  return { html: `<div class="col gap-2"><svg width="${W}" height="14" viewBox="0 0 ${W} 14">${parts}</svg><div class="row gap-3" style="flex-wrap:wrap;row-gap:4px">${legend}</div></div>`, height: 14 + 8 + lines * 18 + (lines - 1) * 4 }
}

const DRAW: Record<Form, Draw> = { bars, columns, line, sparks, share }
