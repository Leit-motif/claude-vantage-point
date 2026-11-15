// A screenshot as an argument's source (spec 176): the agent names an image file this session captured or read,
// an optional crop and at most one callout, and never image data; the tool cuts and encodes it. This module reads
// what the agent passed, checks it against the session and the image's size, and plans how small each copy must
// be. All pure; hooks/shots.ts runs the cut and the encode.
import type { SessionMessage } from 'claude-code'
import type { HumanQueueImage } from '../../types'

import { resolveIn } from '../host.ts'
import { openedIn } from './sources.ts'

export type Crop = { x: number; y: number; w: number; h: number }
/** Where a callout's ring draws beside its point: the side with empty space, which only the agent can see. */
export const CALLOUT_SIDES = ['right', 'left', 'above', 'below'] as const
export type Callout = { x: number; y: number; label: string; side?: (typeof CALLOUT_SIDES)[number] }
/** A shot as asked for: the file, absolute; the crop and callout in that file's pixels; a fix's Before at the same size. */
export type ShotAsk = { file: string; crop?: Crop; callout?: Callout; before?: { file: string; crop?: Crop } }
export type Size = { width: number; height: number }

/** The most words a callout's label holds. */
export const CALLOUT_WORDS = 4
/**
 * How wide the whole-frame thumbnail for the Sources tab draws, in points: a docked pane's text column, or wider. Its
 * file's frame is cut at this times the file's scale, 960 pixels for a 2x capture, so it draws two pixels a point
 * (the design review of 0.282.0: cut at 480 pixels and drawn about 470 points wide, a 2x file's frame drew soft).
 */
export const FRAME_POINTS = 480

/**
 * The most base64 each copy may hold. A page draws shots and Sources draws frames, never both in one tree. A crop of a
 * 2x capture keeps both its pixels a point in a shot's room: scripts/shot-budget.mts on real 2x desktop windows put
 * 1020 by 340 and 1020 by 660 crops at 36,080 to 47,144 as AVIF (docs/palette.md, Svg). Each image of a fix's Before
 * and After has a shot's room of its own: at half of it the ladder narrowed a 2x pair to 1.1 pixels a point, and a 1x
 * pair to 0.75, which drew soft (the owner on 0.281.0). A page holds a pair and three shots in a pane tree's 240,000
 * (TREE_PICTURES), or five or six shots alone. A 2x file's 960-pixel frame kept its width on six real 2560 by 1604
 * windows at 40,916 to 50,140 (at 24,000 the ladder narrowed it to 540 pixels for 480 points), so Sources holds four
 * to five frames, sharp, where it held ten to sixteen soft.
 */
export const SHOT_MOST = 48_000
export const FRAME_MOST = 52_000

export type ShotPlan = { image: number; before?: number; frame: number }

/** How small each copy of `ask` is encoded: the shot, and a fix's Before beside it, each a shot's whole room. */
export const planOf = (ask: ShotAsk): ShotPlan =>
  ask.before === undefined ? { image: SHOT_MOST, frame: FRAME_MOST } : { image: SHOT_MOST, before: SHOT_MOST, frame: FRAME_MOST }

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null

const whole = (value: unknown, least: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= least

const pathOf = (value: unknown, cwd: string): string | null => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text === '' ? null : resolveIn(cwd, text)
}

function cropOf(value: unknown, at: string, no: string[]): Crop | undefined | null {
  if (value === undefined) return undefined
  const given = object(value)
  if (given !== null && whole(given.x, 0) && whole(given.y, 0) && whole(given.w, 1) && whole(given.h, 1)) {
    return { x: given.x, y: given.y, w: given.w, h: given.h }
  }
  no.push(`${at}: {x, y, w, h}, whole pixels of the file, w and h at least 1`)
  return null
}

function calloutOf(value: unknown, at: string, no: string[]): Callout | undefined | null {
  if (value === undefined) return undefined
  const given = object(value)
  const label = typeof given?.label === 'string' ? given.label.trim().replace(/\s+/g, ' ') : ''
  if (given === null || !whole(given.x, 0) || !whole(given.y, 0) || label === '') {
    no.push(`${at}: {x, y, label}, a point in the file's pixels and a label of ${CALLOUT_WORDS} words or fewer`)
    return null
  }
  const words = label.split(' ').length
  if (words > CALLOUT_WORDS) {
    no.push(`${at}.label: ${words} words, over its ${CALLOUT_WORDS}: what the callout points at`)
    return null
  }
  const side = CALLOUT_SIDES.find(one => one === given.side)
  if (given.side !== undefined && side === undefined) {
    no.push(`${at}.side: one of ${CALLOUT_SIDES.map(one => `"${one}"`).join(', ')}, the side of the point with empty space`)
    return null
  }
  return { x: given.x, y: given.y, label, ...(side === undefined ? {} : { side }) }
}

/**
 * A shot source as the agent passed it (`{kind: "shot", ref, crop?, callout?, before?: {ref, crop?}}`), its paths
 * resolved against the session's folder `cwd`; or every field to fix, each named under `at`.
 */
export function shotAsk(rests: Record<string, unknown>, at: string, cwd: string): { ask: ShotAsk } | { refused: string[] } {
  const no: string[] = []
  const file = pathOf(rests.ref, cwd)
  if (file === null) no.push(`${at}.ref: the path of an image file this session captured or read, never image data`)
  const crop = cropOf(rests.crop, `${at}.crop`, no)
  const callout = calloutOf(rests.callout, `${at}.callout`, no)
  let before: ShotAsk['before'] | null | undefined
  if (rests.before !== undefined) {
    const given = object(rests.before)
    const was = pathOf(given?.ref, cwd)
    const wasCrop = cropOf(given?.crop, `${at}.before.crop`, no)
    if (was === null) no.push(`${at}.before.ref: the path of the image of the state before the fix`)
    before = was === null || wasCrop === null ? null : { file: was, ...(wasCrop === undefined ? {} : { crop: wasCrop }) }
  }
  // A Before and After with nothing marked leaves the reader to find the change (the design review).
  if (rests.before !== undefined && rests.callout === undefined) no.push(`${at}.callout: a Before and After needs a callout on the After marking what changed`)
  if (no.length > 0) return { refused: no }
  return { ask: { file: file!, ...(crop ? { crop } : {}), ...(callout ? { callout } : {}), ...(before ? { before } : {}) } }
}

/** Every file of `ask` no tool call of this session wrote, read or named, each refused under `at`. */
export function unseenIn(ask: ShotAsk, messages: readonly SessionMessage[], at: string): string[] {
  const named = [{ file: ask.file, field: `${at}.ref` }, ...(ask.before ? [{ file: ask.before.file, field: `${at}.before.ref` }] : [])]
  return named.flatMap(({ file, field }) =>
    openedIn(messages, file) === null ? [`${field}: no tool call in this session took or opened ${file}: capture it, or Read it, before citing it`] : [])
}

const shown = (crop: Crop | undefined, size: Size): Size => (crop === undefined ? size : { width: crop.w, height: crop.h })

const past = (crop: Crop, size: Size) => crop.x + crop.w > size.width || crop.y + crop.h > size.height

/**
 * What `ask` gets wrong once its images' sizes are known: a crop past its image, a callout outside the part shown,
 * and a Before not the After's size, which would show the two at different scales. Each refused under `at`.
 */
export function sizedRefusals(ask: ShotAsk, after: Size, before: Size | null, at: string): string[] {
  const no: string[] = []
  const crop = ask.crop
  if (crop !== undefined && past(crop, after)) no.push(`${at}.crop: runs past the ${after.width}x${after.height} image`)
  const callout = ask.callout
  if (callout !== undefined) {
    const area = crop ?? { x: 0, y: 0, w: after.width, h: after.height }
    if (callout.x < area.x || callout.y < area.y || callout.x >= area.x + area.w || callout.y >= area.y + area.h) {
      no.push(`${at}.callout: (${callout.x}, ${callout.y}) is outside the part shown; give it in the file's pixels, inside the crop`)
    }
  }
  if (ask.before !== undefined && before !== null) {
    const was = ask.before.crop
    if (was !== undefined && past(was, before)) no.push(`${at}.before.crop: runs past the ${before.width}x${before.height} image`)
    const a = shown(crop, after)
    const b = shown(was, before)
    if (a.width !== b.width || a.height !== b.height) {
      no.push(`${at}.before: Before shows ${b.width}x${b.height} and After ${a.width}x${a.height}; crop both to the same size, so they draw at one scale`)
    }
  }
  return no
}

/** An encoded copy as the pane draws it: its type read from its first bytes, at `size`, the part's pixel size. */
export function imageOf(base64: string, size: Size): HumanQueueImage {
  const mime = base64.startsWith('/9j/') ? 'image/jpeg' : base64.slice(5, 16) === 'GZ0eXBhdmlm' ? 'image/avif' : 'image/png'
  return { base64, mime, width: size.width, height: size.height }
}
