// The decision deck (issue 167): the agent declares the decision itself through the decide
// tool, in the turn it asks, so the deck costs no model call of its own. Pure: the
// declaration in, a checked decision or what to fix out.
import type { SessionMessage } from 'claude-code'
import type { HumanQueueDecision } from '../types'

import { diagramOf, pagesOf, POINTS } from '../panes/visuals/options'
import { HEADLINE_WORDS, parseDecision } from './reply'

export type Decision = HumanQueueDecision

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

/** An option as a button's label is matched: no case, no `(recommended)` the agent copied, no stops at its edges. */
const optionKey = (option: string) => option.toLowerCase().replace(/\(recommended\)/g, '').replace(/^[\s.,;:!?*_`"']+|[\s.,;:!?*_`"']+$/g, '')

/**
 * A deck decision whose options take the wrap-up buttons' own words, each relabelled so its send matches, in the
 * declaration's order so its cells, pages and recommendation still hold. The box holds at most two buttons, so a
 * declared option with no button keeps its own label and sends it. Null when a button names no declared option.
 */
export function asButtons<D extends { options: readonly string[] }>(decision: D, actions: readonly string[]): D | null {
  const matched = actions.map(label => decision.options.findIndex(option => optionKey(option) === optionKey(label)))
  if (matched.some(i => i < 0) || new Set(matched).size !== matched.length) return null
  const options = decision.options.map((option, i) => {
    const button = matched.indexOf(i)
    return button < 0 ? option : actions[button]
  })
  return { ...decision, options }
}

const SHAPE =
  '{"headline": string, "ask": string, "options": [string], ' +
  '"dimensions": [string], "cells": [{"option": string, "dimension": string, "value": string, ' +
  '"tone": "advantage" | "neutral" | "tradeoff"}], "recommend": string, ' +
  '"pages": [{"option": string, "what": string, "diagrams": [diagram]}]}'

/** The diagrams a page draws, as the agent reads them (#134): each point, what its title says, and the shapes that draw it. */
const DIAGRAMS_GUIDE =
  'A diagram is {"point", "title", "draw", "says"?, "terms"?}. point: "why" (on the recommended option, what makes ' +
  'it worth doing; on another, why you would pick it), "how" (how it works), "work" (who does the work: the time ' +
  'it takes you and what falls to the person), "control" (on the recommended option, what you control), "passed" ' +
  '(on another option, why you did not recommend it) or "risk" (what could go wrong, with its fallback). Put first ' +
  'the diagram that most decides the choice: the person reads top down, and the pane scrolls to hold every one. ' +
  'Every option has something that could go wrong, and its page says what and the fallback. title: the point ' +
  'the diagram makes, led by its kind, the point always said ("Why: today\'s footage stutters", "How: both routes ' +
  'use the same macOS recorder", "Who does the work: nearly all mine", "What I control: every press, to the frame", ' +
  '"Why I didn\'t recommend it: the setup falls to you", "What could go wrong: an off-screen window may not ' +
  'draw"), twelve words or fewer, and the picture shows that point, not another. draw, one shape: {"shape": "bars", "rows": [2 to 4 {"label", "value": ' +
  'number, "unit"?, "lit"?: true}]} for amounts to compare, every row the point is about lit, this option\'s own row among them, and the rest not, each label saying in plain ' +
  'words what its amount is, and never for a count of 0 or 1 (a yes or no difference is a route box or a line); ' +
  '{"shape": "route", "stages": [2 to 5 stages, each [1 to 3 {"name", "note"?, "lit"?: true}]]} for how something ' +
  'flows or the steps it takes, left to right, alternatives in one stage stacked, lit only where this option\'s path differs from another (a route all ' +
  'its own lights nothing), a ' +
  'note explaining a term in its box; {"shape": "work", "rows": [{"who": "me", "minutes": number, "plus"?}, {"who": ' +
  '"you", "minutes": number, "plus"?}]} for who does the work: your best estimate of each side\'s minutes, never 0 ' +
  'for a side that has anything to do, plus for what minutes miss ("+ install"); {"shape": "risk", "risks": [1 or 2 ' +
  '{"risk", "why"?, "fallback"}]} for what could go wrong and what you would do then; {"shape": "lines", "lines": [2 ' +
  'to 4 {"text"}]} only for what you control, short statements. Every other point is a picture, not lines: a reason ' +
  'that is a run of steps is a route, one box a step; a reason that is amounts is bars. Leave out a work diagram ' +
  'where neither side does anything. says: one sentence under the picture with what it shows, only when the ' +
  'picture alone does not say it. terms: [{"term", "meaning"}] for every word in the diagram a newcomer would stop ' +
  'on that no note explains, on every page that uses it, since the person may open any tab first. A diagram carries an argument: never a number without what it means or its unit, ' +
  'never a figure on its own, and each fact once on a page: no diagram restates the sentence on what the option ' +
  'is or another diagram, a work row\'s plus never repeats a step a route draws, and a measured value is said once, ' +
  'as measured, never again in words or rounded. One thing has one estimate on every page (a reshoot\'s minutes are ' +
  'the same wherever it appears), and one name on every page (not "frame rate" on one tab and "pictures a second" on another). ' +
  'Bars that argue against a yardstick draw the yardstick as a row (what smooth video does beside today\'s takes). At most ' +
  'twelve words to a line, and no count, term or name from this session (a scene\'s nickname) a newcomer could ' +
  'not read.'

/** Words a field holds, past which the declaration cuts it (#14: limits are space, never a refusal). */
const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length
const cutWords = (text: string, words: number) => text.trim().split(/\s+/).slice(0, words).join(' ')

/** What the decide tool tells the agent: when to call it, and the shape it takes. */
export const DECIDE_DESCRIPTION =
  'Show the person the decision you are asking them to make, in the Decision pane the band\'s reply row opens. Call it ' +
  'once in any turn whose reply asks the person to choose between options or approve a step, before you end the turn, ' +
  'with the same options you offer in your reply or end-of-turn box. It costs no model call: you write it, nothing ' +
  `runs after you. The input is ${SHAPE}. headline: the question your options answer, in plain words a newcomer ` +
  'reads, twelve words or fewer, naming no technical term; with three options, or two that are not a yes and a no, ' +
  'it asks which, never "Should I ...?". ask: the same question in one sentence. options: the two or three you offer, ' +
  'as short imperative labels, the same words as your end-of-turn buttons when you use them (the box holds two, so ' +
  'a third option needs no button). Call this before the end-of-turn box. dimensions: two or three ' +
  'questions that tell them apart. One cell for every option and dimension: a value of three words or fewer, tone ' +
  'advantage (good), neutral (middling) or tradeoff (bad). recommend: one option, exactly as written. pages: one for ' +
  'every option, its option written exactly as in options. The person reads each page on its own tab and is not a ' +
  'specialist in this field: write in plain words. what: one sentence on what the option is, for someone who has ' +
  'never heard of it. diagrams: 1 to 5, only those that carry an argument. ' + DIAGRAMS_GUIDE + ' Use only what you ' +
  'know from this session or checked with your tools; a guess says so ("untested"). A field over its words is cut ' +
  'to fit; a broken structure is refused with what to fix, and the pane shows nothing until a call passes.'

/** A declaration the pane can draw, with any field cut to its room; or what to fix, when its structure is broken. */
export type Declared = { decision: Decision; cut: string[] } | { refused: string[] }

/** The decide tool's input as a decision (issue 167): fields over their room are cut, a broken structure is refused, every option needs a page whose every diagram draws. */
export function declared(input: Record<string, unknown>): Declared {
  const cut: string[] = []
  const fit = (value: unknown, words: number, name: string): unknown => {
    if (typeof value !== 'string' || wordCount(value) <= words) return value
    cut.push(`${name} cut to ${words} words`)
    return cutWords(value, words)
  }
  const raw: Record<string, unknown> = { ...input, headline: fit(input.headline, HEADLINE_WORDS, 'headline') }
  if (typeof input.ask === 'string') {
    const first = input.ask.trim().split(/(?<=[.!?])\s+/)[0]
    if (first !== input.ask.trim()) cut.push('ask cut to its first sentence')
    raw.ask = first
  }
  if (Array.isArray(input.cells)) {
    raw.cells = input.cells.map((cell, i) =>
      typeof cell === 'object' && cell !== null ? { ...cell, value: fit((cell as Record<string, unknown>).value, 3, `cells[${i}].value`) } : cell)
  }
  const decision = parseDecision(raw)
  if (decision === null) {
    const refused: string[] = []
    const strings = (value: unknown) => Array.isArray(value) ? value.filter(one => typeof one === 'string' && one.trim() !== '') : []
    if (typeof raw.headline !== 'string' || raw.headline.trim() === '') refused.push('headline: the question, twelve words or fewer')
    if (typeof raw.ask !== 'string' || raw.ask.trim() === '') refused.push('ask: the question in one sentence')
    const options = strings(raw.options)
    if (options.length < 2 || options.length > 3 || new Set(options).size !== options.length) refused.push('options: two or three different labels')
    const dimensions = strings(raw.dimensions)
    if (dimensions.length < 2 || dimensions.length > 3 || new Set(dimensions).size !== dimensions.length) refused.push('dimensions: two or three different questions')
    if (!options.includes(typeof raw.recommend === 'string' ? raw.recommend.trim() : '')) refused.push('recommend: one of options, exactly as written')
    if (refused.length === 0) refused.push('cells: exactly one {option, dimension, value, tone} for every option and dimension, each named exactly as in options and dimensions, tone advantage, neutral or tradeoff')
    return { refused }
  }
  const given = Array.isArray(input.pages) ? input.pages : []
  const refused: string[] = []
  decision.options.forEach(option => {
    const page = given.find(one => typeof one === 'object' && one !== null && typeof (one as Record<string, unknown>).option === 'string' &&
      ((one as Record<string, unknown>).option as string).trim().toLowerCase() === option.trim().toLowerCase()) as Record<string, unknown> | undefined
    if (page === undefined) return void refused.push(`pages: no page for "${option}"`)
    if (typeof page.what !== 'string' || page.what.trim() === '') refused.push(`pages["${option}"].what: one sentence on what the option is`)
    const diagrams = Array.isArray(page.diagrams) ? page.diagrams : []
    if (diagrams.length === 0) refused.push(`pages["${option}"].diagrams: at least one`)
    diagrams.forEach((one, i) => {
      if (diagramOf(one) === null) refused.push(`pages["${option}"].diagrams[${i}]: needs a point (${POINTS.join(', ')}), a title, and a draw of one shape with every field it needs`)
    })
  })
  if (refused.length > 0) return { refused }
  const pages = pagesOf(given, decision.options)
  return { decision: pages === undefined ? decision : { ...decision, pages }, cut }
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
