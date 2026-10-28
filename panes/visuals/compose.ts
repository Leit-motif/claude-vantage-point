// The composer's pure steps (#96): an item's Jev request, the plan ranked from
// Jev's answers (or from the priors alone), and the card a surface draws from a
// plan. Jev judges relevance only, one independent yes/no per view; the
// products, the ties and the card rules stay in code. Pure.

import { refusals, TECHNIQUES, type Technique } from './catalog.ts'
import { eligible, type Facts } from './facts.ts'

export type Surface = 'desktop' | 'phone'

/** What the composer reads of one ask item. `answers` is the answer rows' text as the agent wrote it. */
export type ComposeItem = { id: string; question: string; answers: string; prose: string; facts: Facts }

/**
 * Scores within this of the best remaining score are a near-tie, broken at
 * random seeded by the item's id. A starting value, tuned on the evaluation
 * set (#98), never on live traffic.
 */
export const TIE_MARGIN = 0.05
/** A support is drawn only when its score is above this. A starting value, like TIE_MARGIN. */
export const SUPPORT_MIN_SCORE = 0.15
/** The question id of the text-alone question; no catalog view has it. */
export const TEXT_ALONE = 'text-alone'

export type Noul = { type: 'noul'; instructions: string }
export type JevState = { question: string; answers: string; prose: string; facts: Facts }
export type JevRequest = { unit: string; state: JevState; questions: Record<string, Noul> }

/** One view in a plan: its score is Jev's yes times the view's prior, a ranking and not a probability. */
export type Ranked = { view: string; slot: 'lead' | 'support'; yes: number | null; score: number }

/**
 * The stored result for one item, surface-free: every view eligible on any
 * surface, best first, and the text-alone score. `source` says whether Jev
 * ranked it; `why` says why not.
 */
export type Plan = {
  item: string
  source: 'jev' | 'prior'
  /** The pinned model that answered, or null when the priors ranked it. */
  model: string | null
  why: string | null
  views: Ranked[]
  /** The answers-slot views the facts admit, preferred first; code chooses among them, not Jev. */
  answers: string[]
  textAlone: number | null
}

/** What a surface draws: a composition `refusals()` admits, or the text card (the type ladder and the answers). */
export type Card = { kind: 'views'; views: string[] } | { kind: 'text'; views: ['type', string] }

/** What came back for one item: a pinned model's raw answers, or why there are none. */
export type Reply = { model: string; answers: Readonly<Record<string, unknown>> } | { failed: string }

const byId = new Map(TECHNIQUES.map(one => [one.id, one]))
const technique = (id: string): Technique => byId.get(id)!
const isRanked = (one: Technique): one is Technique & { slot: 'lead' | 'support' } => one.slot === 'lead' || one.slot === 'support'

/** Every view the facts admit on any surface, in catalog order. */
function eligibleViews(facts: Facts): Technique[] {
  const ids = new Set([...eligible(facts, 'desktop').views, ...eligible(facts, 'phone').views])
  return TECHNIQUES.filter(one => ids.has(one.id))
}

/** The views Jev is asked about: the leads and supports. The answers slot is a meaning check in code. */
function askedViews(facts: Facts): (Technique & { slot: 'lead' | 'support' })[] {
  return eligibleViews(facts).filter(isRanked)
}

function viewQuestion(one: Technique): Noul {
  return {
    type: 'noul',
    // A tile carries the decision's context, never the question restated (the owner, 2026-10-23, #102).
    instructions: `Would a tile drawn from \`facts.${one.reads}\` answer a question the person has before ruling on \`question\`, beyond what the question and answers already say? The tile: ${one.job} It fits an item when this holds: ${one.fits}`,
  }
}

const TEXT_ALONE_QUESTION: Noul = {
  type: 'noul',
  instructions: 'Would `question` and `answers` alone, with no picture of `facts`, let the person rule as well as a picture would?',
}

/**
 * The one Jev request for an item: its question, answers, prose and facts as
 * state, one yes/no per eligible lead or support, and the text-alone question.
 * Null when no view is eligible, so nothing is asked or spent.
 */
export function jevRequest(item: ComposeItem): JevRequest | null {
  const views = askedViews(item.facts)
  if (views.length === 0) return null
  return {
    unit: item.id,
    state: { question: item.question, answers: item.answers, prose: item.prose, facts: item.facts },
    questions: Object.fromEntries([...views.map(one => [one.id, viewQuestion(one)]), [TEXT_ALONE, TEXT_ALONE_QUESTION]]),
  }
}

/** Each asked question's yes probability, or null when the answers are not exactly one valid Noul per question. */
function yeses(expected: readonly string[], answers: Readonly<Record<string, unknown>>): Map<string, number> | null {
  const keys = Object.keys(answers)
  if (keys.length !== expected.length || !expected.every(id => keys.includes(id))) return null
  const out = new Map<string, number>()
  for (const id of expected) {
    const answer = answers[id] as { type?: unknown; noul?: unknown } | null
    const p = answer?.noul
    if (answer?.type !== 'noul' || typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) return null
    out.set(id, p)
  }
  return out
}

/** A 32-bit FNV-1a hash: the item's seeded draw for one view. */
function seeded(item: string, view: string): number {
  let h = 0x811c9dc5
  for (const ch of `${item}\0${view}`) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0
  return h
}

/** Best first; views within TIE_MARGIN of the best remaining score are ordered by the item's seeded draw. */
function order(item: string, views: Ranked[]): Ranked[] {
  const rest = [...views].sort((a, b) => b.score - a.score)
  const out: Ranked[] = []
  while (rest.length > 0) {
    const top = rest[0]!.score
    const tied = rest.filter(one => top - one.score <= TIE_MARGIN)
    rest.splice(0, tied.length)
    out.push(...tied.sort((a, b) => seeded(item, a.view) - seeded(item, b.view)))
  }
  return out
}

/**
 * The plan for an item from Jev's reply. A failed reply, or answers that are
 * not exactly one valid yes/no per asked question, rank by prior alone.
 */
export function plan(item: ComposeItem, reply: Reply): Plan {
  const views = askedViews(item.facts)
  // One answer grammar across a request: the rows, never the bordered columns beside them (the design review, 2026-10-23).
  const answers = [...eligibleViews(item.facts).filter(one => one.slot === 'answers' && one.id !== 'answers' && one.id !== 'outcomes').map(one => one.id), 'answers']
  const asked = views.length > 0 && 'answers' in reply ? yeses([...views.map(one => one.id), TEXT_ALONE], reply.answers) : null
  const why = asked !== null ? null : views.length === 0 ? 'no view' : 'failed' in reply ? reply.failed : 'invalid answers'
  const ranked = views.map(one => {
    const yes = asked?.get(one.id) ?? null
    return { view: one.id, slot: one.slot, yes, score: yes === null ? one.prior : yes * one.prior }
  })
  return {
    item: item.id,
    source: asked === null ? 'prior' : 'jev',
    model: asked !== null && 'model' in reply ? reply.model : null,
    why,
    views: order(item.id, ranked),
    answers,
    textAlone: asked === null ? null : asked.get(TEXT_ALONE)! * technique('type').prior,
  }
}

/**
 * The card a surface draws from a plan: the text card when text alone scores
 * above every lead the surface draws, else the first composition `refusals()`
 * admits and `fits` lets through, trying leads best first, each with the best
 * support above SUPPORT_MIN_SCORE it admits, then alone. A card that would not
 * fit its room loses its support before its lead, so the answers always show
 * (#100). No admissible lead gives the text card.
 */
export function card(p: Plan, surface: Surface, fits: (views: readonly string[]) => boolean = () => true): Card {
  const answers = p.answers.find(id => technique(id).surfaces.includes(surface)) ?? 'answers'
  const text: Card = { kind: 'text', views: ['type', answers] }
  const leads = p.views.filter(one => one.slot === 'lead' && technique(one.view).surfaces.includes(surface))
  if (p.textAlone !== null && leads.every(one => p.textAlone! > one.score)) return text
  const supports = p.views.filter(one => one.slot === 'support' && one.score > SUPPORT_MIN_SCORE)
  for (const lead of leads) {
    const tries = [...supports.map(support => [lead.view, support.view, answers]), [lead.view, answers]]
    const admitted = tries.find(views => refusals(views, surface).length === 0 && fits(views))
    if (admitted) return { kind: 'views', views: admitted }
  }
  return text
}
