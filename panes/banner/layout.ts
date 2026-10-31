// Where the banner's nodes stand (issue 119): ADR 0026's graph at the scale of Obsidian's graph
// banner, made to stay put. The ADRs' labels are laid along the top row first, each as near its
// column's middle (the outer two, the strip's edges) as keeps every label 16pt from the next; each
// ADR then holds a column around its diamond, as wide as its share of the files, in the order the
// ADRs came, its files hanging at their own depths within it; a file no ADR binds stands toward the
// trailing edge, under no diamond and clear of every tree. A node placed once keeps its place: a new one takes the free spot nearest its
// target that keeps its label clear of every other label and of every link, or waits off the strip.
// Pure and seeded, so the same session draws the same picture on every redraw (docs/design.md, rule 9).

export type NodeKind = 'file' | 'adr'

/**
 * What the layout needs of a node: its label's width and the radius its mark is cleared for, for a
 * file the ADR it links to, and its rank, 0 for the file edited last: when the strip is full, the
 * file edited longest ago gives up its place first.
 */
export type Spec = { id: string; kind: NodeKind; labelWidth: number; radius: number; link: string | null; rank: number }

/** A column: the ADR whose files it holds, and its span across the picture. */
export type Column = [key: string, lo: number, hi: number]

/**
 * Each node's place, and the label width and radius it was cleared for, in a picture `width` by
 * `height`; `left`, the files no spot was left for; `cols`, the columns in their order.
 */
export type Placed = { width: number; height: number; at: Record<string, { x: number; y: number; w: number; r: number }>; left: string[]; cols: Column[] }

/** A file's label hangs this far below its dot's centre, clear of the largest dot, an ADR's this far above its mark's top (baselines). */
export const FILE_LABEL_DY = 18.5
export const ADR_LABEL_GAP = 6
/** Above a baseline, the type's cap height; below it, its descent: 11.5px SF. */
const ASCENT = 9
export const DESCENT = 3
/** Clear space kept between two labels. */
const GAP = 6
/**
 * Labels whose baselines stand within `SAME_LINE` of each other read as one line, so they keep
 * `LINE_GAP` apart: well past the 6 between a name and its counts, or two names read as one. Two
 * labels 8.5pt apart read as one line on the desktop (round 4's `steps.ts` beside `index.d.ts`).
 */
const SAME_LINE = 10
const LINE_GAP = 16
/** How far a file no ADR binds keeps from every other file and every link, so it reads as no tree's. */
export const LOOSE_GAP = 24
/** The clear space above and below the picture; across, the outermost labels meet its edges and their halo runs past. */
export const EDGE = 4
/** Where the ADRs' diamonds stand, their labels above them at the top edge, and the highest a file's box reaches, a gap under them. */
const ADR_ROW = EDGE + ASCENT + ADR_LABEL_GAP + 5
const FILE_TOP = ADR_ROW + 5 + GAP
/** The grid a node looks for a free spot on, in pixels. */
const STEP = 3
/** The farthest a placed file moves when its label grows: two steps of the grid, and one across. */
const NUDGE = 7
/** Half the farthest across a new file's target stands from its ADR. */
const REACH = 110
/** Each column's first file takes the golden ratio's next step down the strip, so no two trees hang at one depth. */
const GOLDEN = 0.618034

export type Box = [number, number, number, number]
/** What a node takes: its box, and its label's baseline. */
type Mark = { box: Box; base: number }
type Segment = [number, number, number, number]
/** A node being placed. */
type Body = { spec: Spec; x: number; y: number }

/** The space a node takes: its dot and its label, a file's below, an ADR's above. */
export function boxOf(spec: Pick<Spec, 'kind' | 'labelWidth' | 'radius'>, x: number, y: number): Box {
  const half = Math.max(spec.labelWidth / 2, spec.radius)
  if (spec.kind === 'file') return [x - half, y - spec.radius, x + half, y + FILE_LABEL_DY + DESCENT]
  return [x - half, y - spec.radius - ADR_LABEL_GAP - ASCENT, x + half, y + spec.radius]
}

const markOf = (spec: Pick<Spec, 'kind' | 'labelWidth' | 'radius'>, x: number, y: number): Mark => ({
  box: boxOf(spec, x, y),
  base: spec.kind === 'file' ? y + FILE_LABEL_DY : y - spec.radius - ADR_LABEL_GAP,
})

/** Whether two marks come closer than they must keep: `gap` up and down, and across too unless their labels share a line. */
function clash(a: Mark, b: Mark, gap = GAP): boolean {
  // A claim's extra hair widens the line too, so a baseline rounded to a tenth never lands on it.
  const across = Math.abs(a.base - b.base) <= SAME_LINE + (gap - GAP) ? LINE_GAP + (gap - GAP) : gap
  return a.box[0] < b.box[2] + across && b.box[0] < a.box[2] + across && a.box[1] < b.box[3] + gap && b.box[1] < a.box[3] + gap
}
/** A spot is claimed with a hair more than the gap, so rounding a place to a tenth never closes it. */
const HAIR = 0.2

/** How far a link keeps off a label's box, so it never seems to touch a glyph. */
const LINK_CLEAR = 3

/** Whether the segment runs through the box, or within `clear` of it: Liang-Barsky's clip leaves some of it inside. */
function crosses([x1, y1, x2, y2]: Segment, box: Box, clear = LINK_CLEAR): boolean {
  const [bx0, by0, bx1, by1] = [box[0] - clear, box[1] - clear, box[2] + clear, box[3] + clear]
  let t0 = 0
  let t1 = 1
  const dx = x2 - x1
  const dy = y2 - y1
  for (const [p, q] of [[-dx, x1 - bx0], [dx, bx1 - x1], [-dy, y1 - by0], [dy, by1 - y1]] as const) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 >= t1) return false
  }
  return true
}

/** A string's seed: FNV-1a. */
function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** A seeded generator in [0, 1): mulberry32. */
function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const within = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v))
const frac = (v: number) => v - Math.floor(v)
/** The column a node stands in: its ADR's; none for a file no ADR binds. */
const keyOf = (spec: Spec) => (spec.kind === 'adr' ? spec.id : spec.link)
const loose = (spec: Spec) => spec.kind === 'file' && spec.link === null
const halfOf = (spec: Pick<Spec, 'labelWidth' | 'radius'>) => Math.max(spec.labelWidth / 2, spec.radius)

/** The centres across that keep a node's box inside the span; its middle alone when the box is wider. */
function across(spec: Spec, [lo, hi]: [number, number], width: number): [number, number] {
  const half = halfOf(spec)
  if (lo + half <= hi - half) return [lo + half, hi - half]
  // A span narrower than its label centres it, but never past the strip's edge, which cuts it.
  const mid = Math.min(Math.max((lo + hi) / 2, half), width - half)
  return [mid, mid]
}

/** The depths a file's dot may stand at: its box below the ADRs' row and above the bottom edge. */
const depths = (spec: Spec, height: number): [number, number] => [FILE_TOP + spec.radius, height - EDGE - FILE_LABEL_DY - DESCENT]

/**
 * Each column's share of `width` by its weight, none narrower than it needs where the width allows:
 * the boundaries, 0 first and `width` last.
 */
function shares(cols: readonly { weight: number; need: number }[], width: number): number[] {
  const needed = cols.reduce((t, c) => t + c.need, 0)
  const need = cols.map(c => (needed > width ? (c.need * width) / needed : c.need))
  const pinned = new Set<number>()
  let widths: number[] = []
  for (;;) {
    const free = width - [...pinned].reduce((t, i) => t + (need[i] as number), 0)
    const weight = cols.reduce((t, c, i) => t + (pinned.has(i) ? 0 : c.weight), 0)
    widths = cols.map((c, i) => (pinned.has(i) ? (need[i] as number) : (free * c.weight) / weight))
    const short = widths.flatMap((w, i) => (!pinned.has(i) && w < (need[i] as number) - 0.01 ? [i] : []))
    if (short.length === 0) break
    for (const i of short) pinned.add(i)
  }
  const bounds = [0]
  for (const w of widths) bounds.push((bounds.at(-1) as number) + w)
  bounds[bounds.length - 1] = width
  return bounds
}

/**
 * The centres of a row of labels `halves` wide each side, in order, each as near its `target` as
 * keeps every two neighbours `LINE_GAP` apart and every label inside [0, `width`]: least squares
 * under those constraints. Taking each label's least offset from the first off its target leaves
 * targets that must not decrease, which pool-adjacent-violators solves; clamping the pooled values
 * to the one range they share keeps the solution optimal.
 */
export function spread(targets: readonly number[], halves: readonly number[], width: number): number[] {
  const offsets = halves.map((_, i) => halves.slice(0, i + 1).reduce((t, h, j) => (j === 0 ? 0 : t + (halves[j - 1] as number) + h + LINE_GAP + HAIR), 0))
  const lo = halves[0] ?? 0
  const hi = width - (halves.at(-1) ?? 0) - (offsets.at(-1) ?? 0)
  if (hi < lo) return halves.map((_, i) => width / 2 - (offsets.at(-1) ?? 0) / 2 + (offsets[i] as number))
  const pools: { sum: number; n: number }[] = []
  targets.forEach((t, i) => {
    pools.push({ sum: t - (offsets[i] as number), n: 1 })
    while (pools.length > 1) {
      const last = pools.at(-1) as { sum: number; n: number }
      const prev = pools.at(-2) as { sum: number; n: number }
      if (prev.sum / prev.n <= last.sum / last.n) break
      pools.splice(-2, 2, { sum: prev.sum + last.sum, n: prev.n + last.n })
    }
  })
  const pooled = pools.flatMap(pool => Array.from({ length: pool.n }, () => within(pool.sum / pool.n, [lo, hi])))
  return pooled.map((v, i) => v + (offsets[i] as number))
}

/**
 * A new file's depth in [0, 1] beside its tree's `taken`: the middle of the wider of the bands above
 * the shallowest and below the deepest. A file always hangs outside its tree's others, so a deeper
 * one stands nearer the diamond and a shallower one farther out, and the tree spreads down the strip.
 */
function outside(taken: readonly number[]): number {
  const top = Math.min(...taken)
  const bottom = Math.max(...taken)
  return top >= 1 - bottom ? top / 2 : (bottom + 1) / 2
}

const linkOf = (body: Body, among: readonly Body[]): Segment | null => {
  const adr = body.spec.link === null ? undefined : among.find(b => b.spec.id === body.spec.link)
  return adr === undefined ? null : [adr.x, adr.y, body.x, body.y]
}

/**
 * The free centre nearest (`tx`, `ty`) within the ranges, among the `fixed` nodes and the `reserved`
 * marks, on the grid and within `reach` of it, and whether it is clean: no placed link runs through its label and its own
 * link runs through no other label. A file no ADR binds keeps `LOOSE_GAP` from every other file and
 * every link, and every file keeps as far from it. A clean spot wins over a nearer one that is not;
 * null when no spot is free.
 */
function nearestFree(
  body: Body,
  [tx, ty]: [number, number],
  xs: [number, number],
  ys: [number, number],
  fixed: readonly Body[],
  reserved: readonly Mark[],
  off: readonly number[] = [],
  reach = Infinity,
): { at: [number, number]; clean: boolean } | null {
  const { spec } = body
  const apart = (other: Spec | null) => (spec.kind === 'file' && other?.kind === 'file' && (loose(spec) || loose(other)) ? LOOSE_GAP : GAP) + HAIR
  const marks = [...fixed.map(b => ({ mark: markOf(b.spec, b.x, b.y), gap: apart(b.spec) })), ...reserved.map(mark => ({ mark, gap: apart(null) }))]
  const anchor = spec.link === null ? undefined : fixed.find(b => b.spec.id === spec.link)
  const others = anchor === undefined ? [] : fixed.filter(b => b !== anchor).map(b => ({ box: boxOf(b.spec, b.x, b.y), clear: loose(b.spec) ? LOOSE_GAP : LINK_CLEAR }))
  const links = fixed.map(b => linkOf(b, fixed)).filter(link => link !== null)
  const away = halfOf(spec) + LINE_GAP
  const free = (x: number, y: number) => !marks.some(({ mark, gap }) => clash(mark, markOf(spec, x, y), gap)) && off.every(at => Math.abs(x - at) >= away)
  const clean = (x: number, y: number) => {
    const box = boxOf(spec, x, y)
    const clear = (loose(spec) ? LOOSE_GAP : LINK_CLEAR) + HAIR
    return !links.some(link => crosses(link, box, clear)) && (anchor === undefined || !others.some(other => crosses([anchor.x, anchor.y, x, y], other.box, other.clear + HAIR)))
  }
  const cx = within(tx, xs)
  const cy = within(ty, ys)
  if (free(cx, cy) && clean(cx, cy)) return { at: [cx, cy], clean: true }
  let best: [number, number] | null = null
  let bestD = Infinity
  let cleanest: [number, number] | null = null
  let cleanD = Infinity
  // The grid runs through the target, so a node that must move moves by a step, not to the grid's nearest line.
  for (let y = cy + Math.ceil((ys[0] - cy) / STEP - 0.001) * STEP; y <= ys[1] + 0.001; y += STEP) {
    for (let x = cx + Math.ceil((xs[0] - cx) / STEP - 0.001) * STEP; x <= xs[1] + 0.001; x += STEP) {
      const d = (x - cx) ** 2 + (y - cy) ** 2
      if (d >= cleanD || d > reach ** 2 || !free(x, y)) continue
      if (d < bestD) [best, bestD] = [[x, y], d]
      if (d < cleanD && clean(x, y)) [cleanest, cleanD] = [[x, y], d]
    }
  }
  if (cleanest !== null) return { at: cleanest, clean: true }
  return best === null ? null : { at: best, clean: false }
}

const round = (n: number) => Math.round(n * 10) / 10
/** ADRs first, then files from the one edited last: the order nodes claim their spots in. */
const byClaim = (a: Spec, b: Spec) => (a.kind === b.kind ? a.rank - b.rank : a.kind === 'adr' ? -1 : 1)

/** What `place` is told besides the nodes: a box `corner` wide kept free at the bottom trailing corner, and whether a file waits rather than evict an older one. */
export type Options = { corner: number; strict: boolean }

/**
 * The places for `specs` in a picture `width` by `height`, starting from `prior`.
 *
 * The ADRs' labels are laid along the top row first, in the order `prior` gave their columns, a new
 * ADR's after them: each as near its target as keeps every label `LINE_GAP` from the next
 * and inside the strip (a placed one as near where it stood). Where the labels cannot all fit, the
 * ADR whose newest file is oldest is dropped, its files waiting in `left`, until they do. The
 * columns then share the width by their files around those diamonds, each as wide as its share
 * where no placed file stands in the way. A file `prior` placed keeps its place, and moves only as
 * far as a grown label needs. A new width, or a new column, places every node afresh.
 *
 * A new file targets a depth and a side of its ADR, farther out the shallower it hangs; a file no
 * ADR binds, the trailing edge, anywhere across but under no diamond. Each takes the free spot
 * nearest its target where its link crosses no label and no link crosses its label, in its column,
 * else in the free width either side of it no other tree's node stands in. With no such spot, where
 * `strict` the file waits in `left` for a taller strip; else an older file of its column gives its
 * place up (any older file, when no spot is free at all), and failing that the file itself waits.
 * Nothing is ever placed crossed or overlapping. Returns `prior` itself when it already holds every
 * node at its size and nothing new waits.
 */
export function place(prior: Placed | null, specs: readonly Spec[], width: number, height: number, { corner, strict }: Options): Placed {
  const sorted = [...specs].sort(byClaim)
  const before = new Map(prior?.cols.map(([key], i) => [key, i]) ?? [])
  const wanted = [...new Set(sorted.map(keyOf).filter(key => key !== null))]
  const keys = [...wanted.filter(key => before.has(key)).sort((a, b) => (before.get(a) as number) - (before.get(b) as number)), ...wanted.filter(key => !before.has(key))]
  const adrOf = (key: string) => sorted.find(s => s.kind === 'adr' && s.id === key)
  const half = (key: string) => {
    const adr = adrOf(key)
    return adr === undefined ? 0 : halfOf(adr)
  }
  const newest = (key: string) => Math.min(...sorted.filter(s => s.kind === 'file' && s.link === key).map(s => s.rank))
  while (keys.length > 1 && keys.reduce((t, key) => t + 2 * half(key), 0) + (LINE_GAP + HAIR) * (keys.length - 1) > width) {
    const oldest = keys.reduce((a, b) => (newest(b) > newest(a) ? b : a))
    keys.splice(keys.indexOf(oldest), 1)
  }
  const live = sorted.filter(s => keyOf(s) === null || keys.includes(keyOf(s) as string))
  const dropped = sorted.filter(s => s.kind === 'file' && !live.includes(s)).map(s => s.id)
  const same = prior !== null && prior.width === width && keys.every(key => before.has(key))
  if (same && prior.height === height && prior.left.length === dropped.length && dropped.every(id => prior.left.includes(id))) {
    const fits = (s: Spec) => {
      const was = prior.at[s.id]
      return was !== undefined && s.labelWidth <= was.w && s.radius <= was.r
    }
    if (live.every(fits)) return prior
  }
  const col = new Map(keys.map((key, i) => [key, i]))
  const members = (key: string) => live.filter(s => keyOf(s) === key)
  // A column needs room for its widest label, and for two files side by side once it has two: stacked
  // under one diamond, the deeper one's link would run through the other's label.
  const need = (key: string) => {
    const widths = members(key).map(s => Math.max(s.labelWidth, 2 * s.radius))
    const files = members(key).filter(s => s.kind === 'file').map(s => s.labelWidth).sort((a, b) => b - a)
    return Math.max(...widths, files.length < 2 ? 0 : (files[0] as number) + (files[1] as number) + LINE_GAP) + LINE_GAP
  }
  const bounds = shares(keys.map(key => ({ weight: members(key).filter(s => s.kind === 'file').length + 1, need: need(key) })), width)
  // The first column's ADR aims at the strip's leading edge and the last's at its trailing edge, so
  // their files lean inward and the outermost labels meet the edges; any other at its column's middle.
  const aim = (key: string, c: number) => {
    if (same && prior.at[key] !== undefined) return prior.at[key].x
    if (keys.length > 1 && c === 0) return half(key)
    if (keys.length > 1 && c === keys.length - 1) return width - half(key)
    return ((bounds[c] as number) + (bounds[c + 1] as number)) / 2
  }
  const row = spread(keys.map(aim), keys.map(half), width)
  const kept = same ? live.filter(s => s.kind === 'file' && prior.at[s.id] !== undefined) : []
  // Each boundary stands between its two diamonds, and moves toward its share only as far as the
  // placed files on either side of it leave room.
  for (let i = 1; i < keys.length; i += 1) {
    const boxes = (side: (c: number) => boolean) => kept.filter(s => keyOf(s) !== null && side(col.get(keyOf(s) as string) as number)).map(s => boxOf(s, prior!.at[s.id]!.x, prior!.at[s.id]!.y))
    const low = Math.max(bounds[i - 1] as number, ...boxes(c => c < i).map(b => b[2]))
    const high = Math.min(width, ...boxes(c => c >= i).map(b => b[0]))
    bounds[i] = within(Math.max(low, Math.min(high, bounds[i] as number)), [row[i - 1] as number, row[i] as number])
  }
  // A file no ADR binds stands anywhere across.
  const span = (c: number): [number, number] => (c < 0 ? [0, width] : [bounds[c] as number, bounds[c + 1] as number])
  const reserved: Mark[] = corner > 0 ? [{ box: [width - corner, height - EDGE - DESCENT - ASCENT, width, height - EDGE], base: height - EDGE - DESCENT }] : []
  // Each new file's step, taken in the order the session edited them: its depth, 1 at the bottom and 0
  // at the top, and the side of its ADR it leans to. A column's first file takes the strip's next
  // golden step down, seeded a little; each next one outside its tree's others (see `outside`),
  // alternating sides, so a tree's files spread over the strip's depth.
  const fresh = live.filter(s => s.kind === 'file' && !kept.includes(s)).reverse()
  const steps = new Map<string, { depth: number; side: -1 | 1 }>()
  fresh.forEach((spec, i) => {
    const siblings = [...kept, ...fresh.slice(0, i)].filter(s => keyOf(s) === keyOf(spec))
    const side = siblings.length % 2 === 0 ? 1 : -1
    if (siblings.length === 0) {
      const seed = random(hash(spec.id))()
      steps.set(spec.id, { depth: within(1 - frac((kept.length + i) * GOLDEN) + (seed - 0.5) * 0.1, [0, 1]), side })
      return
    }
    const taken = siblings.map(s => {
      const was = kept.includes(s) ? prior?.at[s.id] : undefined
      const ys = depths(s, height)
      return was === undefined ? (steps.get(s.id)?.depth ?? 1) : within((was.y - ys[0]) / (ys[1] - ys[0]), [0, 1])
    })
    steps.set(spec.id, { depth: outside(taken), side })
  })
  const fixed: Body[] = keys.flatMap((key, c) => {
    const adr = adrOf(key)
    return adr === undefined ? [] : [{ spec: adr, x: row[c] as number, y: ADR_ROW }]
  })
  const target = (spec: Spec, c: number): [number, number] => {
    const xs = across(spec, span(c), width)
    const anchor = fixed.find(b => b.spec.id === spec.link)
    const { depth, side } = steps.get(spec.id) as { depth: number; side: -1 | 1 }
    const ys = depths(spec, height)
    const y = ys[0] + depth * (ys[1] - ys[0])
    if (anchor === undefined) return [xs[1], y]
    // Out to its side by as much as it hangs shallow, within twice REACH, so a column can narrow to
    // its share; an ADR at an edge of the picture has its files lean the other way.
    const room = (to: -1 | 1) => Math.min(2 * REACH, to === 1 ? xs[1] - anchor.x : anchor.x - xs[0])
    const to = room(side) >= REACH / 4 ? side : (-side as -1 | 1)
    return [anchor.x + to * (1 - depth) * room(to), y]
  }
  // The width either side of a column that no other tree's node stands in, out to the next one's box
  // or diamond and `LINE_GAP` short of it, so a crowded column borrows it without reaching under a
  // neighbour's diamond.
  const borrowed = (c: number): [number, number] => {
    const [lo, hi] = span(c)
    let [a, b] = [0, width]
    for (const other of fixed) {
      if (keyOf(other.spec) === keys[c]) continue
      const box = boxOf(other.spec, other.x, other.y)
      const [from, to] = other.spec.kind === 'adr' ? [other.x - other.spec.radius, other.x + other.spec.radius] : [box[0], box[2]]
      if (other.x < lo) a = Math.max(a, to + LINE_GAP)
      if (other.x > hi) b = Math.min(b, from - LINE_GAP)
    }
    return [Math.min(a, lo), Math.max(b, hi)]
  }
  const seek = (body: Body, goal: [number, number], c: number, reach: number) => {
    const ys = depths(body.spec, height)
    // A file no ADR binds never hangs under a diamond, so it never reads as that ADR's.
    const off = loose(body.spec) ? fixed.filter(b => b.spec.kind === 'adr').map(b => b.x) : []
    const own = nearestFree(body, goal, across(body.spec, span(c), width), ys, fixed, reserved, off, reach)
    if (own?.clean || c < 0) return own
    const wide = nearestFree(body, goal, across(body.spec, borrowed(c), width), ys, fixed, reserved, off, reach)
    return wide?.clean ? wide : (own ?? wide)
  }
  // The placed files claim first, so a new one never moves them, one whose label grew, or that stands
  // in the corner kept free, after the rest, so it moves rather than its neighbours; then the new
  // files in their steps' order.
  const grew = (s: Spec) => {
    const was = prior?.at[s.id] as { x: number; y: number; w: number; r: number }
    return s.labelWidth > was.w || s.radius > was.r || reserved.some(mark => clash(mark, markOf(s, was.x, was.y)))
  }
  const left: string[] = [...dropped]
  for (const spec of [...kept.filter(s => !grew(s)), ...kept.filter(grew), ...fresh]) {
    const key = keyOf(spec)
    const c = key === null ? -1 : (col.get(key) as number)
    const was = prior?.at[spec.id]
    const body: Body = { spec, x: 0, y: 0 }
    if (kept.includes(spec) && !grew(spec) && was !== undefined) {
      ;[body.x, body.y] = [was.x, was.y]
      fixed.push(body)
      continue
    }
    // A placed file whose label grew moves no farther than a nudge; with no clean spot that near, it waits.
    const moved = kept.includes(spec) && was !== undefined
    const goal: [number, number] = moved ? [was.x, was.y] : target(spec, c)
    const reach = moved ? NUDGE : Infinity
    let spot = seek(body, goal, c, reach)
    while (!strict && !spot?.clean) {
      const older = (b: Body) => b.spec.kind === 'file' && b.spec.rank > spec.rank
      const pool = fixed.filter(b => older(b) && keyOf(b.spec) === key)
      const oldest = (pool.length > 0 || spot !== null ? pool : fixed.filter(older)).sort((a, b) => b.spec.rank - a.spec.rank)[0]
      if (oldest === undefined) break
      fixed.splice(fixed.indexOf(oldest), 1)
      left.push(oldest.spec.id)
      spot = seek(body, goal, c, reach)
    }
    if (!spot?.clean) {
      left.push(spec.id)
      continue
    }
    ;[body.x, body.y] = spot.at
    fixed.push(body)
  }
  const at: Placed['at'] = {}
  for (const b of fixed) at[b.spec.id] = { x: round(b.x), y: round(b.y), w: b.spec.labelWidth, r: b.spec.radius }
  return { width, height, at, left, cols: keys.map((key, c) => [key, round(span(c)[0]), round(span(c)[1])]) }
}

/** Whether two layouts place the same nodes at the same places, in the same columns. */
export function samePlaces(a: Placed, b: Placed): boolean {
  const ids = Object.keys(a.at)
  return (
    a.width === b.width && a.height === b.height && ids.length === Object.keys(b.at).length &&
    ids.every(id => JSON.stringify(a.at[id]) === JSON.stringify(b.at[id])) &&
    JSON.stringify([...a.left].sort()) === JSON.stringify([...b.left].sort()) && JSON.stringify(a.cols) === JSON.stringify(b.cols)
  )
}

/** Whether any two placed nodes come closer than they must keep, a wider gap between labels on one line: the check a test can make. */
export function overlaps(placed: Placed, specs: readonly Spec[]): boolean {
  const marks = specs.flatMap(s => {
    const p = placed.at[s.id]
    return p === undefined ? [] : [markOf(s, p.x, p.y)]
  })
  return marks.some((a, i) => marks.some((b, j) => j > i && clash(a, b)))
}

/** Each placed file whose link to its ADR runs through another node's box, with that node: the check a test can make. */
export function crossings(placed: Placed, specs: readonly Spec[]): [string, string][] {
  const drawn = specs.filter(s => placed.at[s.id] !== undefined)
  const box = (s: Spec) => boxOf(s, placed.at[s.id]!.x, placed.at[s.id]!.y)
  return drawn.flatMap(file => {
    const adr = file.link === null ? undefined : placed.at[file.link]
    if (adr === undefined) return []
    const link: Segment = [adr.x, adr.y, placed.at[file.id]!.x, placed.at[file.id]!.y]
    return drawn.filter(other => other !== file && other.id !== file.link && crosses(link, box(other))).map(other => [file.id, other.id] as [string, string])
  })
}
