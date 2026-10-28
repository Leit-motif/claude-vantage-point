// The Reader's pacing engine: a port of interlace-android's `core/rsvp/Pacer.kt`
// as it runs on the phone today (ADR-007, ADR-011, ADR-012, ADR-013), for a
// reply that has fully arrived. Pure, deterministic, and free of engine, DOM
// and Node imports, so the mod and node both run it.
//
// A hold is `(60000 / rate) × shape × max(trough, emphasis)`:
// - the rate is the passage lean, a density curve ramped at 4% a word;
// - shape is the word's own length, unsmoothed, so the dial is the mean rate;
// - the trough and quantity emphasis are local, and the strongest one wins.
// None of them is a pause added to a hold, so the words never stop coming.

import type { Beat, Place, Run } from './stream.ts'

export type Pulse = 'fast' | 'normal' | 'slow'
export type Boundary = 'clause' | 'sentence' | 'paragraph'

/** A beat with what the Reader draws besides the word. */
export type PacedBeat = Beat & {
  /** The UTF-16 index of the letter the eye fixates (Interlace `FocusPoint`). */
  pivot: number
  /** How dense the prose reads here; it paces the word and is not drawn: the anchor stays red (#112). */
  pulse: Pulse
  /** The edge this word sits on, when it sits on one. */
  boundary?: Boundary
  /** Drawn other than as a word (forms.ts): a symbol whole in its frame, or a code block. */
  form?: 'symbol' | 'block'
  /** Where the word sits in the reply's layout (speak.ts), drawn above it. */
  place?: Place
  /** A code plate's width in characters and height in rows: its block's widest row and tallest plate, so every plate of one block draws alike. */
  cols?: number
  rows?: number
}

export type DensityWeights = {
  bias: number
  meanWords: number
  tokenCount: number
  punctuation: number
  longWordRatio: number
  codeMarkers: number
  acronyms: number
  numerics: number
  definitions: number
  causals: number
  contrasts: number
  longWordChars: number
}

export type DensityMarkers = { definition: readonly string[]; causal: readonly string[]; contrast: readonly string[] }

/**
 * Interlace's `RsvpConfig` pacing defaults on main, by the same names, plus
 * `densityWindowWords`, which is Vantage's own.
 */
export type PaceTuning = {
  readonly wpm: number
  readonly minWpm: number
  readonly maxWpm: number
  readonly boundaryClauseDepth: number
  readonly boundarySentenceDepth: number
  readonly boundaryParagraphDepth: number
  readonly boundarySpanWords: number
  readonly boundaryRecoveryWords: number
  readonly shapeBase: number
  readonly shapeRefChars: number
  readonly shapeMin: number
  readonly shapeMax: number
  readonly shapeStrength: number
  readonly minHoldMs: number
  readonly quantityHoldFactor: number
  readonly quantityMinShape: number
  readonly quantityMaxFactor: number
  readonly curveMaxWpm: number
  readonly curveMinWpm: number
  readonly curveNeutralDensity: number
  readonly curveGamma: number
  readonly floorFactor: number
  readonly ceilFactor: number
  readonly maxWpmStepPerWord: number
  readonly rampStartFactor: number
  readonly rampEndFactor: number
  readonly rampOutWords: number
  readonly smoothingWindow: number
  readonly densityWindowWords: number
  readonly pulseFastThreshold: number
  readonly pulseNormalThreshold: number
  readonly pulseHysteresis: number
  readonly densityWeights: DensityWeights
  readonly densityMarkers: DensityMarkers
}

export const PACE_DEFAULTS: PaceTuning = Object.freeze({
  wpm: 300,
  minWpm: 60,
  maxWpm: 900,
  boundaryClauseDepth: 0,
  boundarySentenceDepth: 0,
  boundaryParagraphDepth: 0.45,
  boundarySpanWords: 2,
  boundaryRecoveryWords: 1,
  shapeBase: 4,
  shapeRefChars: 4,
  shapeMin: 0.55,
  shapeMax: 2.2,
  shapeStrength: 1,
  minHoldMs: 60,
  quantityHoldFactor: 1.65,
  quantityMinShape: 1.2,
  quantityMaxFactor: 2,
  curveMaxWpm: 600,
  curveMinWpm: 250,
  curveNeutralDensity: 0.06,
  curveGamma: 1.15,
  floorFactor: 0.55,
  ceilFactor: 1.15,
  maxWpmStepPerWord: 0.04,
  rampStartFactor: 0.6,
  rampEndFactor: 0.6,
  rampOutWords: 6,
  smoothingWindow: 3,
  // Interlace rescores a sentence's whole prefix on every word, which costs n²
  // over a sentence with no end. That is cheap at reading speed and is not cheap
  // for a whole reply paced at once (minified JSON in a code run), so a longer
  // sentence is scored on its last 64 words. No real sentence reaches 64.
  densityWindowWords: 64,
  pulseFastThreshold: 0.3,
  pulseNormalThreshold: 0.6,
  pulseHysteresis: 0.05,
  densityWeights: Object.freeze({
    bias: -5.72,
    meanWords: 0.114,
    tokenCount: 0.066,
    punctuation: 0.121,
    longWordRatio: 5.28,
    codeMarkers: 0.704,
    acronyms: 0.88,
    numerics: 0.572,
    definitions: 1.98,
    causals: 1.144,
    contrasts: 0.968,
    longWordChars: 9,
  }),
  densityMarkers: Object.freeze({
    definition: Object.freeze(['is defined as', 'are defined as', 'means', 'refers to', 'that is to say']),
    causal: Object.freeze(['therefore', 'thus', 'because', 'implies', 'hence', 'so that', 'which is why']),
    contrast: Object.freeze(['however', 'but', 'although', 'rather than', 'whereas', 'instead']),
  }),
})

export type PaceOptions = Partial<PaceTuning>

type Token = {
  text: string
  kind: Run['kind']
  run: number
  /** The last word of a block: a paragraph trough lands here. */
  endsBlock: boolean
  /** A code word a newline follows: a statement ends here. */
  endsLine: boolean
}

/**
 * Paces a whole reply. One call is one Interlace turn: it eases in from the
 * first word and out over the last few, and every word sees the two after it.
 * A `meter`, if given, counts the words scored, which is the pacer's cost.
 */
export function pace(runs: Run[], options: PaceOptions = {}, meter?: { scored: number }): PacedBeat[] {
  const t = tuning(options)
  const base = Math.min(Math.max(Number.isNaN(t.wpm) ? PACE_DEFAULTS.wpm : t.wpm, t.minWpm), t.maxWpm)
  const tokens = tokenize(runs)
  const quantity = quantityContext()

  let chunk: Word[] = []
  const completed: number[] = []
  let effective = base * t.rampStartFactor
  let pulse: Pulse = 'normal'
  const recent: (Boundary | null)[] = []

  return tokens.map((token, i) => {
    const lookahead = tokens.slice(i + 1, i + 1 + t.boundarySpanWords)
    const remaining = tokens.length - i - 1

    chunk.push(wordOf(token.text, t.densityWeights))
    if (chunk.length > t.densityWindowWords) chunk.shift()
    const current = score(chunk, t.densityWeights, t.densityMarkers)
    if (meter) meter.scored += chunk.length
    const smoothed = completed.reduce((sum, d) => sum + d, current) / (completed.length + 1)
    pulse = hysteresis(pulse, smoothed, t)

    const target = remaining < t.rampOutWords ? base * t.rampEndFactor : curveWpm(smoothed, base, t)
    const step = effective * t.maxWpmStepPerWord
    const moved = Math.abs(target - effective) <= step ? target : target > effective ? effective + step : effective - step
    effective = Math.min(Math.max(moved, t.minWpm), t.maxWpm)

    if (endsSentence(token)) {
      completed.unshift(current)
      completed.length = Math.min(completed.length, t.smoothingWindow - 1)
      chunk = []
    }

    const here = boundaryOf(token)
    const wordShape = shape(token, t)
    const trough = envelope(here, recent, lookahead, t)
    const emphasis = quantity(token, lookahead) && t.quantityHoldFactor > 1
      ? Math.min(Math.max(t.quantityHoldFactor, t.quantityMinShape / wordShape), t.quantityMaxFactor)
      : 1
    // Local contributions take the strongest, never the product: a dose at a
    // paragraph end is one important thing, not two delays (ADR-013). A later
    // per-word input, such as a Jev critical span (#37), joins this max.
    const local = Math.max(trough, emphasis)
    const ms = Math.max(Math.round((60_000 / effective) * wordShape * local), t.minHoldMs)

    recent.unshift(here)
    recent.length = Math.min(recent.length, t.boundaryRecoveryWords)
    const beat: PacedBeat = { text: token.text, kind: token.kind, ms, run: token.run, pivot: pivot(token.text), pulse }
    if (here) beat.boundary = here
    return beat
  })
}

/**
 * The defaults with the options laid over them, skipping undefined keys.
 * Invalid tunings throw, as Interlace's `RsvpConfig` refuses them; only the
 * dial is clamped, as Interlace's pacer clamps it.
 */
function tuning(options: PaceOptions): PaceTuning {
  const defined = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined))
  const t: PaceTuning = { ...PACE_DEFAULTS, ...defined }
  const refuse = (rule: string) => { throw new RangeError(`pace: ${rule}`) }
  for (const [key, value] of Object.entries(t)) {
    if (key === 'wpm' || typeof value === 'object') continue
    if (typeof value !== 'number' || !Number.isFinite(value)) refuse(`${key} must be a finite number, got ${String(value)}`)
  }
  if (typeof t.wpm !== 'number') refuse(`wpm must be a number, got ${String(t.wpm)}`)
  for (const [key, value] of Object.entries(t.densityWeights ?? {})) {
    if (!Number.isFinite(value)) refuse(`densityWeights.${key} must be a finite number, got ${String(value)}`)
  }
  if (Object.keys(t.densityWeights ?? {}).length !== Object.keys(PACE_DEFAULTS.densityWeights).length) refuse('densityWeights must give every weight')
  for (const list of ['definition', 'causal', 'contrast'] as const) {
    if (!Array.isArray(t.densityMarkers?.[list])) refuse(`densityMarkers.${list} must be a list of phrases`)
  }
  const whole = ['boundarySpanWords', 'boundaryRecoveryWords', 'rampOutWords', 'smoothingWindow', 'densityWindowWords'] as const
  for (const key of whole) if (!Number.isInteger(t[key])) refuse(`${key} must be a whole number`)
  const rules: [boolean, string][] = [
    [t.minWpm > 0, 'minWpm must be positive'],
    [t.maxWpm >= t.minWpm, 'maxWpm must be >= minWpm'],
    [t.curveMinWpm > 0, 'curveMinWpm must be positive'],
    [t.curveMaxWpm >= t.curveMinWpm, 'curveMaxWpm must be >= curveMinWpm'],
    [t.curveNeutralDensity > 0 && t.curveNeutralDensity < 1, 'curveNeutralDensity must be in (0, 1)'],
    [t.shapeBase >= 0, 'shapeBase must not be negative'],
    [t.shapeRefChars > 0, 'shapeRefChars must be positive'],
    [t.shapeMin > 0 && t.shapeMin <= t.shapeMax, 'shapeMin must be in (0, shapeMax]'],
    [t.shapeStrength >= 0, 'shapeStrength must not be negative'],
    [t.minHoldMs >= 0, 'minHoldMs must not be negative'],
    [t.quantityMaxFactor >= 1 && t.quantityMaxFactor <= 2.5, 'quantityMaxFactor must be in [1, 2.5]'],
    [t.quantityHoldFactor >= 1 && t.quantityHoldFactor <= t.quantityMaxFactor, 'quantityHoldFactor must be in [1, quantityMaxFactor]'],
    [t.quantityMinShape > 0, 'quantityMinShape must be positive'],
    [t.boundaryClauseDepth >= 0 && t.boundarySentenceDepth >= 0 && t.boundaryParagraphDepth >= 0, 'boundary depths must not be negative'],
    [t.boundarySpanWords >= 0 && t.boundaryRecoveryWords >= 0, 'boundary spans must not be negative'],
    [t.floorFactor > 0 && t.floorFactor <= t.ceilFactor, 'floorFactor must be in (0, ceilFactor]'],
    [t.maxWpmStepPerWord > 0, 'maxWpmStepPerWord must be positive'],
    [t.rampStartFactor > 0 && t.rampEndFactor > 0, 'ramp factors must be positive'],
    [t.rampOutWords >= 0, 'rampOutWords must not be negative'],
    [t.smoothingWindow > 0, 'smoothingWindow must be positive'],
    [t.densityWindowWords > 0, 'densityWindowWords must be positive'],
    [t.pulseFastThreshold <= t.pulseNormalThreshold, 'pulse thresholds must be ordered'],
    [t.pulseHysteresis >= 0, 'pulseHysteresis must not be negative'],
  ]
  for (const [ok, rule] of rules) if (!ok) refuse(rule)
  return t
}

/** A text's words, one beat each: every split of a reply into words goes through here, so word i is beat i. */
export const wordsOf = (text: string) => [...text.matchAll(/\S+/g)]

/**
 * Splits runs into words. A run's end is a block boundary, except where it is
 * a cue, which names what follows and leans into it, and except at the end of
 * the reply, where Interlace eases out instead (its last word carries no block
 * separator).
 */
function tokenize(runs: Run[]): Token[] {
  const tokens: Token[] = []
  runs.forEach((run, index) => {
    const words = wordsOf(run.text)
    words.forEach((match, w) => {
      const last = w === words.length - 1
      const gap = last ? '' : run.text.slice(match.index + match[0].length, words[w + 1]!.index)
      tokens.push({
        text: match[0],
        kind: run.kind,
        run: index,
        endsBlock: last && run.kind !== 'cue',
        endsLine: run.kind === 'code' && gap.includes('\n'),
      })
    })
  })
  const final = tokens.at(-1)
  if (final) final.endsBlock = false
  return tokens
}

const SENTENCE_END = '.?!…'
const CLAUSE_END = ',;:'

/** Interlace `Boundary.of`. Code punctuation is read, not a break; its line end is a statement. */
function boundaryOf(token: Token): Boundary | null {
  if (token.endsBlock) return 'paragraph'
  if (token.kind === 'code') return token.endsLine ? 'sentence' : null
  const last = trimEndOf(token.text, `"')]»”’`).at(-1) ?? ''
  if (last && SENTENCE_END.includes(last)) return 'sentence'
  if (last && CLAUSE_END.includes(last)) return 'clause'
  return null
}

/** Interlace `SentenceStep.isBoundary`: where a density chunk closes and quantity context clears. */
function endsSentence(token: Token): boolean {
  if (token.endsBlock) return true
  if (token.kind === 'code') return token.endsLine
  const last = trimEndOf(token.text, `"'”’)]}»`).at(-1) ?? ''
  return last !== '' && SENTENCE_END.includes(last)
}

function depth(boundary: Boundary, t: PaceTuning): number {
  return boundary === 'paragraph' ? t.boundaryParagraphDepth
    : boundary === 'sentence' ? t.boundarySentenceDepth
    : t.boundaryClauseDepth
}

/**
 * The trough (ADR-012): deepest on the boundary word, reaching two words into
 * it and one out of it, the strongest nearby boundary winning.
 */
function envelope(here: Boundary | null, recent: (Boundary | null)[], lookahead: Token[], t: PaceTuning): number {
  let strongest = 0
  const consider = (boundary: Boundary | null, distance: number) => {
    if (!boundary) return
    const span = distance < 0 ? t.boundarySpanWords : t.boundaryRecoveryWords
    const steps = Math.abs(distance)
    if (steps > span) return
    strongest = Math.max(strongest, depth(boundary, t) * ((span + 1 - steps) / (span + 1)))
  }
  consider(here, 0)
  lookahead.forEach((ahead, index) => consider(boundaryOf(ahead), -(index + 1)))
  recent.forEach((past, index) => consider(past, index + 1))
  return 1 + strongest
}

/**
 * The word's own length as a multiple of the passage hold (ADR-011). Prose is
 * measured on its letters and digits, so a comma never buys a pause; code is
 * read symbol by symbol, so every character counts.
 */
function shape(token: Pick<Token, 'text' | 'kind'>, t: PaceTuning): number {
  const glyphs = token.kind === 'code' ? token.text.length : core(token.text).length
  const raw = (t.shapeBase + glyphs) / (t.shapeBase + t.shapeRefChars)
  const clamped = Math.min(Math.max(raw, t.shapeMin), t.shapeMax)
  return 1 + (clamped - 1) * t.shapeStrength
}

/**
 * The share of a beat's hold its length bought, at the default tuning: a
 * beat's hold over this is what a reference word would have held there, with
 * the rate, ramp and troughs kept (forms.ts holds a symbol by it).
 */
export const lengthShare = (beat: Pick<Beat, 'text' | 'kind'>): number => shape(beat, PACE_DEFAULTS)

function curveWpm(density: number, base: number, t: PaceTuning): number {
  const at = (d: number) => t.curveMaxWpm + (t.curveMinWpm - t.curveMaxWpm) * Math.min(Math.max(d, 0), 1) ** t.curveGamma
  const wpm = base * at(density) / at(t.curveNeutralDensity)
  const leaned = Math.min(Math.max(wpm, base * t.floorFactor), base * t.ceilFactor)
  return Math.min(Math.max(leaned, t.minWpm), t.maxWpm)
}

const PULSES: Pulse[] = ['fast', 'normal', 'slow']

function hysteresis(held: Pulse, density: number, t: PaceTuning): Pulse {
  const proposed: Pulse = density < t.pulseFastThreshold ? 'fast' : density < t.pulseNormalThreshold ? 'normal' : 'slow'
  if (proposed === held) return held
  const higher = Math.max(PULSES.indexOf(proposed), PULSES.indexOf(held))
  const edge = higher === 1 ? t.pulseFastThreshold : t.pulseNormalThreshold
  return Math.abs(density - edge) >= t.pulseHysteresis ? proposed : held
}

const LETTER_OR_DIGIT = /^[\p{L}\p{Nd}]$/u
const isLetterOrDigit = (unit: string) => LETTER_OR_DIGIT.test(unit)

/** The token with leading and trailing non-letters trimmed, per UTF-16 unit as Kotlin trims. */
function core(text: string): string {
  let start = 0
  let end = text.length
  while (start < end && !isLetterOrDigit(text[start]!)) start++
  while (end > start && !isLetterOrDigit(text[end - 1]!)) end--
  return text.slice(start, end)
}

/** Interlace `FocusPoint.index`: the optimal recognition point, left of centre. */
export function pivot(token: string): number {
  if (token === '') return 0
  const units = [...Array(token.length).keys()].filter(i => isLetterOrDigit(token[i]!))
  const first = units[0] ?? -1
  const start = first < 0 ? 0 : first
  const length = first < 0 ? token.length : units.at(-1)! - first + 1
  const offset = length <= 1 ? 0 : length <= 5 ? 1 : length <= 9 ? 2 : length <= 13 ? 3 : 4
  return Math.min(Math.max(start + offset, 0), token.length - 1)
}

function trimStartOf(text: string, chars: string): string {
  let start = 0
  while (start < text.length && chars.includes(text[start]!)) start++
  return text.slice(start)
}

function trimEndOf(text: string, chars: string): string {
  let end = text.length
  while (end > 0 && chars.includes(text[end - 1]!)) end--
  return text.slice(0, end)
}

// ---------------------------------------------------------------- density

// Java's `\s` is ASCII whitespace; matching it keeps the golden scores exact.
const WHITESPACE = /[ \t\n\x0B\f\r]+/
const ACRONYM = /^[A-Z]{2,}$/
const NUMERIC = /^[-+]?[\d.,]*\d[\d.,]*%?$/
const SENTENCE_RUN = /[.!?]+$/

/**
 * One word's share of a chunk's density features. The portal scores a chunk's
 * text, but every feature except the marker phrases is a sum over its words,
 * so a word is measured once and a chunk is scored by adding them up.
 */
type Word = {
  text: string
  punctuation: number
  codeMarkers: number
  long: boolean
  acronym: boolean
  numeric: boolean
  /** It ends in `.`, `!` or `?`, so a sub-sentence ends after it unless it is last. */
  ends: boolean
  /** Something is left of it once that ending run is cut. */
  body: boolean
}

function wordOf(text: string, weights: DensityWeights): Word {
  const run = SENTENCE_RUN.exec(text)?.[0].length ?? 0
  return {
    text,
    punctuation: text.match(/[,;()]/g)?.length ?? 0,
    codeMarkers: text.match(/[`{}()]|::|->|=|\+/g)?.length ?? 0,
    long: text.replace(/[^A-Za-z-]/g, '').length >= weights.longWordChars,
    acronym: ACRONYM.test(text.replace(/[^A-Za-z]/g, '')),
    numeric: NUMERIC.test(text),
    ends: run > 0,
    body: run < text.length,
  }
}

/**
 * How hard a chunk of prose is to read, in (0, 1): Interlace `Density.score`,
 * itself a port of the visual-brief portal's `scoreChunk`, pinned by the
 * portal's golden fixture. A prefix scores as if it were the whole chunk.
 */
export function density(
  text: string,
  weights: DensityWeights = PACE_DEFAULTS.densityWeights,
  markers: DensityMarkers = PACE_DEFAULTS.densityMarkers,
): number {
  return score(text.split(WHITESPACE).filter(s => s !== '').map(s => wordOf(s, weights)), weights, markers)
}

function score(words: Word[], weights: DensityWeights, markers: DensityMarkers): number {
  const n = words.length === 0 ? 1 : words.length
  let subs = 0
  let open = false
  let punctuation = 0
  let longWords = 0
  let codeMarkers = 0
  let acronyms = 0
  let numerics = 0
  words.forEach((word, i) => {
    // The portal splits on `[.!?]+\s` and drops blank pieces.
    const last = i === words.length - 1
    open ||= word.body || last
    if (word.ends && !last) {
      if (open) subs++
      open = false
    }
    punctuation += word.punctuation
    codeMarkers += word.codeMarkers
    if (word.long) longWords++
    if (word.acronym) acronyms++
    if (word.numeric) numerics++
  })
  if (open) subs++
  const lower = words.map(w => w.text).join(' ').toLowerCase()

  const sum = weights.bias +
    weights.meanWords * (subs > 0 ? n / subs : n) +
    weights.tokenCount * n +
    weights.punctuation * ((punctuation / n) * 100) +
    weights.longWordRatio * (longWords / n) +
    weights.codeMarkers * codeMarkers +
    weights.acronyms * acronyms +
    weights.numerics * numerics +
    weights.definitions * countMarkers(lower, markers.definition) +
    weights.causals * countMarkers(lower, markers.causal) +
    weights.contrasts * countMarkers(lower, markers.contrast)
  return 1 / (1 + Math.exp(-sum))
}

const MARKER_PATTERNS = new Map<string, RegExp>()

/** Word-bounded, overlapping occurrences, as the portal scans. */
function countMarkers(text: string, phrases: readonly string[]): number {
  let total = 0
  for (const phrase of phrases) {
    if (!text.includes(phrase)) continue
    let re = MARKER_PATTERNS.get(phrase)
    if (!re) {
      re = new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`, 'g')
      MARKER_PATTERNS.set(phrase, re)
    }
    let from = 0
    while (from <= text.length) {
      re.lastIndex = from
      const match = re.exec(text)
      if (!match) break
      total++
      from = match.index + 1
    }
  }
  return total
}

// --------------------------------------------------------------- quantity

const VALUE = '[+-]?(?:[0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?|\\.[0-9]+)(?:/[0-9]+)?'
const whole = (source: string) => new RegExp(`^(?:${source})$`)
const NUMBER = whole(`(?:${VALUE})(?:[-–—](?:${VALUE}))?|[0-9]+(?:st|nd|rd|th)`)
const INDEX = whole('[0-9]+[.)]')
const MONEY = whole(`[+-]?[$€£¥₹]${VALUE}`)
const PERCENT = whole(`${VALUE}%`)
const DATE = whole('[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}')
const TIME = whole('(?:[01]?[0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?(?:am|pm)?')
const ATTACHED = new RegExp(`^(${VALUE})([%°a-zµμ/]+)$`)
const LABELS = new Set(['version', 'versions', 'v', 'build', 'model', 'chapter', 'section', 'step', 'item', 'issue', 'figure', 'table', 'page', 'option', 'options'])
const COMPARISONS = new Set(['to', 'vs', 'vs.', 'versus', 'than', 'or', 'and'])
const ACTIONS = new Set(['use', 'take', 'eat', 'drink', 'add', 'buy', 'pay', 'cost', 'costs', 'weighs', 'wait', 'needs', 'need', 'limit', 'total', 'dose', 'dosage', 'maximum', 'minimum', 'ratio', 'under', 'over', 'below', 'above', 'within', 'exactly', 'approximately', 'roughly', 'about', 'least', 'most'])
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec']
const MONTH_SET = new Set(MONTHS)
const UNITS = new Set([
  'oz', 'ounce', 'ounces', 'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'mg', 'mcg', 'µg', 'μg', 'lb', 'lbs', 'pound', 'pounds',
  'ml', 'l', 'liter', 'liters', 'litre', 'litres', 'cup', 'cups', 'tbsp', 'tsp', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons',
  'mm', 'cm', 'm', 'km', 'inch', 'inches', 'ft', 'feet', 'meter', 'meters', 'metre', 'metres', 'mile', 'miles', 'mph', 'km/h', '°c', '°f', 'degrees',
  'ms', 's', 'sec', 'secs', 'second', 'seconds', 'min', 'mins', 'minute', 'minutes', 'hr', 'hrs', 'hour', 'hours', 'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years', 'am', 'pm',
  '%', 'percent', 'percentage', 'usd', 'eur', 'gbp', 'dollar', 'dollars', 'euro', 'euros',
  'egg', 'eggs', 'serving', 'servings', 'tablet', 'tablets', 'capsule', 'capsules', 'dose', 'doses', 'rep', 'reps', 'set', 'sets', 'piece', 'pieces', 'person', 'people', 'times',
  ...MONTHS,
])

const clean = (text: string) => trimEndOf(trimStartOf(text.toLowerCase(), `"'“‘([{`), `"'”’)]},;:.!?`)
const numeric = (text: string | undefined) => text !== undefined && NUMBER.test(text)
const isUnit = (text: string | undefined) => text !== undefined && UNITS.has(text.replaceAll('.', ''))
const explicit = (text: string | undefined) => text !== undefined && (
  MONEY.test(text) || PERCENT.test(text) || DATE.test(text) || TIME.test(text) || isUnit(ATTACHED.exec(text)?.[2]))
const labelled = (text: string | undefined) => text !== undefined && LABELS.has(text)

function actionable(text: string, before: string[], after: string[]): boolean {
  const [b1, b2, b3] = [before.at(-1), before.at(-2), before.at(-3)]
  if (labelled(b1) || text.startsWith('#')) return false
  if (explicit(text)) return true
  if (!numeric(text)) return false
  if (isUnit(after[0]) || isUnit(b1)) return true
  if (b1 !== undefined && ACTIONS.has(b1)) return true
  if (numeric(b1) && b2 !== undefined && MONTH_SET.has(b2)) return true
  // Context on both sides tells a comparison from "refers to 128" or "version 5".
  if (after[0] !== undefined && COMPARISONS.has(after[0]) && numeric(after[1])) return true
  if (b1 !== undefined && COMPARISONS.has(b1) && numeric(b2) && !labelled(b3)) return true
  return false
}

/**
 * Interlace's `QuantityContext` (ADR-013): a number with actionable context,
 * and its unit, read from three words behind and two ahead within a sentence.
 * Code is verbatim, so its numbers are literals and get no emphasis.
 */
function quantityContext(): (token: Token, lookahead: Token[]) => boolean {
  const previous: Token[] = []
  return (token, lookahead) => {
    if (token.kind === 'code') {
      previous.length = 0
      return false
    }
    const boundary = endsSentence(token)
    const before = previous.map(p => clean(p.text))
    const after: string[] = []
    if (!boundary) {
      for (const ahead of lookahead.slice(0, 2)) {
        if (ahead.kind === 'code') break
        after.push(clean(ahead.text))
        if (endsSentence(ahead)) break
      }
    }
    const text = clean(token.text)
    const isIndex = INDEX.test(token.text) && previous.length === 0
    const number = !isIndex && actionable(text, before, after)
    const [b1, b2] = [before.at(-1), before.at(-2)]
    const unit = isUnit(text) && (
      ((numeric(b1) || explicit(b1)) && !labelled(b2)) ||
      (numeric(after[0]) && !labelled(b1)))
    if (boundary) previous.length = 0
    else {
      previous.push(token)
      if (previous.length > 3) previous.shift()
    }
    return number || unit
  }
}
