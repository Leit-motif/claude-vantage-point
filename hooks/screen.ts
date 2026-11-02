// The pane's picture: the Human Queue v2 prototype (artifact B57JrkrgGGCm6SLWa7eEqF)
// drawn as SVG, its palette and metrics taken from the prototype's stylesheet.
// The desktop, the phone and VS Code draw it as an image, so it carries no
// presses: the slim row of keyed Buttons under it does the work.

import type { Verdict } from '../panes/human-queue/queue.ts'
import { esc } from '../panes/svg.ts'

export type ScreenItem = { index: number; heading: string; text: string; verdict: Verdict | null; comment: string | null }
export type ScreenRequest = { title: string; where: string; setup: string; note: string | null; items: ScreenItem[] }
export type ScreenBucket = { name: string; asks: number; next: string; done: boolean[] }

export type PlateScreen = { kind: 'plate'; buckets: ScreenBucket[]; held: number }
export type EmptyScreen = { kind: 'empty'; held: number }
export type AskScreen = {
  kind: 'ask'
  bucket: string
  position: number
  of: number
  request: ScreenRequest
  /** 0 is the setup slide when the request has one; items are 1..n. */
  slide: number
}
export type Screen = PlateScreen | EmptyScreen | AskScreen

const W = 420
const C = {
  bg: '#151515', head: '#1a1a19', raised: '#212121', line: '#2a2a2a', track: '#343434',
  ink: '#f0efec', dim: '#898781', yes: '#96de81', warn: '#dec281', no: '#de8481',
}
const FONT = `system-ui, -apple-system, 'Segoe UI', sans-serif`
const MONO = `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`

/** Rough advance of system-ui at a size: wide enough that lines never overrun. */
const advance = (size: number, weight = 400) => size * (weight >= 600 ? 0.56 : 0.53)

/** Greedy word wrap to `width` pixels; the last kept line ends in … when cut. */
export function wrap(text: string, width: number, size: number, maxLines: number, weight = 400): string[] {
  const per = Math.max(4, Math.floor(width / advance(size, weight)))
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line === '' ? word : `${line} ${word}`
    if (next.length <= per) {
      line = next
      continue
    }
    if (line !== '') lines.push(line)
    line = word.length > per ? `${word.slice(0, per - 1)}…` : word
    if (lines.length === maxLines) break
  }
  if (line !== '' && lines.length < maxLines) lines.push(line)
  const used = lines.slice(0, maxLines).join(' ').split(' ').length
  if (used < words.length && lines.length > 0) {
    const last = lines[lines.length - 1] as string
    lines[lines.length - 1] = `${last.length >= per ? last.slice(0, per - 1) : last}…`
  }
  return lines
}

const text = (x: number, y: number, s: string, size: number, fill: string, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(s)}</text>`
const rect = (x: number, y: number, w: number, h: number, r: number, fill: string, stroke = 'none', sw = 1) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
const kbd = (x: number, y: number, k: string) => {
  const w = Math.max(15, k.length * 6.5 + 8)
  return `${rect(x, y - 11, w, 15, 4, 'none', C.line)}${text(x + w / 2, y, k, 10, C.dim, `font-family="${MONO}" text-anchor="middle"`)}`
}
const tint = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

function frame(h: number, bar: string, body: string, keys: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" font-family="${FONT}">`,
    rect(0, 0, W, h, 0, C.bg),
    rect(0, 0, W, 34, 0, C.head),
    `<line x1="0" y1="34.5" x2="${W}" y2="34.5" stroke="${C.line}"/>`,
    bar,
    body,
    keys === '' ? '' : rect(0, h - 28, W, 28, 0, C.head),
    keys === '' ? '' : `<line x1="0" y1="${h - 28.5}" x2="${W}" y2="${h - 28.5}" stroke="${C.line}"/>`,
    keys,
    '</svg>',
  ].join('')
}

function plate(s: PlateScreen, h: number): string {
  const bar = `${text(10, 22, 'Human Queue', 13, C.ink, 'font-weight="600"')}${text(106, 22, 'your plate', 12, C.dim)}`
  const asks = s.buckets.reduce((n, b) => n + b.asks, 0)
  let body = text(12, 62, `${asks} ${asks === 1 ? 'ask' : 'asks'} · ${s.buckets.length} ${s.buckets.length === 1 ? 'repo' : 'repos'}`, 16, C.ink, 'font-weight="600"')
  let y = 78
  const rowH = 62
  const room = h - 40 - y
  const shown = s.buckets.slice(0, Math.max(1, Math.floor(room / (rowH + 6))))
  shown.forEach((b, i) => {
    body += rect(12, y, W - 24, rowH, 8, C.raised, C.line)
    body += kbd(22, y + 22, String(i + 1))
    body += text(50, y + 22, wrap(b.name, 250, 13, 1, 600)[0] ?? '', 13, C.ink, 'font-weight="600"')
    body += text(W - 22, y + 22, `${b.asks} ${b.asks === 1 ? 'ask' : 'asks'}`, 12, C.ink, 'text-anchor="end"')
    body += text(50, y + 40, wrap(b.next, W - 84, 11.5, 1)[0] ?? '', 11.5, C.dim)
    const segs = Math.max(1, b.done.length)
    const sw = (W - 84 - (segs - 1) * 2) / segs
    b.done.forEach((d, j) => (body += rect(50 + j * (sw + 2), y + 50, sw, 4, 2, d ? C.yes : C.track)))
    y += rowH + 6
  })
  // Nothing sits on the bottom edge: the pane may clip it, and the digit buttons
  // under the picture already say what opens a repo.
  if (shown.length < s.buckets.length) {
    body += text(12, y + 14, `${s.buckets.length - shown.length} more repos below 9`, 11, C.dim)
    y += 20
  }
  if (s.held > 0) body += text(12, y + 14, `${s.held} tickets held until an agent distills them into decisions`, 11, C.dim)
  return frame(h, bar, body, '')
}

function empty(s: EmptyScreen, h: number): string {
  const bar = `${text(10, 22, 'Human Queue', 13, C.ink, 'font-weight="600"')}${text(106, 22, 'your plate', 12, C.dim)}`
  // Set from the top, not centred: the pane may clip the bottom.
  let body = text(12, 90, 'Nothing waiting on you.', 19, C.ink, 'font-weight="600"')
  if (s.held > 0) body += text(12, 116, `${s.held} tickets held until an agent distills them.`, 12.5, C.dim)
  return frame(h, bar, body, '')
}

function ask(s: AskScreen, h: number): string {
  const r = s.request
  const slides = Math.max(1, r.items.length)
  const item = r.items.length === 0 ? null : (r.items[s.slide - 1] ?? null)
  const here = r.items.length === 0 ? 0 : s.slide - 1
  // A pair's A, B and Same count with the yeses: answered, and none of them a no (#125).
  const no = r.items.filter(i => i.verdict === 'no').length
  const yes = r.items.filter(i => i.verdict !== null && i.verdict !== 'no').length
  const left = r.items.length - yes - no
  const tone = (v: Verdict | null | undefined, none: string) => (v === 'no' ? C.no : v == null ? none : C.yes)

  let bar = text(10, 22, wrap(s.bucket, 260, 12, 1)[0] ?? '', 12, C.dim)
  bar += text(W - 10, 22, `${s.position} of ${s.of}`, 12, C.dim, 'text-anchor="end"')

  let body = ''
  const segW = (W - 24 - (slides - 1) * 2) / slides
  for (let i = 0; i < slides; i++) {
    const it = r.items[i] ?? null
    // Where you are is a solid fill in the text's own near-white, no outline; ruled
    // items keep their green or red, and the card's pill says the current verdict.
    const fill = i === here ? C.ink : tone(it?.verdict, C.track)
    body += rect(12 + i * (segW + 2), 45, segW, 4, 2, fill)
  }
  let ty = 66
  body += `<text x="12" y="${ty}" font-size="12" fill="${C.dim}"><tspan fill="${C.ink}" font-weight="600">${here + 1}</tspan> of ${slides}`
  if (r.items.length > 0) body += `<tspan dx="10" fill="${C.yes}">✓ ${yes}</tspan><tspan dx="8" fill="${C.no}">✗ ${no}</tspan><tspan dx="8">${left} left</tspan>`
  body += '</text>'

  const title = wrap(r.title, W - 24, 15, 2, 600)
  ty = 90
  for (const line of title) {
    body += text(12, ty, line, 15, C.ink, 'font-weight="600"')
    ty += 20
  }
  body += text(12, ty - 3, r.where, 11.5, C.dim)

  // The card is as tall as what it holds: the request's lead-in, dim, then the
  // item, then its comment. Every item draws the same parts in the same order.
  const cardTop = ty + 10
  const accent = tone(item?.verdict, C.line)
  const label = item ? `#${item.index} of ${r.items.length} · ${item.heading}` : 'Plain ask'
  const pill = item ? (item.verdict === null ? 'Not ruled' : ({ yes: 'Yes', no: 'No', a: 'A', b: 'B', same: 'Same' } as const)[item.verdict]) : 'To do'
  let inner = text(23, cardTop + 20, wrap(label, 260, 10.5, 1)[0] ?? '', 10.5, C.dim, `font-family="${MONO}"`)
  inner += text(W - 23, cardTop + 20, pill, 11.5, tone(item?.verdict, C.dim), 'text-anchor="end"')
  let cy = cardTop + 44
  if (item && r.setup !== '') {
    for (const line of wrap(r.setup, W - 46, 12.5, 6)) {
      inner += text(23, cy, line, 12.5, C.dim)
      cy += 18
    }
    cy += 8
  }
  const content = item ? item.text : r.setup || r.title
  for (const line of wrap(content, W - 46, 14.5, 30)) {
    inner += text(23, cy, line, 14.5, C.ink)
    cy += 22
  }
  const comment = item ? item.comment : r.note
  if (comment) {
    inner += text(23, cy + 4, `“${wrap(comment, W - 60, 12, 1)[0] ?? ''}”`, 12, C.dim, 'font-style="italic"')
    cy += 22
  }
  const cardBottom = cy - 4
  body += rect(12, cardTop, W - 24, cardBottom - cardTop, 8, C.raised, item?.verdict ? tint(accent, 0.5) : C.line) + inner

  // The frame's background runs the full height the pane gives it, whatever the
  // card holds: room under the card, to the controls, never a short picture.
  return frame(Math.max(h, cardBottom + 12), bar, body, '')
}

/** The screen as one SVG document, `height` CSS pixels tall at 420 wide. */
export function screenSvg(screen: Screen, height: number): string {
  const h = Math.max(320, Math.min(1400, Math.round(height)))
  if (screen.kind === 'plate') return plate(screen, h)
  if (screen.kind === 'empty') return empty(screen, h)
  return ask(screen, h)
}
