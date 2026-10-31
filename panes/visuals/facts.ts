// An ask item's facts: what the decision is made of, typed by what each fact is
// (figures, a comparison, a flow), never by which picture draws it. An agent
// writes each fact once; every catalog view that reads that kind can draw it
// (panes/visuals/catalog.ts). Two checks run here, both in code: the schema
// (fields present and typed) and the meaning (the view would not mislead).
// Relevance is Jev's, later (#96). Pure.

import { TECHNIQUES, type Technique } from './catalog.ts'

/** A value and its name; `unit` is `$` (drawn before it), `%`, or a noun (drawn after). */
type Label = { label: string; value: number; unit?: string }
/**
 * One consequence of an answer: what it costs in dollars if anything (`upTo`
 * when that is a ceiling), and what follows. `or` marks it an alternative to the
 * one before ("wait, or score all 15 days"); otherwise it follows from it.
 */
type Consequence = { does: string; cost?: number; upTo?: boolean; then?: string; or?: boolean }

export type Facts = {
  /** What yes and what no set off: every item card draws one answers view. */
  answers?: { yes: Consequence[]; no: Consequence[]; recommend: 'yes' | 'no'; why?: string; soWhat?: string }
  /** Two or three values the ruling turns on. */
  figures?: Label[]
  /**
   * Options measured on shared rows; `better` says which way a row improves.
   * `actions` names each option as the thing you would do, `recommended` the
   * option's index the item recommends, and a row's `cells` say a value in
   * words ("none", "free") while `values` still rank it.
   */
  comparison?: {
    options: string[]
    actions?: string[]
    recommended?: number
    rows: { label: string; unit: string; values: number[]; better: 'lower' | 'higher'; cells?: string[] }[]
  }
  /** Values against one line. */
  threshold?: { values: Label[]; line: Label }
  /** A total split into parts; `label` names the total ("missed"). */
  parts?: { total: number; label?: string; parts: Label[] }
  /** Things that move between places, and a pair that never touch. */
  flow?: { nodes: string[]; moves: { from: string; to: string; label?: string }[]; never?: { from: string; to: string; label?: string }; pending?: string[] }
  /** A sequence in time. */
  steps?: { when: string; what: string }[]
  /**
   * Cases out of a total: how many are in the state now, after a yes, and the
   * target. `states` names the state now and after ("skipping", "run"), `lit`
   * what the counted ones are ("on screen") and `goal` what the target is for
   * ("a win needs").
   */
  counts?: { total: number; now: number; after?: number; target?: number; noun: string; states?: { now: string; after: string }; lit?: string; goal?: string }
  /** Names and what they mean. */
  terms?: { term: string; meaning: string }[]
  /** Claims and where they came from. */
  sources?: { claims: { text: string; source: string }[]; sources: { label: string; url: string }[] }
  // The decision's context (#102): what surrounds the ruling, never the question restated.
  /**
   * What the ruling rests on: each source, what it says, how far to trust it
   * (`checked` by a person, `measured` by a run, `reported` by someone, a
   * `guess`), how much of it there is (`weight` in `unit`s), and the answer it
   * points to, if any.
   */
  evidence?: { label: string; says: string; trust: Trust; weight?: number; unit?: string; favours?: 'yes' | 'no' }[]
  /** What each answer changes: how far it reaches, and how it is undone where it can be. */
  impact?: { yes: Reach[]; no: Reach[] }
  /** The case for and against the recommended answer. */
  tradeoffs?: { pros: string[]; cons: string[] }
  /** What could go wrong or mislead even on the recommended answer: `risk` could change the answer, `watch` would not. */
  gotchas?: { text: string; level: 'risk' | 'watch' }[]
  /** Earlier rulings on asks like this one, and what came of them. */
  precedent?: { when: string; ask: string; ruled: 'yes' | 'no'; came?: string }[]
  /** What a yes changes: each system, file or person, and how. */
  touches?: { name: string; change: string }[]
}

/** How far a source can be trusted, most first. */
export type Trust = 'checked' | 'measured' | 'reported' | 'guess'
export const TRUSTS: readonly Trust[] = ['checked', 'measured', 'reported', 'guess']
/** One change an answer makes: `none`, `small` or `wide` in reach, and its undo where there is one. */
type Reach = { what: string; reach: 'none' | 'small' | 'wide'; undo?: string }

/** An answer's consequences as one line: an alternative joins with ", or", a consequence that follows with "; ". */
export const joined = (said: Required<Facts>['answers']['yes']) => said.map((c, i) => (i === 0 ? c.does : `${c.or === true ? ', or ' : '; '}${c.does}`)).join('')

export type FactKind = keyof Facts

export const FACT_KINDS: readonly FactKind[] = [
  'answers',
  'figures',
  'comparison',
  'threshold',
  'parts',
  'flow',
  'steps',
  'counts',
  'terms',
  'sources',
  'evidence',
  'impact',
  'tradeoffs',
  'gotchas',
  'precedent',
  'touches',
]

/** The kinds that carry the decision's context rather than its numbers: what a page's tiles are mostly made of (#102). */
export const CONTEXT_KINDS: readonly FactKind[] = ['evidence', 'impact', 'tradeoffs', 'gotchas', 'precedent', 'touches']

/**
 * The four questions a deck's page answers (the owner, 2026-10-23, #102): what
 * it is, how it works or plays out, why believe the recommendation, and so what.
 * Each other fact kind answers what, how or why; a tile or line may cover
 * several, and the why line covers why. A queue card reserves nothing for them:
 * its two pictures go to the two that score best (#105).
 */
export type Question = 'what' | 'how' | 'why' | 'so what'
export const QUESTIONS: readonly Question[] = ['what', 'how', 'why', 'so what']
export const ANSWERS_QUESTION: Readonly<Partial<Record<FactKind, Question>>> = {
  figures: 'what',
  comparison: 'what',
  threshold: 'what',
  counts: 'what',
  parts: 'what',
  terms: 'what',
  flow: 'how',
  steps: 'how',
  touches: 'how',
  impact: 'how',
  evidence: 'why',
  sources: 'why',
  tradeoffs: 'why',
  gotchas: 'why',
  precedent: 'why',
}

/** One way the facts fail their schema: the kind and the field, as an agent fixes it. */
export type SchemaError = { kind: string; field: string; problem: string }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Reads a `vantage-facts` block's JSON into facts, or the fields that fail.
 * A fact that fails is left out, so the views that read it are never offered;
 * the review tool refuses the ask on any error (#94).
 */
export function parseFacts(json: unknown): { facts: Facts; errors: SchemaError[] } {
  const errors: SchemaError[] = []
  const facts: Facts = {}
  if (!isObject(json)) return { facts, errors: [{ kind: '', field: '', problem: 'facts are a JSON object keyed by fact kind' }] }
  for (const kind of Object.keys(json)) {
    if (!(FACT_KINDS as readonly string[]).includes(kind)) {
      errors.push({ kind, field: '', problem: `is not a fact kind (${FACT_KINDS.join(', ')})` })
      continue
    }
    const before = errors.length
    const fail = (field: string, problem: string) => errors.push({ kind, field, problem })
    const value = check(kind as FactKind, json[kind], fail)
    if (errors.length === before) (facts as Record<string, unknown>)[kind] = value
  }
  return { facts, errors }
}

type Fail = (field: string, problem: string) => void

function labels(v: unknown, field: string, fail: Fail, min: number, max: number): void {
  if (!Array.isArray(v)) return fail(field, 'is a list')
  if (v.length < min || v.length > max) fail(field, `holds ${min} to ${max}, not ${v.length}`)
  v.forEach((one, i) => label(one, `${field}[${i}]`, fail))
}

function label(v: unknown, field: string, fail: Fail): void {
  if (!isObject(v)) return fail(field, 'is { label, value }')
  if (!isText(v.label)) fail(`${field}.label`, 'is text')
  if (!isNumber(v.value)) fail(`${field}.value`, 'is a number')
  if (v.unit !== undefined && typeof v.unit !== 'string') fail(`${field}.unit`, 'is text')
}

function texts(v: unknown, field: string, fail: Fail, keys: readonly string[], min = 1): void {
  if (!Array.isArray(v)) return fail(field, 'is a list')
  if (v.length < min) fail(field, `holds at least ${min}`)
  v.forEach((one, i) => {
    if (!isObject(one)) return fail(`${field}[${i}]`, `is { ${keys.join(', ')} }`)
    for (const key of keys) if (!isText(one[key])) fail(`${field}[${i}].${key}`, 'is text')
  })
}

/** One object of named texts: `never.from`, `states.after`. */
function pair(v: unknown, field: string, fail: Fail, keys: readonly string[]): void {
  if (!isObject(v)) return fail(field, `is { ${keys.join(', ')} }`)
  for (const key of keys) if (!isText(v[key])) fail(`${field}.${key}`, 'is text')
}

function consequences(v: unknown, field: string, fail: Fail): void {
  texts(v, field, fail, ['does'])
  if (!Array.isArray(v)) return
  v.forEach((one, i) => {
    if (!isObject(one)) return
    if (one.cost !== undefined && !(isNumber(one.cost) && one.cost >= 0)) fail(`${field}[${i}].cost`, 'is dollars, zero or more')
    if (one.then !== undefined && !isText(one.then)) fail(`${field}[${i}].then`, 'is text')
    if (one.upTo !== undefined && typeof one.upTo !== 'boolean') fail(`${field}[${i}].upTo`, 'is true or false')
    if (one.or !== undefined && (typeof one.or !== 'boolean' || i === 0)) fail(`${field}[${i}].or`, i === 0 ? 'cannot mark the first consequence' : 'is true or false')
  })
}

function check(kind: FactKind, v: unknown, fail: Fail): unknown {
  switch (kind) {
    case 'answers':
      if (!isObject(v)) return fail('', 'is { yes, no, recommend }')
      consequences(v.yes, 'yes', fail)
      consequences(v.no, 'no', fail)
      if (v.recommend !== 'yes' && v.recommend !== 'no') fail('recommend', 'is "yes" or "no"')
      if (v.why !== undefined && !isText(v.why)) fail('why', 'is text: the one line that says why this came up')
      // The whole decision in one line, read alone to rule (the owner, 2026-10-23).
      if (v.soWhat !== undefined && !(isText(v.soWhat) && v.soWhat.trim().split(/\s+/).length <= 25 && !/[.!?]\s+\S/.test(v.soWhat.trim()))) fail('soWhat', 'is one sentence of 25 words or fewer: the decision distilled, enough to rule on alone')
      return v
    case 'figures':
      labels(v, '', fail, 2, 3)
      return v
    case 'comparison': {
      if (!isObject(v)) return fail('', 'is { options, rows }')
      const options = v.options
      if (!Array.isArray(options) || options.length < 2 || options.length > 3 || !options.every(isText)) fail('options', 'is 2 or 3 names')
      if (!Array.isArray(v.rows) || v.rows.length === 0) return fail('rows', 'is a list of at least one row')
      v.rows.forEach((row, i) => {
        const at = `rows[${i}]`
        if (!isObject(row)) return fail(at, 'is { label, unit, values, better }')
        if (!isText(row.label)) fail(`${at}.label`, 'is text')
        if (typeof row.unit !== 'string') fail(`${at}.unit`, 'is text, "" for a plain number')
        if (!Array.isArray(row.values) || !row.values.every(isNumber)) fail(`${at}.values`, 'is a list of numbers')
        if (row.better !== 'lower' && row.better !== 'higher') fail(`${at}.better`, 'is "lower" or "higher"')
        if (row.cells !== undefined && !(Array.isArray(row.cells) && row.cells.every(isText) && row.cells.length === (Array.isArray(options) ? options.length : -1))) fail(`${at}.cells`, 'is one word per option')
      })
      if (v.actions !== undefined && !(Array.isArray(v.actions) && v.actions.every(isText) && v.actions.length === (Array.isArray(options) ? options.length : -1))) fail('actions', 'is one action per option')
      if (v.recommended !== undefined && !(Number.isInteger(v.recommended) && (v.recommended as number) >= 0 && (v.recommended as number) < (Array.isArray(options) ? options.length : 0))) fail('recommended', 'is the index of one option')
      return v
    }
    case 'threshold':
      if (!isObject(v)) return fail('', 'is { values, line }')
      labels(v.values, 'values', fail, 1, 4)
      label(v.line, 'line', fail)
      return v
    case 'parts':
      if (!isObject(v)) return fail('', 'is { total, parts }')
      if (!isNumber(v.total) || v.total <= 0) fail('total', 'is a number above zero')
      labels(v.parts, 'parts', fail, 2, 5)
      if (v.label !== undefined && !isText(v.label)) fail('label', 'is text')
      return v
    case 'flow': {
      if (!isObject(v)) return fail('', 'is { nodes, moves, never? }')
      if (!Array.isArray(v.nodes) || v.nodes.length < 2 || v.nodes.length > 5 || !v.nodes.every(isText)) fail('nodes', 'is 2 to 5 names')
      texts(v.moves, 'moves', fail, ['from', 'to'])
      if (v.never !== undefined) pair(v.never, 'never', fail, ['from', 'to'])
      if (v.pending !== undefined && !(Array.isArray(v.pending) && v.pending.every(isText))) fail('pending', 'is a list of the boxes not live yet')
      return v
    }
    case 'steps':
      texts(v, '', fail, ['when', 'what'], 2)
      return v
    case 'counts': {
      if (!isObject(v)) return fail('', 'is { total, now, after?, target?, noun }')
      const whole = (x: unknown) => isNumber(x) && Number.isInteger(x) && x >= 0
      if (!whole(v.total)) fail('total', 'is a whole number')
      if (!whole(v.now)) fail('now', 'is a whole number')
      if (v.after !== undefined && !whole(v.after)) fail('after', 'is a whole number')
      if (v.target !== undefined && !whole(v.target)) fail('target', 'is a whole number')
      if (!isText(v.noun)) fail('noun', 'is text, what is counted')
      if (v.states !== undefined) pair(v.states, 'states', fail, ['now', 'after'])
      for (const key of ['lit', 'goal'] as const) if (v[key] !== undefined && !isText(v[key])) fail(key, 'is text')
      return v
    }
    case 'terms':
      texts(v, '', fail, ['term', 'meaning'])
      return v
    case 'sources':
      if (!isObject(v)) return fail('', 'is { claims, sources }')
      texts(v.claims, 'claims', fail, ['text', 'source'])
      texts(v.sources, 'sources', fail, ['label', 'url'])
      return v
    case 'evidence':
      texts(v, '', fail, ['label', 'says'])
      if (!Array.isArray(v)) return
      if (v.length > 5) fail('', 'holds at most 5 sources')
      v.forEach((one, i) => {
        if (!isObject(one)) return
        if (!(TRUSTS as readonly unknown[]).includes(one.trust)) fail(`[${i}].trust`, `is ${TRUSTS.map(t => `"${t}"`).join(', ')}`)
        if (one.weight !== undefined && !(isNumber(one.weight) && one.weight > 0)) fail(`[${i}].weight`, 'is a number above zero')
        if (one.unit !== undefined && !isText(one.unit)) fail(`[${i}].unit`, 'is text')
        if (one.favours !== undefined && one.favours !== 'yes' && one.favours !== 'no') fail(`[${i}].favours`, 'is "yes" or "no"')
      })
      return v
    case 'impact':
      if (!isObject(v)) return fail('', 'is { yes, no }')
      for (const which of ['yes', 'no'] as const) {
        texts(v[which], which, fail, ['what'])
        if (!Array.isArray(v[which])) continue
        ;(v[which] as unknown[]).forEach((one, i) => {
          if (!isObject(one)) return
          if (one.reach !== 'none' && one.reach !== 'small' && one.reach !== 'wide') fail(`${which}[${i}].reach`, 'is "none", "small" or "wide"')
          if (one.undo !== undefined && !isText(one.undo)) fail(`${which}[${i}].undo`, 'is text')
        })
      }
      return v
    case 'tradeoffs':
      if (!isObject(v)) return fail('', 'is { pros, cons }')
      for (const side of ['pros', 'cons'] as const)
        if (!Array.isArray(v[side]) || v[side].length === 0 || v[side].length > 4 || !(v[side] as unknown[]).every(isText)) fail(side, 'is 1 to 4 lines')
      return v
    case 'gotchas':
      texts(v, '', fail, ['text'])
      if (Array.isArray(v)) v.forEach((one, i) => isObject(one) && one.level !== 'risk' && one.level !== 'watch' && fail(`[${i}].level`, 'is "risk" or "watch"'))
      return v
    case 'precedent':
      texts(v, '', fail, ['when', 'ask'])
      if (Array.isArray(v))
        v.forEach((one, i) => {
          if (!isObject(one)) return
          if (one.ruled !== 'yes' && one.ruled !== 'no') fail(`[${i}].ruled`, 'is "yes" or "no"')
          if (one.came !== undefined && !isText(one.came)) fail(`[${i}].came`, 'is text')
        })
      return v
    case 'touches':
      texts(v, '', fail, ['name', 'change'])
      return v
  }
}

/** A page's words may not pass its item's full text, or this many where the text is shorter (the owner, 2026-10-24). */
export const MIN_WORD_BUDGET = 60
/** Words in one line of a tile; the why line and the so-what are sentences of their own. */
export const LINE_WORDS = 12
/** Fields that name a kind, a link or a name said elsewhere (a move's ends, a claim's source) rather than say anything new. */
const UNSAID = new Set(['url', 'unit', 'trust', 'level', 'reach', 'better', 'recommend', 'favours', 'ruled', 'or', 'from', 'to', 'source'])

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length

/** Every said string in the facts, with where it sits (`gotchas[0].text`). */
function said(v: unknown, at: string, out: { at: string; text: string }[]): void {
  if (typeof v === 'string') out.push({ at, text: v })
  else if (Array.isArray(v)) v.forEach((one, i) => said(one, `${at}[${i}]`, out))
  else if (isObject(v)) for (const [key, one] of Object.entries(v)) if (!UNSAID.has(key)) said(one, at === '' ? key : `${at}.${key}`, out)
}

/**
 * How a page's facts break its word budget (the owner, 2026-10-24: the page held
 * more words than the text it compresses): more words than the item's full text
 * (`proseWords`, or MIN_WORD_BUDGET where that is less), and lines longer than
 * LINE_WORDS. Empty when it holds.
 */
export function overBudget(facts: Facts, proseWords: number): string[] {
  const lines: { at: string; text: string }[] = []
  said(facts, '', lines)
  const total = lines.reduce((sum, one) => sum + wordCount(one.text), 0)
  const budget = Math.max(MIN_WORD_BUDGET, proseWords)
  const out = total > budget ? [`${total} words of facts for a budget of ${budget}`] : []
  const long = lines.filter(one => one.at !== 'answers.why' && one.at !== 'answers.soWhat' && wordCount(one.text) > LINE_WORDS)
  if (long.length > 0) out.push(`lines over ${LINE_WORDS} words: ${long.slice(0, 4).map(one => `${one.at} (${wordCount(one.text)})`).join(', ')}${long.length > 4 ? ` and ${long.length - 4} more` : ''}`)
  return out
}

/** A picture whose words the full text mostly never says would contradict it: below this share of its words found there, it is refused. */
export const SAID_SHARE = 0.25
/** Kinds exempt from it: `answers` is never drawn, and `terms` gives meanings the text leaves out on purpose. */
const SAYS_MORE = new Set(['answers', 'terms', 'sources'])
const COMMON = new Set(['about', 'after', 'also', 'before', 'from', 'have', 'into', 'just', 'more', 'most', 'only', 'over', 'same', 'some', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'would', 'your'])

/** The content words of a text, each keyed by a stem so "reviewed" meets "reviewing" and "added" meets "adds". */
function stems(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? [])
    if (word.length >= 4 && !COMMON.has(word)) {
      const stem = word.replace(/(?<=\w{3})(ing|ed|es|s)$/, '').slice(0, 5)
      if (!out.has(stem)) out.set(stem, word)
    }
  return out
}

/**
 * The picture kinds whose words the item's full text mostly does not say (the
 * owner, 2026-10-29: the card drew a catch and a count the text never
 * mentioned, and missed the workflow it narrated). Each is the kind and the
 * words the text lacks. A kind with fewer than three content words passes.
 */
export function unsaid(facts: Facts, prose: string): { kind: string; missing: string[] }[] {
  const inProse = stems(prose)
  return Object.entries(facts).flatMap(([kind, value]) => {
    if (SAYS_MORE.has(kind)) return []
    const lines: { at: string; text: string }[] = []
    said(value, kind, lines)
    const words = stems(lines.map(one => one.text).join(' '))
    if (words.size < 3) return []
    const missing = [...words].filter(([stem]) => !inProse.has(stem)).map(([, word]) => word)
    return 1 - missing.length / words.size < SAID_SHARE ? [{ kind, missing }] : []
  })
}

/** Why a view the facts could feed is not offered: its fact is missing, or a meaning check failed. */
export type Refusal = { view: string; reason: string }

/**
 * The views offered for one item on one surface: each reads a fact the item
 * carries, draws on the surface, sits on an item card, and passes its meaning
 * checks. Every other composed view comes back refused, with the reason.
 */
export function eligible(facts: Facts, surface: 'desktop' | 'phone'): { views: string[]; refused: Refusal[] } {
  const views: string[] = []
  const refused: Refusal[] = []
  for (const one of composed()) {
    const reason = refusal(one, facts, surface)
    if (reason === null) views.push(one.id)
    else refused.push({ view: one.id, reason })
  }
  return { views, refused }
}

/** The views a card can be composed from: those that read a fact. */
export function composed(): Technique[] {
  return TECHNIQUES.filter(one => one.reads !== null)
}

function refusal(one: Technique, facts: Facts, surface: 'desktop' | 'phone'): string | null {
  if (one.reads === null) return 'reads no fact'
  if (facts[one.reads] === undefined) return `no ${one.reads} fact`
  if (!one.surfaces.includes(surface)) return `does not draw on the ${surface}`
  return one.meaning(facts)
}
