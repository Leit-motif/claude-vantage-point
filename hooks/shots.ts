// A screenshot an argument rests on, cut and encoded (spec 176): CUT_SCRIPT crops it and makes its frame, and the
// queue card's FETCH_SCRIPT ladder (PNG, then AVIF at falling quality, then narrower) encodes each part small enough
// for the pane tree. Never takes `$`: register.tsx hands it the calls it needs. scripts/shot-budget.mts runs it from
// node, so its imports name their files.
import type { Run } from '../panes/human-queue/issues.ts'
import type { Host } from '../panes/host.ts'
import { cutArgv, cutOf, loadedFrom, nameOf, pictureRun } from '../panes/human-queue/pictures.ts'
import { FRAME_POINTS, imageOf, planOf, sizedRefusals } from '../panes/visuals/shots.ts'
import type { Crop, ShotAsk, Size } from '../panes/visuals/shots.ts'
import type { HumanQueueImage, HumanQueueShot } from '../types'

export type ShotIO = {
  run: Run
  /** The file's modified time (epoch ms), or null when it is not there. */
  mtime: (path: string) => Promise<number | null>
  read: (path: string) => Promise<string | null>
  /** Waits `ms` (`$.clock.sleep`: the mod has no timers of its own). */
  sleep: (ms: number) => Promise<void>
}

/** A shot, encoded; or every reason it cannot be, each named by its field. */
export type Encoded = { shot: HumanQueueShot } | { refused: string[] }

/** The decide hook has ten seconds, and the overflow check takes four of them after this. */
export const SHOT_DEADLINE_MS = 4500

/** What a shot was taken of, from its sidecar, and its pixels per point (absent, 1). */
export type Provenance = { surface?: string; build?: string; commit?: string; scale?: number }

// A sidecar's value is drawn as text in the pane: a short run of word characters, dots, plus and minus.
const field = (value: unknown) => (typeof value === 'string' && /^[\w.+-]{1,40}$/.test(value) ? value : undefined)
// A scale is pixels per point: a capture's 1 or 2, or 3 on a phone; a 1x file needs none.
const scaleOf = (value: unknown) => (typeof value === 'number' && value > 1 && value <= 4 ? value : undefined)

/**
 * What the shot at `file` was taken of: the sidecar `<file>.json` scripts/desktop-shot.sh writes as it takes the shot
 * (`{surface, build, commit, at, scale}`). Without one, or with one that does not parse, nothing: a shot never borrows
 * the session's build or commit, which may be newer than what the shot shows, and its scale is taken as 1.
 */
export async function provenanceOf(io: ShotIO, file: string): Promise<Provenance> {
  const text = await io.read(`${file}.json`).catch(() => null)
  if (text === null) return {}
  let given: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) given = parsed as Record<string, unknown>
  } catch {
    return {}
  }
  const surface = field(given.surface)
  const build = field(given.build)
  const commit = field(given.commit)
  const scale = scaleOf(given.scale)
  return {
    ...(surface === undefined ? {} : { surface }), ...(build === undefined ? {} : { build }), ...(commit === undefined ? {} : { commit }),
    ...(scale === undefined ? {} : { scale }),
  }
}

/** One file as CUT_SCRIPT cut it: when it was written, its size, and the parts it wrote (none for a crop past it). */
type Cut = { at: number; size: Size; part?: string; frame?: string }

/** One file cut by CUT_SCRIPT, with its whole frame `frameWidth` pixels wide (none at 0), or why it cannot be, named under `field`. */
async function cut(io: ShotIO, host: Host, file: string, crop: Crop | undefined, frameWidth: number, field: string, timeoutMs = SHOT_DEADLINE_MS): Promise<Cut | string> {
  const at = await io.mtime(file)
  if (at === null) return `${field}: ${file} is not there now`
  const argv = cutArgv(host, nameOf(`${file}\n${at}`), file, frameWidth, crop)
  if (argv === null) return `${field}: only macOS's sips can cut and encode a shot, and this system has none`
  const ran = await io.run(argv, { timeoutMs })
  const out = cutOf(ran.stdout)
  if (ran.exitCode === 4) return `${field}: ${file} is not an image sips can read`
  if (out === null) return `${field}: the cut failed (exit ${ran.exitCode})`
  const size = { width: out.width, height: out.height }
  // Exit 5 is a crop past the file, which sizedRefusals names from the size.
  if (ran.exitCode !== 0) return { at, size }
  return { at, size, ...(out.part ? { part: out.part } : {}), ...(out.frame ? { frame: out.frame } : {}) }
}

/**
 * A shot's crop as a file of its own, at the file's full resolution, and the file's size, for the full view (spec
 * 176): cut under the name decide cut it under, so a crop decide already cut is read back, not cut again. Null where
 * it cannot be cut (no sips, the file gone, a crop past it).
 */
export async function cropFile(io: ShotIO, host: Host, file: string, crop: Crop): Promise<{ part: string; size: Size } | null> {
  const done = await cut(io, host, file, crop, 0, 'crop', 45_000)
  return typeof done === 'string' || done.part === undefined ? null : { part: done.part, size: done.size }
}

/**
 * One part encoded through the card's ladder to at most `most` characters, drawn at the size the ladder read: at most
 * 1280 wide, or `wide`, a whole frame cut to its width for a 2x file (spec 176).
 */
async function encode(io: ShotIO, host: Host, part: string, most: number, field: string, wide?: number): Promise<HumanQueueImage | string> {
  const run = pictureRun(host, nameOf(`${part}@${most}`), { kind: 'file', path: part, ...(wide === undefined ? {} : { wide }) }, { top: 0, rows: 0, most })
  if (typeof run === 'string') return `${field}: this system cannot encode a shot`
  const ran = await io.run(run.argv, { timeoutMs: SHOT_DEADLINE_MS })
  const loaded = ran.exitCode === 0 ? loadedFrom(run, ran.stdout) : null
  if (loaded === null) return `${field}: no copy fits ${most} characters even as AVIF at a smaller width; crop it smaller`
  return imageOf(loaded.base64, { width: loaded.width, height: loaded.height })
}

/** `ask` cut and encoded: the shot as the pane draws it, or every reason it cannot be, named under `at`. */
export async function encodeShot(io: ShotIO, host: Host, ask: ShotAsk, at: string): Promise<Encoded> {
  const plan = planOf(ask)
  // Each file's whole frame is cut at the text column's points times its own scale, so a 2x file's frame draws two
  // pixels a point in Sources (the design review of 0.282.0); its sidecar says the scale, so it is read first.
  const [provenance, wasOf] = await Promise.all([provenanceOf(io, ask.file), ask.before === undefined ? null : provenanceOf(io, ask.before.file)])
  const frameWidth = Math.round(FRAME_POINTS * (provenance.scale ?? 1))
  const wasWidth = Math.round(FRAME_POINTS * (wasOf?.scale ?? 1))
  const [after, before] = await Promise.all([
    cut(io, host, ask.file, ask.crop, frameWidth, `${at}.ref`),
    ask.before === undefined ? null : cut(io, host, ask.before.file, ask.before.crop, wasWidth, `${at}.before.ref`),
  ])
  if (typeof after === 'string' || typeof before === 'string') return { refused: [after, before].filter((one): one is string => typeof one === 'string') }
  const wrong = sizedRefusals(ask, after.size, before?.size ?? null, at)
  if (wrong.length > 0) return { refused: wrong }
  const was = before === null ? null : before.part
  if (after.part === undefined || was === undefined) return { refused: [`${at}: the cut failed`] }
  // A pair's Before has its own whole frame in Sources, as its After does (the design review).
  const [image, frame, prior, priorFrame] = await Promise.all([
    encode(io, host, after.part, plan.image, at),
    after.frame === undefined ? null : encode(io, host, after.frame, plan.frame, `${at}.frame`, frameWidth),
    was === null ? null : encode(io, host, was, plan.before ?? plan.image, `${at}.before`),
    before?.frame === undefined ? null : encode(io, host, before.frame, plan.frame, `${at}.before.frame`, wasWidth),
  ])
  if (typeof image === 'string' || typeof frame === 'string' || typeof prior === 'string' || typeof priorFrame === 'string') {
    return { refused: [image, frame, prior, priorFrame].filter((one): one is string => typeof one === 'string') }
  }
  return {
    shot: {
      file: ask.file,
      ...(ask.crop ? { crop: ask.crop } : {}),
      ...(ask.callout ? { callout: ask.callout } : {}),
      ...provenance,
      at: after.at,
      // The file's own size: the space crop and callout are in, so the pane outlines the crop on the frame (spec 176).
      size: after.size,
      image,
      ...(frame === null ? {} : { frame }),
      ...(prior === null || ask.before === undefined || before === null ? {} : { before: {
        file: ask.before.file, ...(ask.before.crop ? { crop: ask.before.crop } : {}), image: prior, ...wasOf,
        at: before.at, size: before.size, ...(priorFrame === null ? {} : { frame: priorFrame }),
      } }),
    },
  }
}

/**
 * The shot encoder a decide call uses: each shot cut and encoded at once, its provenance read from its own sidecar,
 * and a shot that takes past SHOT_DEADLINE_MS refused, named, so the hook stays inside its ten seconds.
 */
export function shotEncoder(io: ShotIO, host: Host): (ask: ShotAsk, at: string) => Promise<Encoded> {
  return async (ask, at) => {
    const late = io.sleep(SHOT_DEADLINE_MS).then(() => ({ refused: [`${at}: cutting and encoding the shot took over ${SHOT_DEADLINE_MS / 1000} s; call decide again, which reuses what was cut, or crop it smaller`] }))
    const work = encodeShot(io, host, ask, at).catch((error: unknown) => ({
      refused: [`${at}: the shot was not encoded: ${error instanceof Error ? error.message : String(error)}`],
    }))
    return Promise.race([work, late])
  }
}
