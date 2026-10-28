// Critical spans (#37): stretches of a reply that would change what the person
// does if they missed them (interlace-android CONTEXT.md). Code finds the
// candidates; Jev only judges the spans it is handed, against the person's
// question and the local passage, and never returns offsets or text. A span Jev
// flags holds longer on screen. The words, their order and the reply text are
// never touched. Pure and free of engine, DOM and Node imports.
//
// The dwell rule is Vantage's own: neither Interlace's research
// (docs/research/2026-10-15-jev-semantic-annotation.md) nor its ADRs set one.
// A flagged word holds at least JEV_DWELL_FACTOR times its plain hold, the
// strength Interlace already gives an actionable quantity (ADR-013), and the
// factor joins the pacer's local maximum instead of multiplying into it, so a
// quantity Jev flags gets no second delay and no flagged word holds longer
// than a code-detected quantity would.

import { pace, PACE_DEFAULTS, wordsOf, type PaceOptions, type PacedBeat } from './pace.ts'
import type { Run } from './stream.ts'

export type SpanKind = 'quantity' | 'qualifier'

/** A candidate critical span: whole words of one prose run, by their place in the paced stream. */
export type Candidate = {
  id: string
  kind: SpanKind
  run: number
  /** The index of the span's first beat, and one past its last. */
  from: number
  to: number
  text: string
}

export const JEV_DWELL_FACTOR = PACE_DEFAULTS.quantityHoldFactor
/** A Noul probability at or above this flags a span, the adapter config's common default. */
export const FLAG_THRESHOLD = 0.5
/** Quantity roles that make a number worth keeping. */
export const RETAINED_ROLES: readonly Role[] = ['instruction', 'comparison']

const QUALIFIER_WORDS = 12
const SPANS_PER_REQUEST = 8
const PASSAGE_CONTEXT_WORDS = 40
const QUESTION_MAX_CHARS = 1500

const MARKERS = new Set([
  'if', 'unless', 'until', 'only', 'except', 'excluding', 'without', 'not', 'never', 'no', 'nor', 'none',
  'cannot', "can't", "don't", "doesn't", "didn't", "won't", "isn't", "aren't", "wasn't", "shouldn't", "mustn't",
  'but', 'however', 'although', 'though', 'instead', 'unlike', 'otherwise', 'provided',
])
const NOT_A_UNIT = new Set([
  'a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'is', 'are', 'was',
  'were', 'be', 'it', 'its', 'as', 'than', 'that', 'this', 'then', 'so', 'vs', 'if', 'but', 'not', 'no',
])

type Word = { text: string; run: number; kind: Run['kind'] }

/** Every word of the runs, split as the pacer splits them, so word i is beat i. */
function words(runs: readonly Run[]): Word[] {
  return runs.flatMap((run, index) => wordsOf(run.text).map(m => ({ text: m[0], run: index, kind: run.kind })))
}

const core = (text: string) => text.replace(/^[^\p{L}\p{Nd}]+|[^\p{L}\p{Nd}'’]+$/gu, '').replace(/’/g, "'").toLowerCase()
const endsClause = (text: string) => /[,;:.!?…]$/.test(text.replace(/["'”’)\]»]+$/, ''))

/**
 * Candidate spans in the prose runs: each number with the unit word after it,
 * and each phrase that opens on a condition, exception, contrast or negation
 * word, to the end of its clause and at most twelve words. Code, tool output
 * and cues are not prose and carry none.
 */
export function candidates(runs: readonly Run[]): Candidate[] {
  const all = words(runs)
  const out: Candidate[] = []
  const add = (kind: SpanKind, from: number, to: number) =>
    out.push({ id: `s${out.length + 1}`, kind, run: all[from]!.run, from, to, text: all.slice(from, to).map(w => w.text).join(' ') })
  let qualifiedTo = 0
  all.forEach((word, i) => {
    if (word.kind !== 'prose') return
    const sameRun = (j: number) => all[j] !== undefined && all[j]!.run === word.run
    if (/\p{Nd}/u.test(word.text)) {
      const next = sameRun(i + 1) && !endsClause(word.text) ? all[i + 1]!.text.replace(/[.,;:!?)\]"'”’]+$/, '') : ''
      const unit = /^[\p{Ll}%°µ/]{1,10}$/u.test(next) && !NOT_A_UNIT.has(next)
      add('quantity', i, unit ? i + 2 : i + 1)
    }
    if (i >= qualifiedTo && MARKERS.has(core(word.text))) {
      let end = i
      while (end - i < QUALIFIER_WORDS - 1 && sameRun(end + 1) && !endsClause(all[end]!.text)) end++
      add('qualifier', i, end + 1)
      qualifiedTo = end + 1
    }
  })
  return out
}

// ------------------------------------------------------------ Jev requests

export type Role = 'instruction' | 'comparison' | 'example' | 'identifier' | 'other'
export const ROLES: readonly Role[] = ['instruction', 'comparison', 'example', 'identifier', 'other']

export type JevQuestion =
  | { type: 'noul'; instructions: string }
  | { type: 'choice'; instructions: string; criteria: Record<Role, string> }

/** One Jev request: one passage, the question it answers, and the spans to judge in it. */
export type JevRequest = {
  unit: string
  state: { user_question: string; passage: string; spans: Record<string, string> }
  questions: Record<string, JevQuestion>
}

const STATE =
  'The state holds a question a user asked an AI assistant (user_question), one passage of the assistant\'s reply ' +
  '(passage), and candidate spans quoted from that passage, keyed by id (spans).'

/** The three judgments the research scopes (its §3A table), one set per span. */
export function spanQuestions(id: string, kind: SpanKind): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {
    [`${id}.answers`]: {
      type: 'noul',
      instructions: `${STATE} Estimate the probability that span ${id} directly answers the user's question: it states the ` +
        'answer, or part of the answer, that the user asked for. Return a low probability for background, setup, a ' +
        'restatement of the question, or a detail the question did not ask about. Judge only the supplied state.',
    },
    [`${id}.qualifies`]: {
      type: 'noul',
      instructions: `${STATE} Estimate the probability that span ${id} carries a condition, an exception or a negation ` +
        'that changes what the reply recommends or what the user should do, so that missing it would lead the user to ' +
        'act differently. Return a low probability for a condition or negation that changes nothing the user would do. ' +
        'Judge only the supplied state.',
    },
  }
  if (kind === 'quantity') {
    questions[`${id}.role`] = {
      type: 'choice',
      instructions: `${STATE} Classify the role the number in span ${id} plays in the reply. Judge only the supplied state.`,
      criteria: {
        instruction: 'a number the user is told to use or act on: a dose, a setting, a limit, a time, an amount to do',
        comparison: 'a number set against another to show a difference: a before and after, a ratio, a ranking',
        example: 'a number inside an illustration, a hypothetical or a sample',
        identifier: 'a number that names something rather than measuring it: a version, an issue, a line, a commit, an id',
        other: 'any other number',
      },
    }
  }
  return questions
}

/**
 * The requests for one reply: per prose run, up to eight spans with the run's
 * words around them as the passage. Jev is less reliable on long contexts, so
 * it sees the local passage and the question, never the whole reply.
 */
export function jevRequests(prefix: string, question: string, runs: readonly Run[], spans: readonly Candidate[]): JevRequest[] {
  const all = words(runs)
  const out: JevRequest[] = []
  const byRun = new Map<number, Candidate[]>()
  for (const span of spans) byRun.set(span.run, [...(byRun.get(span.run) ?? []), span])
  for (const group of byRun.values()) {
    for (let i = 0; i < group.length; i += SPANS_PER_REQUEST) {
      const batch = group.slice(i, i + SPANS_PER_REQUEST)
      const run = batch[0]!.run
      const first = all.findIndex(w => w.run === run)
      const last = all.findLastIndex(w => w.run === run)
      const from = Math.max(first, batch[0]!.from - PASSAGE_CONTEXT_WORDS)
      const to = Math.min(last + 1, Math.max(...batch.map(s => s.to)) + PASSAGE_CONTEXT_WORDS)
      out.push({
        unit: `${prefix}.u${out.length + 1}`,
        state: {
          user_question: question.slice(0, QUESTION_MAX_CHARS),
          passage: all.slice(from, to).map(w => w.text).join(' '),
          spans: Object.fromEntries(batch.map(s => [s.id, s.text])),
        },
        questions: Object.assign({}, ...batch.map(s => spanQuestions(s.id, s.kind))),
      })
    }
  }
  return out
}

// ------------------------------------------------------------ answers

/** Jev's answers about one span. A malformed or missing answer stays absent. */
export type SpanAnswers = { answers?: number; qualifies?: number; role?: Role }
export type Judgment = 'answers' | 'qualifies' | 'role'

const probability = (answer: unknown): number | undefined => {
  const p = (answer as { noul?: unknown } | null)?.noul
  return typeof p === 'number' && p >= 0 && p <= 1 ? p : undefined
}

/** Reads raw adapter answers, keyed `<span>.<judgment>`, into one set of answers per span. */
export function spanAnswers(answers: Readonly<Record<string, unknown>>): Map<string, SpanAnswers> {
  const out = new Map<string, SpanAnswers>()
  for (const [key, answer] of Object.entries(answers)) {
    const dot = key.lastIndexOf('.')
    if (dot <= 0) continue
    const id = key.slice(0, dot)
    const got = out.get(id) ?? {}
    const judgment = key.slice(dot + 1)
    if (judgment === 'answers' || judgment === 'qualifies') {
      const p = probability(answer)
      if (p !== undefined) got[judgment] = p
    } else if (judgment === 'role') {
      const choice = (answer as { choice?: unknown } | null)?.choice
      if (ROLES.includes(choice as Role)) got.role = choice as Role
    }
    out.set(id, got)
  }
  return out
}

/** Which judgments flag the span. Any one makes it critical. */
export function flags(span: SpanAnswers | undefined): Judgment[] {
  if (span === undefined) return []
  const out: Judgment[] = []
  if ((span.answers ?? 0) >= FLAG_THRESHOLD) out.push('answers')
  if ((span.qualifies ?? 0) >= FLAG_THRESHOLD) out.push('qualifies')
  if (span.role !== undefined && RETAINED_ROLES.includes(span.role)) out.push('role')
  return out
}

// ------------------------------------------------------------ dwell

/**
 * The same reply paced with every local emphasis off (no trough, no quantity
 * hold): each word's plain hold at the passage rate, which local factors scale.
 */
export function plainHolds(runs: Run[], options: PaceOptions = {}): PacedBeat[] {
  return pace(runs, { ...options, quantityHoldFactor: 1, boundaryClauseDepth: 0, boundarySentenceDepth: 0, boundaryParagraphDepth: 0 })
}

/**
 * The Jev variant: `beats` (the no-Jev Reader, `pace()` as it is) with every
 * word of a flagged span held at least JEV_DWELL_FACTOR times its plain hold.
 * Nothing else changes, so the two variants differ only on flagged words.
 */
export function applyCriticalSpans(beats: readonly PacedBeat[], plain: readonly PacedBeat[], flagged: readonly Candidate[], minHoldMs = PACE_DEFAULTS.minHoldMs): PacedBeat[] {
  if (plain.length !== beats.length || plain.some((b, i) => b.text !== beats[i]!.text)) {
    throw new RangeError('applyCriticalSpans: plain holds must pace the same words')
  }
  const held = new Set<number>()
  for (const span of flagged) for (let i = span.from; i < span.to; i++) held.add(i)
  return beats.map((beat, i) =>
    held.has(i) ? { ...beat, ms: Math.max(beat.ms, Math.round(plain[i]!.ms * JEV_DWELL_FACTOR), minHoldMs) } : beat)
}
