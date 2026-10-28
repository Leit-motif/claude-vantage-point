// The decision deck fills itself after a reply (issue #14): a regex, a Haiku gate,
// a tool-less fork of the session that writes the deck as JSON, then checks that
// drop what the evidence does not hold up. Pure: every model call and file read
// comes in as a function, so the tests drive it without a session.
import type { SessionMessage } from 'claude-code'
import type { HumanQueueDecision } from '../types'

import { composed, FACT_KINDS, parseFacts, type Facts } from '../panes/visuals/facts'
import { parseDecision, TONE_SCORE } from './reply'

export type Decision = HumanQueueDecision
export type Source = NonNullable<Decision['sources']>[number]

/** The model the gate, the compressor and the support check run on. */
export const GATE_MODEL = 'haiku'

/** A reply less its gist: the speed reader's `<gist>` sits after the question, hidden from the transcript, and is no part of the decision. */
export const withoutGist = (answer: string) => answer.replace(/<gist>[\s\S]*?<\/gist>\s*$/, '')

/**
 * Cheap, no model: does the end of the reply ask the person something? A question
 * mark in the last paragraph, or two or more listed options beside a choosing word
 * or a question (issue #23: the question often sits just above the list).
 * A markdown table's body rows are options too; its header and rule are not.
 */
export function looksLikeDecision(answer: string): boolean {
  const tail = withoutGist(answer).trim().slice(-1500)
  const paragraphs = tail.split(/\n\s*\n/)
  const last = paragraphs[paragraphs.length - 1] ?? ''
  if (/\?\s*(\*\*|_|`)?\s*$/m.test(last)) return true
  const listed = tail.match(/^\s*(\d+[.)]|[A-D][.):]|[-*]\s+\*\*)/gm) ?? []
  const rows = tail.split('\n').filter(line => /^\s*\|/.test(line))
  const rules = rows.filter(line => /^\s*\|[\s:|-]+$/.test(line)).length
  const options = listed.length + Math.max(0, rows.length - 2 * rules)
  const choosing = /\b(which|prefer|choose|pick|want|should I|let me know|your call)\b/i.test(tail)
  return options >= 2 && (choosing || /\?\s*(\*\*|_|`)?\s*$/m.test(tail))
}

/** The desktop app's end-of-turn box: an agent may put its question there, not in its reply. */
export const WRAP_UP_TOOL = 'mcp__ccd_turn__wrap_up'

/**
 * Tools that put their own question to the person: a hook can only tighten them, so their asks stay native.
 * The desktop starts a session only from the person's own press on its card, never from a message
 * the mod submits, so a row's Allow could not start one.
 */
export const PERSON_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode', 'mcp__ccd_session__start_session', 'mcp__ccd_session__hand_off_to_session'])

/** The modes whose asks go to the person, so the reply row can take them: not auto (its classifier), plan, or dontAsk. */
export const ROW_MODES = new Set(['default', 'acceptEdits', 'bypassPermissions'])

/** The session's permission mode as its transcript last recorded it on a message; null when none is. */
export function modeOf(transcript: string): string | null {
  let mode: string | null = null
  for (const match of transcript.matchAll(/"permissionMode":"([A-Za-z]+)"/g)) mode = match[1] ?? mode
  return mode
}

/** Claude Code's folder under `~/.claude/projects` for a session started in `cwd`. */
export const projectFolder = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, '-')

/** An object's keys in order, all the way down, so the same call reads the same however its keys came. */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted((value as Record<string, unknown>)[key])]))
}

/**
 * The key a tool call is allowed once by: its tool and its arguments, keys sorted, without
 * `description`, the words a model rewrites when it repeats a call.
 */
export function callKey(tool: string, input: unknown): string {
  const { description: _description, ...rest } = (typeof input === 'object' && input !== null && !Array.isArray(input) ? input : { input }) as Record<string, unknown>
  return `${tool} ${JSON.stringify(sorted(rest))}`
}

/** What a tool call would do, in a line: a command, a path, a URL, else its first words of input. */
function callLine(tool: string, input: unknown): string {
  const args = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const first = ['command', 'file_path', 'notebook_path', 'url', 'path', 'pattern', 'query', 'prompt']
    .map(key => args[key])
    .find((value): value is string => typeof value === 'string' && value.trim() !== '')
  const text = first ?? (Object.values(args).find((value): value is string => typeof value === 'string' && value.trim() !== '') ?? '')
  return text.trim().replace(/\s+/g, ' ')
}

/**
 * The reply row's decision for a tool call the mode would put to the person: allow it once, or
 * deny it. Pressing Allow lets the same call run when the agent repeats it (`grant`).
 */
export function decisionOfPermission(tool: string, input: unknown): HumanQueueDecision {
  const line = callLine(tool, input)
  const name = tool.startsWith('mcp__') ? tool.split('__').slice(1).join(' ') : tool
  return {
    headline: line === '' ? `Allow ${name}?` : `Allow ${name}: ${line}?`,
    ask: line === '' ? `Allow ${name} to run?` : `Allow ${name} to run ${line}?`,
    options: ['Allow once', 'Deny'],
    dimensions: [],
    cells: [],
    recommend: 0,
    sends: [`Allowed: run that ${name} call again exactly as before.`, `Denied: do not run that ${name} call. Find another way or tell me what you need.`],
    grant: callKey(tool, input),
  }
}

/** What the wrap-up box asked: one question and its buttons, the first the recommendation. */
/** The wrap-up box's question, its buttons' labels, and what each button sends (its message, else its label). */
export type WrapUpAsk = { ask: string; actions: string[]; sends: string[] }

/**
 * The last wrap-up call of the latest turn that asks something, read from the
 * transcript; null when there is none. The turn starts after the last user
 * message that is not a tool result.
 */
export function wrapUpAsk(messages: readonly Pick<SessionMessage, 'role' | 'toolUses' | 'toolResults'>[]): WrapUpAsk | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    if (message.role === 'user') {
      if ((message.toolResults ?? []).length === 0) return null
      continue
    }
    for (const use of [...message.toolUses].reverse()) {
      const wrap = use.tool === WRAP_UP_TOOL ? askOfWrapUp(use.input) : null
      if (wrap !== null) return wrap
    }
  }
  return null
}

/** A wrap-up call's question and its buttons, the first the recommendation; null without a question. */
export function askOfWrapUp(input: Record<string, unknown>): WrapUpAsk | null {
  if (typeof input.ask !== 'string' || input.ask.trim() === '') return null
  const actions = Array.isArray(input.actions) ? input.actions : []
  const buttons = actions.flatMap(action => {
    const { label, action: app, message } = (typeof action === 'object' && action !== null ? action : {}) as Record<string, unknown>
    const name = typeof label === 'string' && label.trim() !== '' ? label : app
    if (typeof name !== 'string' || name.trim() === '') return []
    return [{ label: name.trim(), send: typeof message === 'string' && message.trim() !== '' ? message.trim() : name.trim() }]
  })
  return { ask: input.ask.trim(), actions: buttons.map(b => b.label), sends: buttons.map(b => b.send) }
}

/**
 * The reply row's decision read off a wrap-up call's question: the question as its headline,
 * the buttons as its options, the first one recommended, each sending its button's message.
 * Null without a question or a button, which leaves the box as it is.
 */
export function decisionOfWrapUp(input: Record<string, unknown>): HumanQueueDecision | null {
  const wrap = askOfWrapUp(input)
  if (wrap === null || wrap.actions.length === 0) return null
  return { headline: wrap.ask, ask: wrap.ask, options: wrap.actions, dimensions: [], cells: [], recommend: 0, sends: wrap.sends }
}

/**
 * A wrap-up call's streamed arguments read as they stand: `partial` while the JSON is still
 * arriving; once whole, the arguments without the box's question and buttons when it asks
 * (the app draws the box from the call as streamed), and the reply row's decision it made.
 */
export function boxlessWrapUp(json: string): 'partial' | { json: string | null; decision: HumanQueueDecision | null } {
  let input: unknown
  try {
    input = JSON.parse(json)
  } catch {
    return 'partial'
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input) || askOfWrapUp(input as Record<string, unknown>) === null) {
    return { json: null, decision: null }
  }
  const { ask: _ask, actions: _actions, blocked: _blocked, ...recap } = input as Record<string, unknown>
  return { json: JSON.stringify(recap), decision: decisionOfWrapUp(input as Record<string, unknown>) }
}

/** The wrap-up box as lines of text: its question, then its buttons, the first marked. */
const wrapUpLines = (wrap: WrapUpAsk) =>
  [`Question: ${wrap.ask}`, ...wrap.actions.map((label, i) => `- ${label}${i === 0 ? ' (recommended)' : ''}`)].join('\n')

/** What the gate reads: the reply's end, and the wrap-up box's question after it. */
export function gateText(answer: string, wrap: WrapUpAsk | null): string {
  const tail = answer.trim().slice(-2000)
  return wrap === null ? tail : `${tail}\n\nThe reply ended with this question in its end-of-turn box:\n${wrapUpLines(wrap)}`
}

export const GATE_SYSTEM =
  'You read the end of an AI coding assistant reply. Answer YES if it ends by asking the person to decide, ' +
  'choose, or approve something before work can go on. Answer NO for rhetorical questions, pleasantries such ' +
  'as "anything else?", or a reply that just reports. Reply with YES or NO only.'

/** The gate's verdict from Haiku's text. */
export const isYes = (text: string) => /^\s*yes\b/i.test(text)

/** The most lines one source shows: a citation points at a passage, not a file (#108). */
export const SOURCE_LINES = 12

const SHAPE =
  '{"headline": string, "ask": string, "why": string, "options": [string], ' +
  '"dimensions": [string], "cells": [{"option": string, "dimension": string, "value": string, ' +
  '"tone": "advantage" | "neutral" | "tradeoff"}], "recommend": string, "reason": string, "next": string, ' +
  '"sources": [{"path": string, "lines": string}], "touches": [{"option": string, "paths": [string]}], ' +
  '"arguments": [{"claim": string, "call": string, "fact": fact}], "picks": [string], "facts": {kind: fact}}'

/**
 * The fact kinds a deck draws on its Decision tab, as the fork writes them: a
 * queue item's kinds less `answers` and `impact`, which are a yes and a no
 * (the deck has its own options), and less what another tab already holds, so
 * nothing is said twice (the owner, 2026-10-24): a comparison is the Comparison
 * tab's grid, sources are the Sources tab, and what each option touches is the
 * snapshot's.
 */
export const DECK_FACT_KINDS = FACT_KINDS.filter(kind => !['answers', 'impact', 'comparison', 'sources', 'touches'].includes(kind))

/** Techniques the deck never draws: a what-if needs the queue's answers, and a glossary is the deck's own text. */
export const NOT_ON_DECK = new Set(['what-if', 'glossary'])

/** The catalog's techniques a deck can draw: each reads a fact the fork writes, or the options' comparison (#109). */
export const DECK_TECHNIQUES = composed().filter(one =>
  one.reads !== null && !NOT_ON_DECK.has(one.id) && (one.reads === 'comparison' || (DECK_FACT_KINDS as readonly string[]).includes(one.reads)))

/** The techniques that draw the options' own comparison, from their cells: a pick of one needs no fact. */
export const COMPARISON_VIEWS = new Set(DECK_TECHNIQUES.filter(one => one.reads === 'comparison').map(one => one.id))

/** How many pictures a deck draws from the fork's picks. */
export const DECK_PICKS = 2

/** How many techniques the fork ranks, so a pick whose facts fail its checks passes its slot down (#109). */
export const DECK_CHOICES = 4

/** Every deck technique as the fork reads it: its id, its one job, and the question that says it fits. */
const PICKS_GUIDE = DECK_TECHNIQUES.map(one => `${one.id} (${one.job.replace(/\.$/, '')}; fits: ${one.fits}${one.reads === 'comparison' ? '' : `; reads ${one.reads}`})`).join('; ')

const FACTS_GUIDE =
  'The kinds, each optional: figures [{"label", "value": number, "unit"?}] (2 or 3 values the call turns on; unit ' +
  '"$", "%" or a noun); threshold {"values": [1 to 4 {"label", "value"}], "line": {"label", "value"}}; parts ' +
  '{"total", "label"?, "parts": [2 to 5 {"label", "value"}]}; flow {"nodes": [2 to 5 names], "moves": [{"from", ' +
  '"to", "label"?}], "never"?: {"from", "to"}}; steps [{"when", "what"}] (3 to 5, in order); counts {"total", ' +
  '"now", "after"?, "target"?, "noun"}; terms [{"term", "meaning"}]; evidence [up to 5 {"label", "says", "trust": ' +
  '"checked" | "measured" | "reported" | "guess", "weight"?: number, "unit"?}] (what the call rests on, how far to ' +
  'trust it, how much of it there is); tradeoffs {"pros": [1 to 4 lines], "cons": [1 to 4 lines]} (for and against ' +
  'the recommended option); gotchas [{"text", "level": "risk" | "watch"}] (a catch even on the recommendation); ' +
  'precedent [{"when", "ask", "ruled": "yes" | "no", "came"?}] (the person\'s earlier rulings like this one, only ' +
  'ones you can point to). Never repeat in facts what cells, sources or touches already say: the deck draws each ' +
  'once, on one page. At most twelve words to a line, and each thing once.'

export const FORK_PROMPT =
  '[vantage-point] This message is from the vantage-point plugin, not the person. Do not use tools and do not ' +
  'answer your own question. Your last reply asked the person to decide something. Describe that decision as ' +
  `JSON only, no code fence, in this shape: ${SHAPE}. headline: the question, eight words or fewer, ending in a question mark: the deck heads with it. ask: the ` +
  'decision in one sentence. options: the two ' +
  'or three you offered, as short imperative labels. dimensions: two or three questions that tell them apart. ' +
  'One cell for every option and dimension: a value of three words or fewer, tone advantage (good), neutral ' +
  '(middling) or tradeoff (bad). recommend: one option, exactly as written. why: why it matters, forty words or ' +
  'fewer. reason: why the recommended option, twenty-five words or fewer. next: the concrete first step a yes ' +
  'starts, as an instruction of twenty words or fewer that names what is done to what, never the option restated, ' +
  'with no citation. arguments: the one or two reasons the recommendation rests on, each with the fact behind it ' +
  'as a tool output you saw in this session: claim, the reason in twelve words or fewer; call, a piece of that tool ' +
  'call\'s input as you sent it (a file path, a command, a query), so the call can be found; fact, that output\'s data, ' +
  'copied exactly, in one shape: {"shape": "table", "columns": [2 to 4 names], "rows": [[one cell per column]]} for ' +
  'rows of values; {"shape": "bars", "series": [1 or 2 names], "rows": [{"label", "values": [one number per ' +
  'series]}], "unit"?} for numbers to compare; {"shape": "terms", "terms": [{"term", "meaning"}]} for the words the ' +
  'call turns on, defined where you read them; or, only when no table, bars or terms holds the data, {"shape": ' +
  '"lines", "lines": "up to 12 lines"}, whole statements as printed, never a sentence cut off. Every cell, label, number and line must appear in that output as it printed them, or the fact is ' +
  'dropped and only the claim shows. Take the data behind the reply, the rows, counts and definitions you read, ' +
  'never the reply said again; leave out an argument no output backs. A claim says what its fact means for the ' +
  'call, leaving the numbers to the fact, and links that to the option it backs; one command per fact. A claim says only what its fact shows, and ' +
  'names every column its fact draws; the fact holds the rows the claim is about, first, and no rows it does not ' +
  'use; name the series and columns in the claim\'s own words. Between them the arguments back every part of the ' +
  'recommended option (to keep a thing and to raise it are two parts), or the option names only what they back. A ' +
  'lines fact keeps the lines that say what its other lines belong to (an id, a name, a heading), and draws no line ' +
  'its claim does not use. sources: files you read in this ' +
  'session or memory files in your context, each with its path and lines, the first and last line of the ' +
  `passage that backs the claim as your reads numbered them ("412-418"), at most ${SOURCE_LINES} lines; never copy the ` +
  'text, which is read from the file. Cite them in why and reason as [1], [2]. A source whose file you did not ' +
  'read, or whose lines are not in it, is dropped, and its citations with it. touches: for each option, up to six files or ADR documents it would change or ' +
  'that govern it, as paths in the repository; leave out an option that touches none, and a path that does not ' +
  'exist is dropped. picks: first rank the ' + `${DECK_CHOICES}` + ' techniques that would show this decision best, best ' +
  'first, by asking each one\'s question of the decision, the shape the call actually turns on ' +
  '(a flow, a line to clear, a split, a run of steps, a few figures), not the catch or the for and against every ' +
  `call has; the deck draws the first ${DECK_PICKS} whose facts pass their checks. The techniques: ${PICKS_GUIDE}. A pick that draws the options' comparison needs no fact. facts: the ` +
  'facts your picks read, and no other kind; write each as what it is, and include only facts the reply or the ' +
  `files you read state. ${FACTS_GUIDE} If there is no real choice, reply {}.`

/** The fork's prompt, told the wrap-up box's question when the reply asked there. */
export function forkPrompt(wrap: WrapUpAsk | null): string {
  if (wrap === null) return FORK_PROMPT
  return `${FORK_PROMPT} You asked the question in the end-of-turn box, not in your reply text:\n${wrapUpLines(wrap)}\n` +
    'Its first button is your recommendation. Your options are its buttons\' labels, copied exactly and in their order: ' +
    'a deck whose options differ from them is dropped.'
}

/** The fork may wrap its JSON in prose or a fence: take the outermost braces. */
export function parseForkJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1))
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

/** Says a text in at most `words` words: one Haiku call. Null when it cannot. */
export type Compress = (text: string, words: number) => Promise<string | null>

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length
const cutWords = (text: string, words: number) => text.trim().split(/\s+/).slice(0, words).join(' ')

/**
 * Limits are space, not refusals: a text over its room goes to the compressor
 * once, and what still overflows is cut to the room. Citations survive a cut
 * only when they still fit; the quote check renumbers what is left.
 */
export async function fitFields(raw: Record<string, unknown>, compress: Compress): Promise<Record<string, unknown>> {
  const fit = async (value: unknown, words: number): Promise<unknown> => {
    if (typeof value !== 'string' || wordCount(value) <= words) return value
    const shorter = await compress(value, words).catch(() => null)
    if (shorter !== null && wordCount(shorter) <= words && shorter.trim() !== '') return shorter.trim()
    return cutWords(value, words)
  }
  const out: Record<string, unknown> = { ...raw }
  out.headline = await fit(raw.headline, 8)
  out.why = await fit(raw.why, 40)
  out.reason = await fit(raw.reason, 25)
  out.next = await fit(raw.next, 20)
  if (Array.isArray(raw.cells)) {
    out.cells = await Promise.all(raw.cells.map(async cell =>
      typeof cell === 'object' && cell !== null ? { ...cell, value: await fit((cell as Record<string, unknown>).value, 3) } : cell))
  }
  // An ask longer than one sentence keeps its first.
  if (typeof raw.ask === 'string') out.ask = raw.ask.trim().split(/(?<=[.!?])\s+/)[0]
  return out
}

/**
 * The fork's facts as the deck keeps them: every kind that passes its schema, less
 * `answers`; a kind that fails is dropped, not the deck. Undefined when none is left.
 */
export function deckFacts(raw: unknown): Facts | undefined {
  if (raw === undefined) return undefined
  const { facts } = parseFacts(raw)
  const kept = Object.fromEntries(Object.entries(facts).filter(([kind]) => (DECK_FACT_KINDS as readonly string[]).includes(kind)))
  return Object.keys(kept).length === 0 ? undefined : (kept as Facts)
}

/** A source's path as the link that opens it: relative paths sit in the session's folder `cwd`. */
export const fileUrl = (cwd: string) => (path: string) => `file://${path.startsWith('/') ? path : `${cwd.replace(/\/$/, '')}/${path}`}`

/**
 * Everything a deck decision's page draws, as the composer's facts (#102): the
 * fork's own and its comparison as the catalog's comparison (each cell's words
 * kept, its tone the value that ranks it), so one page composes them and no tab
 * holds any apart (the owner, 2026-10-24). Its sources are chips on their
 * sentences, never a tile (#108).
 */
export function deckPageFacts(d: Decision): Facts | undefined {
  const out: Facts = { ...(deckFacts(d.facts) ?? {}) }
  // The options' comparison draws only when the fork picked a technique that draws it (#109); a deck from before picks keeps it.
  if (d.dimensions.length > 0 && (d.picks === undefined || d.picks.some(id => COMPARISON_VIEWS.has(id)))) {
    out.comparison = {
      options: [...d.options],
      recommended: d.recommend,
      rows: d.dimensions.map((label, r) => ({
        label,
        unit: '',
        better: 'higher' as const,
        values: d.cells[r]!.map(cell => TONE_SCORE[cell.tone]),
        cells: d.cells[r]!.map(cell => cell.value),
      })),
    }
  }
  return Object.keys(out).length === 0 ? undefined : out
}

/** The fork's JSON as a decision, or null when its structure is broken. Facts that fail are left out. */
/** The fork's picks that name a deck technique, in its order, at most `DECK_CHOICES`; empty when it named none. */
export function picksOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const ids = new Set(DECK_TECHNIQUES.map(one => one.id))
  return [...new Set(raw.filter((one): one is string => typeof one === 'string').map(one => one.trim()))].filter(one => ids.has(one)).slice(0, DECK_CHOICES)
}

/**
 * The views a deck draws, from those its plan ranks: the fork's picks that can draw, in its order, then the
 * plan's best for any slot still empty, never two views of one fact; every ranked view for a deck from before picks.
 */
export function deckViews(picks: readonly string[] | undefined, ranked: readonly string[]): string[] {
  if (picks === undefined) return [...ranked]
  const readsOf = (id: string) => DECK_TECHNIQUES.find(one => one.id === id)?.reads ?? id
  const kept: string[] = []
  for (const id of [...picks.filter(one => ranked.includes(one)), ...ranked]) {
    if (kept.length === DECK_PICKS) break
    if (!kept.includes(id) && !kept.some(one => readsOf(one) === readsOf(id))) kept.push(id)
  }
  return kept
}

/** The fork's JSON as a decision, or null when its structure is broken. Facts that fail are left out; with picks, so are facts no pick reads (#109). */
export function decisionFromFork(raw: Record<string, unknown>): Decision | null {
  const decision = parseDecision(raw)
  if (decision === null) return null
  const picks = picksOf(raw.picks)
  const reads = new Set(DECK_TECHNIQUES.filter(one => picks.includes(one.id)).map(one => one.reads))
  const all = deckFacts(raw.facts)
  const facts = all === undefined || picks.length === 0 ? all : Object.fromEntries(Object.entries(all).filter(([kind]) => reads.has(kind as never))) as Facts
  const kept = facts === undefined || Object.keys(facts).length === 0 ? undefined : facts
  return { ...decision, ...(kept === undefined ? {} : { facts: kept }), ...(picks.length === 0 ? {} : { picks }) }
}

/** Reads a file's text; rejects when it is missing or unreadable. */
export type ReadFile = (path: string) => Promise<string>

/** An ADR's number as its file name writes it (`ADR-017-….md`, or `0017-….md` under an adr or decisions folder); null for any other file. */
export function adrId(path: string): string | null {
  const name = path.split('/').pop() ?? ''
  const match = /^adr[-_ ]?(\d+)/i.exec(name) ?? (/(^|\/)(adr|adrs|decisions)\//i.test(path) ? /^(\d+)[-_]/.exec(name) : null)
  return match === null || !name.toLowerCase().endsWith('.md') ? null : match[1]!
}

/**
 * The snapshot's paths, checked as quotes are: a path that cannot be read is dropped, and an
 * ADR whose status line says superseded is marked. Absent when no path is left.
 */
export async function checkTouches(decision: Decision, read: ReadFile): Promise<Decision> {
  if (decision.touches === undefined) return decision
  const touches = await Promise.all(decision.touches.map(async paths => {
    const kept: NonNullable<Decision['touches']>[number] = []
    for (const touch of paths) {
      const text = await read(touch.path).catch(() => null)
      if (text === null) continue
      const superseded = adrId(touch.path) !== null && /^\W*status\W*superseded/im.test(text.split('\n').slice(0, 20).join('\n'))
      kept.push(superseded ? { path: touch.path, superseded: true } : { path: touch.path })
    }
    return kept
  }))
  const out: Decision = { ...decision, touches }
  if (touches.every(paths => paths.length === 0)) delete out.touches
  return out
}

/** A path inside Claude Code's auto-memory folder. */
export const isMemoryPath = (path: string) => /\/\.claude\/projects\/[^/]+\/memory\//.test(path)

/**
 * Sentences of a text; each keeps its own `[n]` citations.
 * A break is `.!?` followed by a space.
 */
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter(s => s.trim() !== '')
const citesOf = (sentence: string) => [...sentence.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]))

/** Every sentence stays; a citation of a dropped source goes (#108). */
function keepCitations(text: string | undefined, renumber: Map<number, number>): string | undefined {
  if (text === undefined) return undefined
  return sentences(text).map(sentence =>
    sentence.replace(/\s*\[(\d+)\]/g, (_, n: string) => (renumber.has(Number(n)) ? ` [${renumber.get(Number(n))}]` : '')),
  ).join(' ')
}

/** A deck paragraph's sentences as the page draws them: each one's text with no markers, and the sources it cites (#108). */
export function citedSentences(text: string): { text: string; cites: number[] }[] {
  const out: { text: string; cites: number[] }[] = []
  for (const sentence of sentences(text)) {
    const cites = [...new Set(citesOf(sentence))]
    const bare = sentence.replace(/\s*\[\d+\]/g, '').trim()
    // A citation set after the full stop is its sentence's, not a sentence of its own.
    if (bare === '' && out.length > 0) out[out.length - 1]!.cites.push(...cites.filter(n => !out[out.length - 1]!.cites.includes(n)))
    else if (bare !== '') out.push({ text: bare, cites })
  }
  return out
}

/** A source's chip: its file's name, or a memory's own name, and its first line (#108). */
export function sourceName(source: Source): string {
  const name = source.path.split('/').pop() ?? source.path
  const file = source.memory === true ? `memory: ${name.replace(/\.md$/, '')}` : name
  return source.line === undefined ? file : `${file}:${source.line}`
}

/** Whether a tool call in the session named `path`, absolute or as `relative` to the session's folder: a file the agent read. */
export function wasRead(calls: readonly unknown[], path: string, relative: string): boolean {
  return calls.some(call => {
    const text = JSON.stringify(call) ?? ''
    return text.includes(path) || (relative !== '' && text.includes(relative))
  })
}

/**
 * The lines check, no model (#108): a source is a file the agent read this session (or a memory its context
 * carries) and a range of lines in it, and its quote is those lines as the file holds them now, never text the
 * fork retyped. A source that fails loses its citations; every sentence stays.
 */
export async function checkLines(decision: Decision, read: ReadFile, isRead: (path: string) => boolean, memoriesInContext: ReadonlySet<string>): Promise<Decision> {
  const sources = decision.sources ?? []
  const renumber = new Map<number, number>()
  const kept: Source[] = []
  for (const [i, source] of sources.entries()) {
    const memory = isMemoryPath(source.path)
    if (memory ? !memoriesInContext.has(source.path) : !isRead(source.path)) continue
    const line = source.line ?? 0
    const lines = await read(source.path).then(text => text.split('\n'), () => null)
    if (lines === null || line < 1 || line > lines.length) continue
    const end = Math.min(source.end ?? line, line + SOURCE_LINES - 1, lines.length)
    // The passage loses the indent its lines share, so code reads from its own left edge.
    const passage = lines.slice(line - 1, Math.max(end, line))
    const indent = Math.min(...passage.filter(text => text.trim() !== '').map(text => /^\s*/.exec(text)![0].length))
    const quote = passage.map(text => text.slice(Number.isFinite(indent) ? indent : 0)).join('\n').replace(/\s+$/, '')
    if (quote.trim() === '') continue
    kept.push({ ...source, quote, line, end: Math.max(end, line), ...(memory ? { memory: true } : {}) })
    renumber.set(i + 1, kept.length)
  }
  const out: Decision = { ...decision, sources: kept }
  for (const key of ['why', 'reason'] as const) {
    const text = keepCitations(decision[key], renumber)
    if (text === undefined) delete out[key]
    else out[key] = text
  }
  if (kept.length === 0) delete out.sources
  return out
}

/**
 * What pressing each option sends (issue #22): the wrap-up button's message when
 * the option is that button's label, else the option's own words.
 */
export function optionSends(options: readonly string[], wrap: WrapUpAsk | null): string[] {
  const key = (text: string) => text.trim().toLowerCase()
  return options.map(option => {
    const i = wrap === null ? -1 : wrap.actions.findIndex(label => key(label) === key(option))
    return wrap !== null && i >= 0 ? (wrap.sends[i] ?? option) : option
  })
}

/**
 * The reply row's decision read off an AskUserQuestion call: its first question, its
 * options with the one marked `(Recommended)` leading the row, and no comparison, since the
 * question carries none. Null when the input is not a question with two to four labels.
 */
export function decisionOfQuestions(questions: unknown): HumanQueueDecision | null {
  const first = Array.isArray(questions) ? questions[0] : undefined
  if (typeof first !== 'object' || first === null) return null
  const { header, question, options } = first as { header?: unknown; question?: unknown; options?: unknown }
  if (typeof question !== 'string' || question.trim() === '' || !Array.isArray(options)) return null
  const labels = options.map(option => {
    const label = typeof option === 'object' && option !== null ? (option as { label?: unknown }).label : undefined
    return typeof label === 'string' && label.trim() !== '' ? label.trim() : null
  })
  if (labels.length < 2 || labels.length > 4 || labels.includes(null)) return null
  const recommended = /\s*\(recommended\)$/i
  const bare = labels.map(label => label!.replace(recommended, ''))
  const head = typeof header === 'string' && header.trim() !== '' ? header.trim() : question.trim().split(/\s+/).slice(0, 8).join(' ')
  return {
    headline: head,
    ask: question.trim(),
    options: bare,
    dimensions: [],
    cells: [],
    recommend: Math.max(0, labels.findIndex(label => recommended.test(label!))),
    sends: bare,
  }
}

/** The session card a `start_session` call proposed, found in its result: its `task_…` id, or null. */
export function proposedCard(result: string): string | null {
  return /\bProposed\b.*?\btask_id: (task_[A-Za-z0-9]+)/s.exec(result)?.[1] ?? null
}

/**
 * The card a desktop session record says the session was started from (#67): its
 * `spawnedFrom.taskId`, or null for a record that names none or does not parse.
 */
export function startedCard(record: string): string | null {
  try {
    const spawned = (JSON.parse(record) as { spawnedFrom?: { taskId?: unknown } }).spawnedFrom
    return typeof spawned?.taskId === 'string' ? spawned.taskId : null
  } catch {
    return null
  }
}
