// The reply row is a decision the agent declares. A malformed declaration is
// no row. Offsets into a reply, and any model call, are not part of it.
import type { HumanQueueDecision, HumanQueueDecisionTone } from '../types'

export type Decision = HumanQueueDecision
export type DecisionTone = HumanQueueDecisionTone

/** Theme colours for the three tones. */
export const TONE_COLOR = { advantage: 'success', tradeoff: 'warning', neutral: 'subtle' } as const

/** The deck's valence colours, the cache countdown's family: good, middling, bad. */
export const VALENCE_COLOR = { advantage: '#96de81', neutral: '#dec281', tradeoff: '#de8481' } as const

/** What a tone scores on the Comparison page's score row. */
export const TONE_SCORE = { advantage: 2, neutral: 1, tradeoff: 0 } as const

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null

function line(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().replace(/\s+/g, ' ')
  if (text === '') return null
  return text
}

function words(value: unknown, max: number): string | null {
  const text = line(value)
  if (text === null || text.split(' ').length > max) return null
  return text
}

/** One sentence: a break is `.!?` followed by a space. "v1.2" stays one sentence. */
function oneSentence(value: unknown): string | null {
  const text = line(value)
  if (text === null || text.split(/(?<=[.!?])\s+/).length !== 1) return null
  return text
}

function toneOf(value: unknown): DecisionTone | null {
  return value === 'advantage' || value === 'tradeoff' || value === 'neutral' ? value : null
}

function list(value: unknown, min: number, max: number): string[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max) return null
  const items: string[] = []
  for (const item of value) {
    const text = line(item)
    if (text === null) return null
    items.push(text)
  }
  if (new Set(items).size !== items.length) return null
  return items
}

/**
 * The decision the band can show, or null when the call is malformed.
 * Cells come back as cells[dimension][option].
 */
export function parseDecision(input: unknown): Decision | null {
  const record = object(input)
  if (record === null) return null
  const headline = words(record.headline, 8)
  const ask = oneSentence(record.ask)
  const options = list(record.options, 2, 3)
  const dimensions = list(record.dimensions, 2, 3)
  if (headline === null || ask === null || options === null || dimensions === null || !Array.isArray(record.cells)) return null
  if (record.cells.length !== options.length * dimensions.length) return null
  const cells: Decision['cells'] = dimensions.map(() => options.map(() => ({ value: '', tone: 'neutral' as const })))
  const seen = new Set<string>()
  for (const raw of record.cells) {
    const cell = object(raw)
    if (cell === null) return null
    const option = options.indexOf(line(cell.option) ?? '')
    const dimension = dimensions.indexOf(line(cell.dimension) ?? '')
    const value = words(cell.value, 3)
    const tone = toneOf(cell.tone)
    const key = `${dimension}:${option}`
    if (option < 0 || dimension < 0 || value === null || tone === null || seen.has(key)) return null
    seen.add(key)
    cells[dimension]![option] = { value, tone }
  }
  const recommend = options.indexOf(line(record.recommend) ?? '')
  if (seen.size !== options.length * dimensions.length || recommend < 0) return null
  const decision: Decision = { headline, ask, options, dimensions, cells, recommend }
  // The deck's fields are optional; one that is present must be well formed, and a
  // citation must name a source that is there: a wrong citation is worse than none.
  const deck = deckFields(record)
  if (deck === null) return null
  const touches = touchesOf(record.touches, options)
  return { ...decision, ...deck, ...(touches === null ? {} : { touches }) }
}

/**
 * The paths each option touches, by option index. Unlike the deck's other fields, a malformed
 * entry is dropped rather than refusing the decision: the snapshot is context, never worth the deck.
 */
function touchesOf(value: unknown, options: readonly string[]): Decision['touches'] | null {
  if (!Array.isArray(value)) return null
  const touches: string[][] = options.map(() => [])
  for (const raw of value) {
    const entry = object(raw)
    const option = options.indexOf(line(entry?.option) ?? '')
    if (option < 0 || !Array.isArray(entry?.paths)) continue
    for (const path of entry.paths.map(line)) {
      if (path !== null && !touches[option]!.includes(path) && touches[option]!.length < 6) touches[option]!.push(path)
    }
  }
  return touches.some(paths => paths.length > 0) ? touches.map(paths => paths.map(path => ({ path }))) : null
}

function deckFields(record: Record<string, unknown>): Pick<Decision, 'why' | 'reason' | 'next' | 'sources'> | null {
  const out: Pick<Decision, 'why' | 'reason' | 'next' | 'sources'> = {}
  if (record.next !== undefined) {
    const next = words(record.next, 20)
    if (next === null || /\[\d+\]/.test(next)) return null
    out.next = next
  }
  if (record.sources !== undefined) {
    if (!Array.isArray(record.sources) || record.sources.length > 9) return null
    const sources: NonNullable<Decision['sources']> = []
    for (const raw of record.sources) {
      const source = object(raw)
      const path = line(source?.path)
      if (path === null) return null
      // The lines a source names, "412-418" or "412"; ones that cannot be read stay 0, and the lines check drops them (#108).
      const range = /^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/.exec(typeof source?.lines === 'string' ? source.lines : String(source?.lines ?? ''))
      const first = range === null ? 0 : Number(range[1])
      const last = range === null ? 0 : Number(range[2] ?? range[1])
      sources.push({ path, quote: '', line: first, end: Math.max(first, last) })
    }
    out.sources = sources
  }
  const count = out.sources?.length ?? 0
  for (const key of ['why', 'reason'] as const) {
    if (record[key] === undefined) continue
    const text = words(record[key], key === 'why' ? 40 : 25)
    if (text === null) return null
    const cited = [...text.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]))
    if (cited.some(n => n < 1 || n > count)) return null
    out[key] = text
  }
  return out
}

/**
 * The colour of an option's chip. A tradeoff anywhere in that option wins,
 * then an advantage; otherwise the chip is neutral.
 */
export function chipTone(decision: Decision, option: number): DecisionTone {
  const tones = decision.cells.map(row => row[option]?.tone)
  if (tones.includes('tradeoff')) return 'tradeoff'
  if (tones.includes('advantage')) return 'advantage'
  return 'neutral'
}

/** The band shows plain text: markdown marks in a quote are dropped, never rendered. */
export function plainQuote(quote: string): string {
  return quote
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(^|\s)[*_]([^*_\s][^*_]*?)[*_](?=\s|[.,;:!?]|$)/g, '$1$2')
    .replace(/^#+\s+/, '')
    .trim()
}
