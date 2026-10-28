// The visuals-grading round (#98): each ask drawn once per lead view its facts
// allow, plus the text card, stacked A, B, C… for the owner to pick the one they
// would rule from fastest. Which asks, which options, their order, and the
// message the picks go back as. Pure.

import { TECHNIQUES } from './catalog.ts'
import type { Plan } from './compose.ts'
import { DRAWN_VIEWS, drawsWhole } from './draw.ts'
import { eligible, parseFacts, type Facts } from './facts.ts'

/** One ask in the round: a case of the frozen set (evals/composer/cases.json). */
export type GradeCase = { id: string; question: string; prose: string; facts: Facts }
/** The owner's pick for one ask: a view, `text` for the text card, or `none` when no option fits. */
export type Pick = { pick: string; comment?: string }

/** The text card's option id: the question and the answers, no picture. */
export const TEXT_OPTION = 'text'
export const NONE_OPTION = 'none'
/** At most this many asks: about twelve minutes of the owner's time. */
export const ROUND_SIZE = 12

const isLead = (id: string) => TECHNIQUES.find(one => one.id === id)?.slot === 'lead'

/** A 32-bit FNV-1a hash, so an ask's options keep one order for every session. */
function seeded(s: string): number {
  let h = 0x811c9dc5
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0
  return h
}

/**
 * An ask's options: every lead view the desktop draws whole at this width, then
 * the text card, in an order seeded by the ask so the composer's favourite is
 * not always first.
 */
export function gradeOptions(one: GradeCase, room: number): string[] {
  const leads = eligible(one.facts, 'desktop').views.filter(id => isLead(id) && DRAWN_VIEWS.has(id) && drawsWhole([id], { facts: one.facts, question: one.question, room }, id))
  return [...leads, TEXT_OPTION].sort((a, b) => seeded(`${one.id}\0${a}`) - seeded(`${one.id}\0${b}`))
}

/**
 * The round's asks: the cases with at least one picture to set against the text
 * card, those with the most options first (then in set order), at most ROUND_SIZE.
 */
export function gradeCases(raw: readonly { id: string; question: string; prose: string; facts: unknown }[], room: number): GradeCase[] {
  const cases = raw.flatMap(one => {
    const { facts, errors } = parseFacts(one.facts)
    return errors.length === 0 && facts.answers !== undefined ? [{ id: one.id, question: one.question, prose: one.prose, facts }] : []
  })
  const count = new Map(cases.map(one => [one.id, gradeOptions(one, room).length]))
  return cases.filter(one => count.get(one.id)! >= 2).sort((a, b) => count.get(b.id)! - count.get(a.id)!).slice(0, ROUND_SIZE)
}

/** The plan that draws one option and nothing else: its one view as the lead, or none for the text card. */
export function optionPlan(one: GradeCase, option: string): Plan {
  return {
    item: `${one.id}:${option}`,
    source: 'prior',
    model: null,
    why: 'graded',
    views: option === TEXT_OPTION ? [] : [{ view: option, slot: 'lead', yes: null, score: 1 }],
    answers: ['answers'],
    textAlone: null,
  }
}

/** The letter an option is shown under: A, B, C… */
export const letter = (i: number) => String.fromCharCode(65 + i)

/** The message the picks go back as: a line a person reads, then the picks as JSON. */
export function gradesMessage(round: readonly GradeCase[], picks: Readonly<Record<string, Pick>>, room: number): string {
  const graded = round.filter(one => picks[one.id] !== undefined)
  const rows = graded.map(one => ({ case: one.id, options: gradeOptions(one, room), ...picks[one.id]! }))
  return [
    `[vantage-point] Visuals graded: ${graded.length} of ${round.length} asks. Each pick is the option the owner would rule from fastest.`,
    '',
    '```json',
    JSON.stringify({ gradingRound: 1, picks: rows }, null, 2),
    '```',
  ].join('\n')
}
