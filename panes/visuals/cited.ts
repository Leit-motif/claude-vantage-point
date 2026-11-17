// The Decision pane as a report (spec 176): every source the pages cite, numbered S1.. once in order of first citation,
// the short tag line each claim carries, and where a shot's crop and callout land once it is drawn. All pure.
import type { HumanQueueArgument, HumanQueueOptionPage, HumanQueueRests, HumanQueueShot } from '../../types'

/** One source the pages cite, numbered from 1, with the claim that first cited it and that claim's number on its page. */
export type Source = { n: number; rests: HumanQueueRests; claim: string; argument: number }

/** Every source once, and each argument's source number by page and argument index. */
export type Citations = { sources: Source[]; tags: number[][] }

/** A shot an argument rests on, when it carries one. */
export const shotOf = (one: HumanQueueArgument): HumanQueueShot | undefined => (one.rests.kind === 'shot' ? one.rests.shot : undefined)

// Two citations are one source when they name the same thing. An estimate or an assumption is the agent's own word
// about its claim, so each claim's is its own.
function identity(one: HumanQueueArgument): string {
  const { kind, ref, excerpt, shot } = one.rests
  if (kind === 'estimate' || kind === 'assumption') return JSON.stringify([kind, one.claim])
  if (shot !== undefined) return JSON.stringify([kind, shot.file, shot.crop ?? null, shot.before?.file ?? null])
  return JSON.stringify([kind, ref ?? null, excerpt ?? null])
}

/** Numbers every source in order of first citation, the pages read in `order` (tab order), each page's arguments in turn. */
export function citationsOf(pages: readonly HumanQueueOptionPage[], order: readonly number[]): Citations {
  const sources: Source[] = []
  const seen = new Map<string, number>()
  const tags: number[][] = pages.map(() => [])
  for (const p of order) {
    const page = pages[p]
    if (page === undefined) continue
    tags[p] = page.arguments.map((one, index) => {
      const id = identity(one)
      const known = seen.get(id)
      if (known !== undefined) return known
      const n = sources.length + 1
      seen.set(id, n)
      sources.push({ n, rests: one.rests, claim: one.claim, argument: index + 1 })
      return n
    })
  }
  return { sources, tags }
}

/** A path's file name, as a shot's label and the shot pane's title name it. */
export const fileName = (file: string) => file.split(/[\\/]/).pop() ?? file

/**
 * `text` without inline markdown, as the pane draws a quote or a kind line in plain Text: `**bold**`, `__bold__`,
 * `*em*`, `_em_` and `` `code` `` keep their words and lose their marks. An underscore or star inside a word
 * (snake_case, 2*3) stays.
 */
export function plain(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(?=\S)([^]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?![\w*])/g, '$1$2')
    .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1$2')
}

/** A ruling's ref as the pane names it: a bare issue number ("171", "#171") reads "issue 171". */
export const rulingRef = (ref: string) => (/^#?\d+$/.test(ref) ? `issue ${ref.replace('#', '')}` : ref)

/** A shot's build as its tag names it: its surface and build, a fix's Before build first when it differs. */
function shotBuild(shot: HumanQueueShot): string | undefined {
  if (shot.build === undefined) return undefined
  const was = shot.before?.build
  return [shot.surface, was === undefined || was === shot.build ? shot.build : `${was} → ${shot.build}`].filter(one => one !== undefined).join(' ')
}

/** The short line beside a claim's tag: what kind of source, and which, without markdown. */
export function tagLine(rests: HumanQueueRests): string {
  switch (rests.kind) {
    case 'shot': {
      if (rests.shot === undefined) return 'shot'
      // With a build, shotBuild already names a pair's two; without one, a pair names both files.
      const build = shotBuild(rests.shot)
      // A single shot names its file here too, since the pane draws no label over it (the review of 0.283.0).
      if (build !== undefined) return rests.shot.before === undefined ? `shot · ${build} · ${fileName(rests.shot.file)}` : `shot · ${build}`
      const before = rests.shot.before === undefined ? undefined : fileName(rests.shot.before.file)
      return `shot · ${before === undefined ? '' : `${before} → `}${fileName(rests.shot.file)}`
    }
    case 'run': return plain(`run · ${rests.ref ?? 'a command'}`)
    case 'read': return plain(`read · ${rests.ref ?? 'a file'}`)
    case 'ruling': return rests.ref === undefined ? 'your ruling' : plain(`your ruling · ${rulingRef(rests.ref)}`)
    case 'estimate': return 'estimate'
    case 'assumption': return 'assumption'
  }
}

/**
 * The label over one image of a shot drawn on a page or in the full view: "Before" or "After" first for a pair, then
 * its build and file name; without a build, its file name and the time it was written, as Sources names it.
 */
export function shotLabel(one: Pick<ShotFile, 'file' | 'build' | 'at'>, which?: 'Before' | 'After'): string {
  const time = one.build === undefined && one.at !== undefined ? timeOf(one.at) : undefined
  return [which, one.build, fileName(one.file), time].filter(part => part !== undefined).join(' · ')
}

/** One image file of a shot: the After, or a fix's Before, with what its own sidecar recorded and when it was written. */
export type ShotFile = Pick<HumanQueueShot, 'file' | 'surface' | 'build' | 'commit' | 'crop' | 'size' | 'scale' | 'frame'> & { at?: number }

/** A shot's files in the order Sources and the full view show them: a fix's Before ahead of its After. */
export function filesOf(shot: HumanQueueShot): { which?: 'Before' | 'After'; one: ShotFile }[] {
  if (shot.before === undefined) return [{ one: shot }]
  return [{ which: 'Before', one: shot.before }, { which: 'After', one: shot }]
}

/** When a file was written, in local hours and minutes. */
const timeOf = (at: number) => {
  const when = new Date(at)
  return `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`
}

/**
 * A shot file's entry line in Sources: its name, the surface and build and the commit it was taken of (from the
 * sidecar the shot script wrote, never the session's), and the time it was written.
 */
export function shotLine(one: ShotFile): string {
  const build = one.build === undefined ? undefined : [one.surface, one.build].filter(part => part !== undefined).join(' ')
  return [fileName(one.file), build, one.commit?.slice(0, 7), one.at === undefined ? undefined : timeOf(one.at)]
    .filter(part => part !== undefined).join(' · ')
}

type Size = { width: number; height: number }

/** The share of the pane's body a shot on a page may take, a pair's two images and their labels together, so the first screen still reaches Choose this. */
export const SHOT_SHARE = 0.33

/** The gap between a pair's Before and After, side by side: a `columnGap` of 1 (9.5pt), rounded up. */
export const PAIR_GAP = 10

/** The narrowest a pair's image may be beside its partner; a narrower pane stacks them instead. */
export const PAIR_MIN = 200

/**
 * The most an image of a shot draws at, in points: the part of its file it shows (the crop, else the whole file) over
 * the file's scale, so a 2x capture draws at its true size with two pixels a point, never past the encode's own
 * pixels. A 1x file draws its encode's pixels one to a point, as before scales were read.
 */
export function pointsOf(one: Pick<HumanQueueShot, 'image' | 'crop' | 'size' | 'scale'>): Size {
  const { width, height } = one.image
  const scale = one.scale ?? 1
  if (scale <= 1 || width <= 0) return { width, height }
  const across = Math.min(width, (one.crop?.w ?? one.size?.width ?? width) / scale)
  return { width: across, height: (height * across) / width }
}

/**
 * The sizes a shot and its Before draw at within `room` across and `tall` down together: one scale for both, never
 * past their size in points (`pointsOf`). A stacked pair's two heights share `tall`; past it both scale down evenly,
 * and ⛶ shows them whole.
 */
export function shotSizes(shot: HumanQueueShot, room: number, tall = Infinity): { after: Size; before?: Size; side?: true } {
  const now = pointsOf(shot)
  const was = shot.before === undefined ? undefined : pointsOf(shot.before)
  const widest = Math.max(now.width, was?.width ?? 0)
  if (widest <= 0) return { after: { width: 1, height: 1 } }
  // Before is drawn as wide as After: their crops are the same size, so one width is one scale, whatever the encoder narrowed.
  const wasAspect = was === undefined || was.width <= 0 ? 0 : was.height / was.width
  // A pair takes whichever layout draws it larger (the design review, 2026-11-15): side by side, each in half the room
  // less the gap, suits a tall crop, which stacked would shrink to a sliver under the height cap; stacked suits a wide
  // crop, which halved shrank its type to about 5pt. Side by side needs two images of PAIR_MIN at least.
  const half = (room - PAIR_GAP) / 2
  const fit = (across: number, high: number) => Math.min(1, across / widest, tall / Math.max(1, high))
  const stacked = fit(room, now.height + now.width * wasAspect)
  const beside = fit(half, Math.max(now.height, now.width * wasAspect))
  const side = wasAspect !== 0 && half >= PAIR_MIN && beside > stacked
  const scale = wasAspect === 0 ? fit(room, now.height) : side ? beside : stacked
  const after = { width: Math.max(1, Math.round(now.width * scale)), height: Math.max(1, Math.round(now.height * scale)) }
  // Its height from the scale, not from After's rounded width, so the two land on the cap together.
  const before = wasAspect === 0 ? undefined : { width: after.width, height: Math.max(1, Math.round(now.width * scale * wasAspect)) }
  return { after, ...(before === undefined ? {} : { before }), ...(side ? { side: true as const } : {}) }
}

/**
 * Where the callout lands in the shot drawn `drawn` wide and tall. Its point is in the file's pixels, as the crop is:
 * from the crop's corner when there is one, else from the file's, whose size is `shot.size` or the image's own.
 */
export function calloutAt(shot: Pick<HumanQueueShot, 'callout' | 'crop' | 'size'> & { image: Size }, drawn: Size): { x: number; y: number } | null {
  if (shot.callout === undefined) return null
  const space = shot.crop ?? { x: 0, y: 0, w: shot.size?.width ?? shot.image.width, h: shot.size?.height ?? shot.image.height }
  const x = ((shot.callout.x - space.x) * drawn.width) / space.w
  const y = ((shot.callout.y - space.y) * drawn.height) / space.h
  return x >= 0 && y >= 0 && x <= drawn.width && y <= drawn.height ? { x: Math.round(x), y: Math.round(y) } : null
}

/** The callout's ring: its radius, how far its centre sits from the point on each axis, and the leader's gap short of the point. */
export const RING = { r: 10, offset: 24, gap: 12 }

/** Where a callout's ring and its leader draw: never on the point, which they point at. */
export type CalloutMark = { point: { x: number; y: number }; ring: { x: number; y: number }; leader: { x1: number; y1: number; x2: number; y2: number } }

/** The side of its point a callout's ring draws on, which the agent names where the image has empty space (spec 176). */
export type CalloutSide = NonNullable<HumanQueueShot['callout']>['side']

const SIDES = { right: [1, 0], left: [-1, 0], above: [0, -1], below: [0, 1] } as const satisfies Record<NonNullable<CalloutSide>, readonly [number, number]>

/**
 * The ring for a callout at `point` in a shot drawn `drawn` wide and tall: on `side` of the point when the agent named
 * one (on the point's own line for right and left, its own column for above and below), else above-right; failing
 * that, the nearest corner that keeps it inside the image (above-right, below-left, above-left, below-right), with a
 * leader from the ring's edge to just short of the point. The agent names the side because only it can see where the
 * image's text is: above-right of a word on a one-line crop landed on the line above (the design review of 0.282.0).
 * An image too small for any of them holds the ring as far from the point as it can.
 */
export function calloutMark(point: { x: number; y: number }, drawn: Size, side?: CalloutSide): CalloutMark {
  const { r, offset, gap } = RING
  const corners = [[1, -1], [-1, 1], [-1, -1], [1, 1]] as const
  const inside = (x: number, y: number) => x - r - 1 >= 0 && y - r - 1 >= 0 && x + r + 1 <= drawn.width && y + r + 1 <= drawn.height
  const clamp = (v: number, most: number) => Math.min(Math.max(v, r + 1), Math.max(r + 1, most - r - 1))
  const placed = [...(side === undefined ? [] : [SIDES[side]]), ...corners].map(([dx, dy]) => ({ x: point.x + dx * offset, y: point.y + dy * offset }))
  const ring = placed.find(one => inside(one.x, one.y))
    ?? placed.map(one => ({ x: clamp(one.x, drawn.width), y: clamp(one.y, drawn.height) }))
      .reduce((best, one) => (Math.hypot(one.x - point.x, one.y - point.y) > Math.hypot(best.x - point.x, best.y - point.y) ? one : best))
  const far = Math.hypot(point.x - ring.x, point.y - ring.y) || 1
  const ux = (point.x - ring.x) / far
  const uy = (point.y - ring.y) / far
  const at = (v: number) => Math.round(v * 10) / 10
  return {
    point,
    ring,
    leader: { x1: at(ring.x + ux * r), y1: at(ring.y + uy * r), x2: at(point.x - ux * gap), y2: at(point.y - uy * gap) },
  }
}

/** The crop outlined on the whole frame drawn `drawn` wide and tall, or null without a crop or the file's size. */
export function cropOutline(shot: Pick<ShotFile, 'crop' | 'size'>, drawn: Size): { x: number; y: number; w: number; h: number } | null {
  if (shot.crop === undefined || shot.size === undefined || shot.size.width <= 0 || shot.size.height <= 0) return null
  const sx = drawn.width / shot.size.width
  const sy = drawn.height / shot.size.height
  return { x: Math.round(shot.crop.x * sx), y: Math.round(shot.crop.y * sy), w: Math.max(1, Math.round(shot.crop.w * sx)), h: Math.max(1, Math.round(shot.crop.h * sy)) }
}
