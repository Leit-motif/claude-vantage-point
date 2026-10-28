// The Reader's state machine (issue #35): a read starts from the last reply,
// plays chunk by chunk on the clock, and pauses, changes speed or ends on a
// press. The AbovePrompt handler in register.tsx draws it. The read in progress
// keeps its beats here rather than in $.state: a picture needs only its chunk,
// and a reload ends the read.
import type { HumanQueueReading } from '../types'
import { linearize } from '../panes/reader/linearize'
import { play } from '../panes/reader/forms'
import type { PacedBeat } from '../panes/reader/pace'
import { isSame, next as nextChunk, nudge, pause as pauseReading, respeed, resume as resumeReading, savedSpeed, start as startReading, timeline } from '../panes/reader/reading'
import type { Reading } from '../panes/reader/reading'
import { splitGist } from '../panes/reader/gist'
import type { ReplyPart } from '../panes/reader/linearize'
import { latestReply } from '../panes/reader/reply'
import { speak } from '../panes/reader/speak'
import type { ReplyMessage } from '../panes/reader/reply'
import type { Run } from '../panes/reader/stream'

/**
 * The engine calls the Reader makes, which register.tsx's `readerIO` makes for
 * it: the engine follows `$` only within the file that holds it. `read` and
 * `update` are the `reading` atom's; `storedWpm` and `storeWpm` keep the
 * person's speed across sessions. `logRead` keeps the words each read played,
 * for `scripts/reader-log.mts` to print.
 */
export type ReaderIO = {
  messages: () => Promise<readonly ReplyMessage[]>
  toast: (text: string) => void
  now: () => Promise<number>
  after: (ms: number, fn: () => void) => unknown
  storedWpm: () => Promise<unknown>
  storeWpm: (wpm: number) => Promise<void>
  logRead: (entry: ReadLog) => Promise<void>
  read: () => Promise<HumanQueueReading>
  update: (change: (now: HumanQueueReading) => HumanQueueReading) => Promise<unknown>
}

/** What a read plays: the reply's gist (the default, Interlace's #222) or the full reply. */
export type Level = 'gist' | 'full'

/** One read as played: the reply's text, the gist when it played one, and each beat as [word, ms, kind]. */
export type ReadLog = { at: number; wpm: number; level: Level; reply: string; gist?: string; beats: [string, number, string][] }

/**
 * A read's pacing: its runs, to pace again at another speed, the beats they
 * paced to, and the reply and gist they came from, to switch between them.
 */
type Pacing = { id: number; level: Level; parts: ReplyPart[]; gist: string | null; runs: Run[]; beats: PacedBeat[]; starts: number[]; total: number }

let held: Pacing | null = null
let reads = 0
/** How long the last word stays before the band comes back. */
const READ_END_HOLD_MS = 1500
/** Room for a chunk's picture to finish before the next one replaces it. */
const READ_SWAP_SLACK_MS = 150

/** Whether `r` is the read whose beats this module holds: a reload drops them and ends the read. */
export function isHeld(r: HumanQueueReading): r is Reading {
  return r !== null && held !== null && held.id === r.id
}

/** The pacing `r` draws from, while it is the read this module holds. */
export const pacingOf = (r: HumanQueueReading): Pacing | null => (isHeld(r) ? held : null)

/**
 * Reads the latest completed reply: the gist its author wrote when there is
 * one, else the whole reply; linearized (#33), spoken and formed (#49),
 * paced (#31), then played in the band.
 */
export async function startReader(io: ReaderIO, isWorking: boolean): Promise<void> {
  const found = latestReply(await io.messages().catch(() => []), isWorking)
  if (found === null) {
    io.toast('No finished reply to read yet.')
    return
  }
  // The author's <gist> block is the gist, and is no part of the reply read in full.
  let gist: string | null = null
  const parts = found.map(part => {
    if (part.kind !== 'text') return part
    const split = splitGist(part.text)
    gist = split.gist ?? gist
    return { ...part, text: split.reply }
  })
  await readParts(io, parts, gist, gist === null ? 'full' : 'gist')
}

/** Switches the read in progress between the author's gist and the whole reply, from the start. */
export async function switchLevel(io: ReaderIO): Promise<void> {
  const then = await io.read()
  if (!isHeld(then) || held === null) return endReader(io)
  if (held.gist === null) return
  await readParts(io, held.parts, held.gist, held.level === 'gist' ? 'full' : 'gist')
}

async function readParts(io: ReaderIO, parts: ReplyPart[], gist: string | null, level: Level): Promise<void> {
  const reply = parts.map(part => (part.kind === 'text' ? part.text : '')).join('\n\n')
  const runs = speak(linearize(level === 'gist' && gist !== null ? [{ kind: 'text', text: gist }] : parts))
  const wpm = savedSpeed(await io.storedWpm().catch(() => undefined))
  const beats = play(runs, { wpm })
  if (beats.length === 0) {
    io.toast('No finished reply to read yet.')
    return
  }
  const at = await io.now()
  // Awaited: a call left running when the press's hook returns is not sure to finish.
  await io.logRead({ at, wpm, level, reply, ...(gist === null ? {} : { gist }), beats: beats.map(b => [b.text, b.ms, b.kind]) }).catch(() => undefined)
  const id = ++reads
  held = { id, level, parts, gist, runs, beats, ...timeline(beats) }
  const started = startReading(id, beats, at, wpm)
  await io.update(() => started)
  playOn(io, started)
}

/**
 * Moves the read on from `then` by `change`, unless something moved it since:
 * a pause, a speed change and a chunk's timer each act only on the picture
 * they saw. Resolves the new state, or undefined when the read had moved on.
 */
async function moveReader(io: ReaderIO, then: Reading, change: (now: Reading) => HumanQueueReading): Promise<HumanQueueReading | undefined> {
  let moved: HumanQueueReading | undefined
  await io.update(now => {
    if (!isSame(now, then)) return now
    moved = change(now)
    return moved
  })
  return moved
}

/** Faster or slower by one step: the read is paced again and goes on from the word on screen. */
export async function speedReader(io: ReaderIO, delta: number): Promise<void> {
  const then = await io.read()
  if (!isHeld(then) || held === null) return endReader(io)
  const wpm = nudge(then.wpm, delta)
  if (wpm === then.wpm) return
  const was = held
  const beats = play(was.runs, { wpm })
  const at = await io.now()
  // The new beats are in place before the state that draws them.
  held = { ...was, beats, ...timeline(beats) }
  const after = await moveReader(io, then, now => respeed(now, was.beats, beats, at, wpm))
  if (after === undefined) {
    if (held?.id === was.id) held = was
    return
  }
  if (after !== null && after.phase === 'playing') playOn(io, after)
  await io.storeWpm(wpm).catch(() => undefined)
}

/** Once this chunk has played: the next chunk, or the end of the read. */
function playOn(io: ReaderIO, playing: Reading): void {
  if (!isHeld(playing) || held === null) return
  const beats = held.beats
  let ms = 0
  for (let i = playing.from; i < playing.to; i++) ms += beats[i]?.ms ?? 0
  const isLast = playing.to >= playing.count
  io.after(ms + (isLast ? READ_END_HOLD_MS : READ_SWAP_SLACK_MS), async () => {
    if (!isHeld(playing) || held === null) return
    const paced = held.beats
    const at = await io.now()
    const after = await moveReader(io, playing, current => {
      const following = nextChunk(current, paced, at)
      return following === 'done' ? null : following
    })
    if (after === null) held = null
    else if (after !== undefined) playOn(io, after)
  })
}

export async function endReader(io: ReaderIO): Promise<void> {
  held = null
  await io.update(() => null)
}

export async function toggleReader(io: ReaderIO): Promise<void> {
  const then = await io.read()
  if (!isHeld(then) || held === null) return endReader(io)
  const beats = held.beats
  const at = await io.now()
  const after = await moveReader(io, then, now => (now.phase === 'playing' ? pauseReading(now, beats, at) : resumeReading(now, beats, at)))
  if (after !== undefined && after !== null && after.phase === 'playing') playOn(io, after)
}
