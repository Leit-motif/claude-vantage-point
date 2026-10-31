// The deck's snapshot (issue 81): the options around the call's empty centre, and the ADRs and
// code areas each option touches, in the decision graph's look (docs/design.md): small dots, thin
// grey links, quiet labels, colour only for a superseded ADR: the deck's option dots mark the recommendation (#107).
import type { HumanQueueDecision } from '../types'
import { esc, sfWidth } from '../panes/svg'
import { adrId } from './deck'
import { PANE, QUIET, SIGNAL_RED } from './signal'

export type Snapshot = { svg: string; width: number; height: number }

type Target = { key: string; label: string; options: number[]; superseded: boolean }
type Box = [number, number, number, number]
type Label = { lines: string[]; x: number; y: number; anchor: 'start' | 'middle' | 'end'; box: Box }

const MAX_WIDTH = 420
const SIZE = 11
const LINE = 14
const textWidth = (text: string) => sfWidth(text, SIZE)
/** Labels keep this much clear space between them, so two never read as one. */
const GAP = 6
/** A label in one line, or in two split near the middle: at a space, or after a slash in a path. */
function wrappings(text: string): string[][] {
  const spaced = text.split(' ')
  const words = spaced.length > 1 ? spaced : text.split(/(?<=\/)/)
  const join = spaced.length > 1 ? ' ' : ''
  if (words.length < 2) return [[text]]
  const cut = words.map((_, i) => i).slice(1).sort((a, b) =>
    Math.abs(textWidth(words.slice(0, a).join(join)) - textWidth(words.slice(a).join(join))) -
    Math.abs(textWidth(words.slice(0, b).join(join)) - textWidth(words.slice(b).join(join))))[0]!
  return [[text], [words.slice(0, cut).join(join), words.slice(cut).join(join)]]
}
const round = (n: number) => Math.round(n * 10) / 10
const hits = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]

/** A file's code area: its folder, the last two levels of a deep one. */
function areaOf(path: string): string {
  const folders = path.split('/').slice(0, -1)
  if (folders.length === 0) return path
  return folders.length > 3 ? folders.slice(-2).join('/') : folders.join('/')
}

function targetsOf(decision: HumanQueueDecision): Target[] {
  const byKey = new Map<string, Target>()
  decision.touches?.forEach((paths, option) => {
    for (const touch of paths) {
      const id = adrId(touch.path)
      const key = id === null ? `area:${areaOf(touch.path)}` : `adr:${id}`
      const target = byKey.get(key) ?? { key, label: id === null ? areaOf(touch.path) : `ADR ${id}`, options: [], superseded: false }
      if (!target.options.includes(option)) target.options.push(option)
      target.superseded ||= touch.superseded === true
      byKey.set(key, target)
    }
  })
  return [...byKey.values()]
}

type Node = { key: string; x: number; y: number; r: number }
type Segment = [number, number, number, number]

function labelBox(lines: string[], x: number, top: number, anchor: Label['anchor']): Label {
  const width = Math.max(...lines.map(textWidth))
  const left = anchor === 'middle' ? x - width / 2 : anchor === 'start' ? x : x - width
  return { lines, x, y: top + SIZE, anchor, box: [left - 2, top, left + width + 2, top + LINE * lines.length] }
}

/** Where a node's label may go, best first: beside it on the far side from the centre, then under or over it; in one line, then two. */
function spots(text: string, node: Node, isOption: boolean, wrapLong: boolean): Label[] {
  // Where the snapshot runs out of width, a long target label tries two lines before one; options keep one line.
  const ways = wrappings(text)
  return (wrapLong && !isOption && textWidth(text) > 90 ? [...ways].reverse() : ways).flatMap(lines => spotsIn(lines, node, isOption))
}

function spotsIn(lines: string[], node: Node, isOption: boolean): Label[] {
  const { x, y, r } = node
  const out = x >= 0 ? 1 : -1
  const tall = LINE * lines.length
  const side = (dir: number) => labelBox(lines, x + dir * (r + 5), y - tall / 2, dir > 0 ? 'start' : 'end')
  const under = (anchor: Label['anchor']) => labelBox(lines, anchor === 'middle' ? x : x - (anchor === 'start' ? 3 : -3), y + r + 3, anchor)
  const over = (anchor: Label['anchor']) => labelBox(lines, anchor === 'middle' ? x : x - (anchor === 'start' ? 3 : -3), y - r - 3 - tall, anchor)
  const inward = out > 0 ? 'end' : 'start'
  const outward = out > 0 ? 'start' : 'end'
  // Only a node straight above or below the centre labels over or under; one off to a side labels outward.
  const vertical = Math.abs(x) < 10
  // Below unless the node sits clearly above the centre; a node on the axis gets the same order on either side.
  const first = y > -1 ? under : over
  const second = y > -1 ? over : under
  // An option on the axis between two others' links takes its label centred under it, as its neighbour does.
  if (isOption && Math.abs(y) < 1) return [under('middle'), under(inward), under(outward), side(out), side(-out), over('middle'), over(inward)]
  return isOption
    ? [side(out), side(-out), first(inward), second(inward), first('middle'), second('middle')]
    : vertical
      ? [first('middle'), side(out), side(-out), second('middle'), first(inward), first(out > 0 ? 'start' : 'end')]
      : [side(out), first('middle'), second('middle'), first(inward), second(inward), side(-out)]
}

/** True when the segment passes through the box: an end inside it, or a crossing of one of its edges. */
function crosses([x1, y1, x2, y2]: Segment, [l, t, r, b]: Box): boolean {
  const inside = (x: number, y: number) => x > l && x < r && y > t && y < b
  if (inside(x1, y1) || inside(x2, y2)) return true
  const meets = (ax: number, ay: number, bx: number, by: number) => {
    const d = (x2 - x1) * (by - ay) - (y2 - y1) * (bx - ax)
    if (d === 0) return false
    const u = ((ax - x1) * (by - ay) - (ay - y1) * (bx - ax)) / d
    const v = ((ax - x1) * (y2 - y1) - (ay - y1) * (x2 - x1)) / d
    return u > 0 && u < 1 && v > 0 && v < 1
  }
  return meets(l, t, r, t) || meets(l, b, r, b) || meets(l, t, l, b) || meets(r, t, r, b)
}

/** True when two labels touch or sit closer than GAP side by side. */
const crowds = (a: Box, b: Box) => hits([a[0] - GAP, a[1], a[2] + GAP, a[3]], b)

function arrange(decision: HumanQueueDecision, targets: Target[], scale: number, wrapLong: boolean) {
  const count = decision.options.length
  // The first option left of the call and the rest round from it: two options read left to right, and the
  // snapshot stays short, since a deck page has rows to spare and few columns.
  const optionAngle = (i: number) => Math.PI + (i * 2 * Math.PI) / count
  const nodes: Node[] = [{ key: 'call', x: 0, y: 0, r: 4.5 }]
  const disc = (n: Node): Box => [n.x - n.r - 2, n.y - n.r - 2, n.x + n.r + 2, n.y + n.r + 2]
  decision.options.forEach((_, i) => nodes.push({ key: `option-${i}`, x: 72 * scale * Math.cos(optionAngle(i)), y: 72 * scale * Math.sin(optionAngle(i)), r: 4.5 }))
  const shared = targets.filter(target => target.options.length > 1)
  const balancedOf = (target: Target) =>
    Math.hypot(target.options.reduce((sum, o) => sum + Math.cos(optionAngle(o)), 0), target.options.reduce((sum, o) => sum + Math.sin(optionAngle(o)), 0)) < 0.3
  for (const target of targets) {
    const own = targets.filter(other => other.options.length === 1 && other.options[0] === target.options[0])
    let angle: number
    let radius = 125 * scale
    // A target only one option touches fans out around that option, so its links leave it shallowly.
    let [cx, cy] = [0, 0]
    if (target.options.length === 1) {
      // Two options on one axis fan their own targets upward, off the axis, leaving the space under each option
      // for its label and the axis to the call and its options alone.
      const base = optionAngle(target.options[0]!)
      const up = Math.cos(base) < 0 ? 1 : -1
      angle = count === 2
        ? base + up * (0.35 + own.indexOf(target) * Math.min(0.45, 1.2 / own.length))
        : base + (own.indexOf(target) - (own.length - 1) / 2) * Math.min(0.55, 1.6 / own.length)
      const option = nodes[target.options[0]! + 1]!
      ;[cx, cy, radius] = [option.x, option.y, 62 * scale]
    } else {
      // Shared between options: between them; when they pull evenly, in the gaps between options, in turn.
      // Two options share only the gap above the call, side by side on an arc, so the space under both
      // stays free for their labels and no link runs past another target's label.
      const sx = target.options.reduce((sum, o) => sum + Math.cos(optionAngle(o)), 0)
      const sy = target.options.reduce((sum, o) => sum + Math.sin(optionAngle(o)), 0)
      const balanced = Math.hypot(sx, sy) < 0.3
      const even = shared.filter(other => other.options.length === count || balancedOf(other))
      const n = even.indexOf(target)
      if (!balanced) {
        angle = Math.atan2(sy, sx)
        radius = 105 * scale
      } else if (count === 2) {
        angle = -Math.PI / 2 + (n - (even.length - 1) / 2) * Math.min(0.5, 2 / even.length)
        radius = 85 * scale
      } else {
        angle = optionAngle(0) + Math.PI / count + (n % count) * ((2 * Math.PI) / count)
        radius = (80 + Math.floor(n / count) * 40) * scale
      }
    }
    // One dot for every target, smaller than an option: its label says what it is and its links who touches it.
    const r = 3
    let node: Node = { key: target.key, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), r }
    for (let tries = 0; tries < 4 && nodes.some(other => hits(disc(other), disc(node))); tries++) {
      radius += 18 * scale
      node = { ...node, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
    }
    nodes.push(node)
  }
  const at = new Map(nodes.map(n => [n.key, n]))
  const segments: Segment[] = [
    ...decision.options.map((_, i) => [0, 0, at.get(`option-${i}`)!.x, at.get(`option-${i}`)!.y] as Segment),
    ...targets.flatMap(t => t.options.map(o => [at.get(`option-${o}`)!.x, at.get(`option-${o}`)!.y, at.get(t.key)!.x, at.get(t.key)!.y] as Segment)),
  ]
  const touched = (label: Label) => segments.filter(s => crosses(s, label.box)).length + nodes.filter(n => hits(disc(n), label.box)).length
  // The options' labels are chosen together, since two often want the same free space: the set fewest
  // links, dots and other labels touch, then the most preferred spots.
  type Pick = { label: Label; rank: number; cost: number }
  const choices = decision.options.map((option, i) => spots(option, at.get(`option-${i}`)!, true, wrapLong).map((label, rank): Pick => ({ label, rank, cost: touched(label) })))
  let best: { picks: Pick[]; cost: number; rank: number } | null = null
  const search = (i: number, picks: Pick[], cost: number, rank: number) => {
    if (best !== null && (cost > best.cost || (cost === best.cost && rank >= best.rank))) return
    if (i === choices.length) {
      best = { picks: [...picks], cost, rank }
      return
    }
    for (const pick of choices[i]!) {
      const overlaps = picks.filter(other => crowds(other.label.box, pick.label.box)).length
      picks.push(pick)
      search(i + 1, picks, cost + pick.cost + overlaps, rank + pick.rank)
      picks.pop()
    }
  }
  search(0, [], 0, 0)
  const labels: Label[] = best!.picks.map(pick => pick.label)
  // Then each target's label takes its first spot nothing touches; failing that, the one fewest do.
  for (const target of targets) {
    const ranked = spots(target.label, at.get(target.key)!, false, wrapLong).map(label => ({ label, clash: touched(label) + labels.filter(l => crowds(l.box, label.box)).length }))
    labels.push((ranked.find(c => c.clash === 0) ?? ranked.reduce((a, b) => (b.clash < a.clash ? b : a))).label)
  }
  const ink: Box[] = [...nodes.map(n => [n.x - n.r, n.y - n.r, n.x + n.r, n.y + n.r] as Box), ...labels.map(l => l.box)]
  const box: Box = [Math.min(...ink.map(b => b[0])), Math.min(...ink.map(b => b[1])), Math.max(...ink.map(b => b[2])), Math.max(...ink.map(b => b[3]))]
  return { nodes, labels, box }
}

/**
 * The snapshot of a decision whose options touch files, at most `maxWidth` pixels wide; null when fewer than two
 * options touch any, since one option's files say nothing the others do not, or when it cannot fit (#123).
 */
export function snapshot(decision: HumanQueueDecision, maxWidth = MAX_WIDTH): Snapshot | null {
  const targets = targetsOf(decision)
  if (new Set(targets.flatMap(target => target.options)).size < 2) return null
  let scale = 1
  // Too wide: first wrap the long labels, then draw the graph smaller.
  const tooWide = (box: Box) => box[2] - box[0] > maxWidth - 2
  let laid = arrange(decision, targets, scale, false)
  if (tooWide(laid.box)) laid = arrange(decision, targets, scale, true)
  while (tooWide(laid.box) && scale > 0.5) laid = arrange(decision, targets, (scale *= 0.92), true)
  if (tooWide(laid.box)) return null
  const { nodes, box } = laid
  // The left edge lines up with the deck's text: the leftmost ink, not its label's padding, sits on it.
  const { labels } = laid
  const left = Math.min(...nodes.map(n => n.x - n.r), ...labels.map(label => label.box[0] + 2))
  const dx = -left
  const dy = 1 - box[1]
  const width = Math.ceil(box[2] - left + 1)
  const height = Math.ceil(box[3] - box[1] + 2)
  const at = new Map(nodes.map(n => [n.key, { x: round(n.x + dx), y: round(n.y + dy), r: n.r }]))
  const link = (from: string, to: string, red: boolean) => {
    const a = at.get(from)!
    const b = at.get(to)!
    const paint = red ? `stroke="${SIGNAL_RED}" stroke-width=".9"` : `stroke="${QUIET}" stroke-opacity=".42" stroke-width=".9"`
    // A link that would run through another dot bows around it, so it never reads as that dot's link.
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const blocking = [...at].filter(([key]) => key !== from && key !== to).map(([, n]) => {
      const t = Math.max(0, Math.min(1, ((n.x - a.x) * (b.x - a.x) + (n.y - a.y) * (b.y - a.y)) / (length * length)))
      return { n, gap: Math.hypot(a.x + t * (b.x - a.x) - n.x, a.y + t * (b.y - a.y) - n.y) }
    }).filter(({ n, gap }) => gap < n.r + 5).sort((p, q) => p.gap - q.gap)[0]
    if (blocking === undefined) return `<line data-link="${esc(`${from} to ${to}`)}" ${paint} x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`
    const [nx, ny] = [-(b.y - a.y) / length, (b.x - a.x) / length]
    const away = (blocking.n.x - (a.x + b.x) / 2) * nx + (blocking.n.y - (a.y + b.y) / 2) * ny > 0 ? -1 : 1
    const bow = (blocking.n.r + 14) * 2 * away
    const cx = round((a.x + b.x) / 2 + nx * bow)
    const cy = round((a.y + b.y) / 2 + ny * bow)
    return `<path data-link="${esc(`${from} to ${to}`)}" ${paint} fill="none" d="M${a.x} ${a.y}Q${cx} ${cy} ${b.x} ${b.y}"/>`
  }
  const lines = targets.flatMap(target => target.options.map(o => link(`option-${o}`, target.key, target.superseded)))
  // The call holds the layout's centre but draws nothing: the heading names it, and a blank dot between the options
  // read as a third one (#123's design review). Every node is quiet, colour kept for a superseded ADR (#108), and
  // sized by its links, as Obsidian's graph sizes them (ADR 0026).
  const degree = (key: string) => targets.reduce((sum, target) =>
    sum + (key === target.key ? target.options.length : target.options.filter(o => key === `option-${o}`).length), 0)
  const dots = [...at].filter(([key]) => key !== 'call').map(([key, n]) =>
    `<circle data-node="${esc(key)}" fill="${QUIET}" cx="${n.x}" cy="${n.y}" r="${round(2.5 + Math.min(4, degree(key)) * 0.6)}"/>`)
  const texts = labels.map(l => {
    const x = round(l.x + dx)
    const lines = l.lines.map((line, i) => (i === 0 ? esc(line) : `<tspan x="${x}" dy="${LINE}">${esc(line)}</tspan>`))
    return `<text text-anchor="${l.anchor}" x="${x}" y="${round(l.y + dy)}">${lines.join('')}</text>`
  })
  const style = `text{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;font-size:${SIZE}px;fill:${QUIET};paint-order:stroke;stroke:${PANE};stroke-width:5px;stroke-linejoin:round}`
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>${style}</style>${lines.join('')}${dots.join('')}${texts.join('')}</svg>`,
    width,
    height,
  }
}
