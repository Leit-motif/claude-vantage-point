// The Reader's clock: which word is on screen, and how a read starts,
// pauses, resumes, changes speed and moves to its next chunk. The words
// themselves play in the picture's own animation (picture.ts); the hooks
// module only acts at these edges.

import type { HumanQueueReading } from '../../types'
import type { PacedBeat } from './pace.ts'
import { chunkEnd } from './picture.ts'

/**
 * How long a drawn picture takes to start playing after the hooks module
 * draws it. A pause takes it off the elapsed time, so the word held is the
 * one on screen, not the one after it.
 */
export const START_LAG_MS = 120

export type Reading = NonNullable<HumanQueueReading>

/**
 * Speed steps: 50 wpm a nudge, fenced to 200..800; a speed outside the fence
 * is pulled back into it by the first nudge. Interlace's 25 (RsvpSpeed.kt)
 * changed a read by about 8%, which one press never showed (the owner,
 * 2026-10-28, #112).
 */
export const SPEED_STEP = 50
export const SPEED_MIN = 200
export const SPEED_MAX = 800
export const SPEED_DEFAULT = 300

/** The speed one nudge from `current`. */
export function nudge(current: number, delta: number): number {
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, current + delta))
}

/** A saved speed, or the default when it is missing or not a speed. */
export function savedSpeed(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(value))) : SPEED_DEFAULT
}

/** When each beat starts, in ms from the first, and how long the whole read takes. */
export function timeline(beats: readonly { ms: number }[]): { starts: number[]; total: number } {
  const starts: number[] = []
  let total = 0
  for (const beat of beats) {
    starts.push(total)
    total += beat.ms
  }
  return { starts, total }
}

/** The beat on screen `elapsed` ms after the beat at `from` came up; the chunk's last once it has run out. */
export function beatAt(beats: readonly { ms: number }[], from: number, to: number, elapsed: number): number {
  let end = 0
  for (let i = from; i < to; i++) {
    end += beats[i]?.ms ?? 0
    if (elapsed < end) return i
  }
  return Math.max(from, to - 1)
}

/** Whether two states are one picture: a timer or a press acting on `then` may act on `now`. */
export function isSame(now: HumanQueueReading, then: Reading): now is Reading {
  return now !== null && now.id === then.id && now.phase === then.phase && now.from === then.from && now.at === then.at && now.wpm === then.wpm
}

/** A read of `beats` at `wpm`, playing from the first at `now`. */
export function start(id: number, beats: readonly PacedBeat[], now: number, wpm: number): Reading {
  return { id, phase: 'playing', from: 0, to: chunkEnd(beats, 0), at: now, count: beats.length, wpm }
}

/** Holds the word on screen at `now`. */
export function pause(reading: Reading, beats: readonly { ms: number }[], now: number): Reading {
  if (reading.phase === 'paused') return reading
  const held = beatAt(beats, reading.from, reading.to, Math.max(0, now - reading.at - START_LAG_MS))
  return { ...reading, phase: 'paused', from: held, to: held + 1 }
}

/** Plays on from the held word at `now`. */
export function resume(reading: Reading, beats: readonly PacedBeat[], now: number): Reading {
  if (reading.phase === 'playing') return reading
  return { ...reading, phase: 'playing', to: chunkEnd(beats, reading.from), at: now }
}

/**
 * A new speed: `old` are the beats the picture on screen plays, `paced` the
 * same words at `wpm`. Playing, the read goes on from the word on screen at
 * the new pace; held, it stays held.
 */
export function respeed(reading: Reading, old: readonly { ms: number }[], paced: readonly PacedBeat[], now: number, wpm: number): Reading {
  if (reading.phase === 'paused') return { ...reading, wpm }
  const on = beatAt(old, reading.from, reading.to, Math.max(0, now - reading.at - START_LAG_MS))
  return { ...reading, from: on, to: chunkEnd(paced, on), at: now, wpm }
}

/** The next chunk once this one has played, or `done` after the last. */
export function next(reading: Reading, beats: readonly PacedBeat[], now: number): Reading | 'done' {
  if (reading.to >= reading.count) return 'done'
  return { ...reading, from: reading.to, to: chunkEnd(beats, reading.to), at: now }
}
