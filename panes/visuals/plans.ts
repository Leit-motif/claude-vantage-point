// Where an item's plan lives (#97): the item as the composer reads it, the key its
// plan is stored under in the plugin's store, which every session on the machine
// reads, what a stored slot holds, and the line that explains a card. The key is
// a hash of what the plan depends on (the item's question, answers, prose and
// facts, the catalog and the pinned model), so every session finds one plan, an
// edit replans, and a catalog change or a model bump does too. Pure.

import { TECHNIQUES } from './catalog.ts'
import type { Card, ComposeItem, Plan } from './compose.ts'
import { joined, type Facts } from './facts.ts'
import { COMPOSER_MODEL, PROCESS_TIMEOUT_MS } from './jev.ts'

/** Each item's plan, or a session's claim on planning it, is stored under this prefix and the item's id. */
export const PLAN_PREFIX = 'plan:'
/** How long a claim holds off other sessions: the driver's limit and some. A claim older than this was left by a session that died. */
export const CLAIM_MS = PROCESS_TIMEOUT_MS + 10_000
/** A stored plan that fell back to the priors after a failed call is tried again after this long. */
export const RETRY_MS = 6 * 60 * 60_000
/** The prose opens counted per item, for the evaluation set (#98). */
export const PROSE_OPENS_KEY = 'composer-prose-opens'

/** A 32-bit FNV-1a hash of `s` from `basis`, as 8 hex digits. */
function fnv(s: string, basis: number): string {
  let h = basis
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}
const hash = (s: string) => fnv(s, 0x811c9dc5) + fnv(s, 0x050c5d1f)

/**
 * The composer's own rules, versioned by hand: bump it when a change to how a plan
 * is made (which answers views it offers, how it ranks) must replan items already
 * stored, since the hash below sees the catalog's data, not the composer's code.
 */
export const COMPOSER_VERSION = 3

/** The catalog as data, its meaning checks included: any change to a view replans every item. */
export const CATALOG_VERSION = hash(JSON.stringify(TECHNIQUES.map(one => ({ ...one, meaning: String(one.meaning) }))))

type Consequences = Required<Facts>['answers']
/** The answer rows' text, as the composer hands it to Jev. */
export function answersText(answers: Consequences): string {
  return `Yes: ${joined(answers.yes)}. No: ${joined(answers.no)}. Recommended: ${answers.recommend}.`
}

/** What a queue item carries that the composer reads. */
export type FactItem = { heading: string; body: string; facts: { facts: Facts; errors: readonly unknown[] } | null }

/**
 * The item as the composer reads it, or null when it is drawn as today: it
 * carries no facts, facts that fail their schema, or no answers fact, which
 * every composed card draws. Its id is the hash of everything its plan depends
 * on, so it is also the plan's store key.
 */
export function composeItem(item: FactItem): ComposeItem | null {
  const held = item.facts
  if (held === null || held.errors.length > 0 || held.facts.answers === undefined) return null
  const answers = answersText(held.facts.answers)
  const id = hash(JSON.stringify([item.heading, answers, item.body, held.facts, CATALOG_VERSION, COMPOSER_VERSION, COMPOSER_MODEL]))
  return { id, question: item.heading, answers, prose: item.body, facts: held.facts }
}

export const planKey = (id: string) => `${PLAN_PREFIX}${id}`

/** What the store holds for an item: its plan and when it was made, or a session's claim on making it. */
export type PlanSlot = { plan: Plan; at: number } | { claim: { by: string; at: number } }

export type ReadSlot = { kind: 'plan'; plan: Plan; at: number } | { kind: 'claim'; by: string; at: number } | { kind: 'none' }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function isPlan(v: unknown, id: string): v is Plan {
  if (!isObject(v) || v.item !== id || (v.source !== 'jev' && v.source !== 'prior')) return false
  const ranked = (r: unknown) => isObject(r) && typeof r.view === 'string' && (r.slot === 'lead' || r.slot === 'support') && typeof r.score === 'number'
  return Array.isArray(v.views) && v.views.every(ranked) && Array.isArray(v.answers) && v.answers.every(a => typeof a === 'string') && (v.textAlone === null || typeof v.textAlone === 'number')
}

/** A stored slot for item `id`; anything else another release wrote, or garbage, reads as nothing. */
export function readSlot(value: unknown, id: string): ReadSlot {
  if (!isObject(value)) return { kind: 'none' }
  if (isPlan(value.plan, id) && typeof value.at === 'number') return { kind: 'plan', plan: value.plan, at: value.at }
  const claim = value.claim
  if (isObject(claim) && typeof claim.by === 'string' && typeof claim.at === 'number') return { kind: 'claim', by: claim.by, at: claim.at }
  return { kind: 'none' }
}

/** Whether a stored slot leaves the item to be planned now: nothing, a dead claim, or a fallback old enough to try again. */
export function needsPlan(slot: ReadSlot, now: number): boolean {
  if (slot.kind === 'none') return true
  if (slot.kind === 'claim') return now - slot.at >= CLAIM_MS
  return slot.plan.source === 'prior' && slot.plan.why !== 'no view' && now - slot.at >= RETRY_MS
}

/**
 * Whether a finished plan is stored for every session: a plan Jev ranked, or a
 * failed call's fallback, so a failure is not paid for again by each session.
 * A plan made with no Jev at all costs nothing to make again and is not stored,
 * so a key added later replans it.
 */
export const isShared = (p: Plan) => p.why !== 'no Jev'

export const WHY: Record<string, string> = { 'no Jev': 'no Jev', pending: 'planning' }

/**
 * The dim line that explains a card: the lead and the support it drew, each
 * with its score, and the text-alone score, or why the priors ranked it.
 */
export function explain(p: Plan, c: Card): string {
  const drawn = (slot: 'lead' | 'support') => {
    const one = c.kind === 'views' ? p.views.find(v => v.slot === slot && c.views.includes(v.view)) : undefined
    return one === undefined ? 'none' : `${one.view} ${one.score.toFixed(2)}`
  }
  const tail = p.source === 'jev' && p.textAlone !== null ? `text alone ${p.textAlone.toFixed(2)}` : `ranked by prior (${WHY[p.why ?? ''] ?? p.why})`
  return `lead: ${drawn('lead')} · support: ${drawn('support')} · ${tail}`
}
