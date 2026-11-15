// The decision deck (issue 167): the agent declares the decision itself through the decide
// tool, in the turn it asks, so the deck costs no model call of its own. Pure: the
// declaration in, a checked decision or what to fix out.
import type { SessionMessage } from 'claude-code'
import type { HumanQueueArgument, HumanQueueDecision, HumanQueueOptionPage, HumanQueueRests } from '../types'

import { MIN_TEXT_PX } from '../panes/visuals/overflow'
import { DESIGN_WIDTH, MAX_HEIGHT, PASSIVE, picture } from '../panes/visuals/picture'
import { shotAsk, unseenIn, type ShotAsk } from '../panes/visuals/shots'
import { checkSource, type ReadFile } from '../panes/visuals/sources'
import { HEADLINE_WORDS } from './reply'

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
  return { headline: wrap.ask, ask: wrap.ask, options: wrap.actions, recommend: 0, sends: wrap.sends }
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

/** The words each field of a page holds; one over is refused, never cut (spec 171, cut for the one-pager by spec 176). */
export const WORDS = { what: 15, claim: 12, excerpt: 20, dependsOn: { on: 8, if: 10 }, risk: 12, fallback: 12, whyNot: 10 } as const

/**
 * The words that mark a claim about what a person sees (spec 176): its verb, in any inflection, or the surface it names.
 * Such a claim rests on a shot of that surface or the person's ruling. A heuristic: it misses a visible claim worded
 * otherwise ("the tab is blue") and catches a few that are not ("the budget fits").
 */
export const VISIBLE_WORDS = new Set([
  'show', 'shows', 'showed', 'shown', 'showing',
  'draw', 'draws', 'drew', 'drawn', 'drawing',
  'render', 'renders', 'rendered', 'rendering',
  'fit', 'fits', 'fitted', 'fitting',
  'look', 'looks', 'looked', 'looking',
  'appear', 'appears', 'appeared', 'appearing',
  'display', 'displays', 'displayed', 'displaying',
  'desktop', 'pane', 'panes', 'band', 'phone', 'screen', 'screens',
])

/** The kinds a visible claim may rest on: what the person saw, or what they said. */
// An estimate or assumption says it is not observed, so it may speak of a surface not built yet; a read or run may not (the spec review).
const SEEN_KINDS: readonly HumanQueueRests['kind'][] = ['shot', 'ruling', 'estimate', 'assumption']

const STOP_WORDS = new Set(('a an and are as at be but by for from has have i in is it its of on or so than that the then there these this ' +
  'those to was we were will with you your all each every no not one our they their them what which who how').split(' '))
/** The words a claim and its picture's text are compared on, each stem to the word first seen: lowercase letters and digits, no stop word, a plural's s and then an ed or ing cut. */
const contentWords = (text: string): Map<string, string> => {
  const words = new Map<string, string>()
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const stem = word.length > 3 ? word.replace(/(?<!s)s$/, '').replace(/(ing|ed)$/, '') : word
    if (!STOP_WORDS.has(word) && !words.has(stem)) words.set(stem, word)
  }
  return words
}

/** A picture's visible text: its style sheets and tags dropped, its entities read as spaces. */
const pictureText = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')

/** Past this share of a picture's words found in its claim, the picture restates it (spec 176)... */
export const RESTATED_SHARE = 0.6
/** ...unless it has this many words of its own beyond the claim's. */
export const OWN_WORDS = 8

const KINDS: readonly HumanQueueRests['kind'][] = ['read', 'run', 'shot', 'ruling', 'estimate', 'assumption']

const SHAPE =
  '{"headline": string, "ask": string, "options": [string], "recommend": string, "pages": [{"option": string, ' +
  '"what": string, "dependsOn"?: {"on": string, "otherwise": string, "if": string}, "arguments": [{"claim": string, ' +
  `"rests": {"kind": ${KINDS.map(kind => `"${kind}"`).join(' | ')}, "ref"?: string, "excerpt"?: string, ` +
  '"crop"?: {"x", "y", "w", "h"}, "callout"?: {"x", "y", "label", "side"?: "right" | "left" | "above" | "below"}, "before"?: {"ref", "crop"?}}, ' +
  '"picture"?: {"html": string, "height": number}}], "risk": string, "fallback"?: string, ' +
  '"whyNot": [{"option": string, "line": string}] | string}]}'

/** What the decide tool tells the agent, read on every turn: when to call it, the page shape, and how each field is checked. */
export const DECIDE_DESCRIPTION =
  'Show the person the decision you are asking them to make, in the Decision pane the band\'s reply row opens. Call it ' +
  'once in any turn whose reply asks the person to choose between options or approve a step, before you end the turn ' +
  `and before the end-of-turn box, with the options you offer there. It costs no model call. The input is ${SHAPE}. ` +
  `headline: the question your options answer, in plain words, ${HEADLINE_WORDS} words or fewer, no technical term; ` +
  'with three options, or two that are not a yes and a no, it asks which, never "Should I ...?". ask: the same ' +
  'question in one sentence. options: the two or three you offer, short imperative labels, in your end-of-turn ' +
  'buttons\' words (the box holds two). recommend: one option, exactly as written. pages: one per option, its option ' +
  'as in options. The person opens the recommended page first and mostly decides there, so it carries the whole case. ' +
  `what: one sentence (${WORDS.what} words) on what the option is, for a newcomer. dependsOn, on the recommended page ` +
  'only: the fact the call hinges on, read "This depends on {on}; choose {otherwise} instead if {if}", otherwise ' +
  `another option, on ${WORDS.dependsOn.on} words and if ${WORDS.dependsOn.if}. arguments: 1 to 4, strongest first, an observed source ahead of ` +
  'an estimate or assumption; argue every option as ' +
  'strongly as you honestly can, so its tab is a real second opinion (a "leave it" option may state its consequence ' +
  `in one). claim: ${WORDS.claim} words. A claim about what a person sees (its verb shows, draws, renders, fits, ` +
  'looks, appears or displays, or it names the desktop, the pane, the band, the phone or the screen) rests on a ' +
  '"shot" of that surface or a "ruling"; a read or run is refused as proof of what a person sees. ' +
  'rests is checked against this session; cite only what it read or ran: ' +
  '"read" gives ref "path:12" or "path:12-18" of a file one of your tool calls opened, and its excerpt copied exactly ' +
  'from those lines as the file reads now; "run" gives an excerpt exactly as one of your tool results printed it, and ' +
  'ref naming the script or file it ran as a reader would know it (scripts/land.sh, not cat); "shot" gives ref, ' +
  'the path of an image file this session captured or read (never image data), with crop and callout in its ' +
  'pixels, the callout\'s label 4 words and its side the side of the point with empty space ("right" for a word at the end of a tab row; absent, above-right), the point then on that edge of what it marks (the right end of a word for "right") so the ring never covers it, and before, a fix\'s failing state at the same crop size; of a shot ' +
  'scripts/desktop-shot.sh took, cite its <out>@2x.png, the full-resolution file, whose type draws sharp, never the ' +
  'halved <out>.png; "ruling" quotes the person\'s own words from this session or a "## Rulings" comment you ' +
  `read, its ref the issue it was ruled on ("issue 171") when there is one; "estimate" and "assumption" need no source and are shown as such. A shot with before needs a callout on the After marking what changed. excerpt: ${WORDS.excerpt} words. ` +
  'Show rather than tell. An argument\'s exhibit, a shot or a picture, draws right under its claim. An argument earns an ' +
  'exhibit only when the reader must relate things: name what the eye reads off it that the claim cannot (where, ' +
  'which, how much, how it is spread), and if nothing, the claim stays a sentence. The content picks the form: a ' +
  'visible claim, a shot of that surface cropped to the part it names, with before for a fix; options that differ, ' +
  'the same small drawing on each page with the difference marked; a sequence, boxes and arrows with a verb on each ' +
  'arrow; 2 to 5 values, bars from zero with one highlighted; change over time, a line; one number, bold in the claim ' +
  'with no picture; command output, a "run" excerpt with no drawing. A picture whose text mostly repeats its claim ' +
  `is refused. picture: an HTML fragment laid out ` +
  `${DESIGN_WIDTH} CSS pixels wide at the height you state (at most ${MAX_HEIGHT}), text no smaller than ${MIN_TEXT_PX}px, well-formed, of these elements ` +
  `only: ${[...PASSIVE].join(', ')}; no event handler, no image file, nothing loaded from outside it. It draws ` +
  `indented under its claim, ${DESIGN_WIDTH} wide or less, its type beside the pane's 13px text, so set each value ` +
  `left-aligned beside its label, never pushed to a right edge: draw in the desktop's neutrals with at most one ` +
  `accent, labels in the desktop's dim grey, bold only the one figure the claim rests on, and no amber frame or ` +
  `green fill, which the pane keeps for a warning and the recommendation. risk: what could go wrong (${WORDS.risk} words); fallback: what you would do then ` +
  `(${WORDS.fallback}). whyNot: on the recommended page [{"option", "line"}], a line per other option on why it lost; ` +
  `elsewhere one line on why this option was not recommended (${WORDS.whyNot} words a line). A field over its words, ` +
  'a source that does not hold or a picture that breaks a rule is refused, each named, and nothing shows until a ' +
  'call passes. The pane holds the case: your reply states the ask in a sentence and does not repeat the arguments.'

/** A declaration the pane can draw; or every field to fix, each by its path. */
export type Declared = { decision: Decision } | { refused: string[] }

/** Cuts and encodes one shot (hooks/shots.ts, spec 176): the shot, or every reason it cannot be, named under `at`. */
export type ShotEncode = (ask: ShotAsk, at: string) => Promise<{ shot: NonNullable<HumanQueueRests['shot']> } | { refused: string[] }>

/** Where a shot's relative path resolves, and how it is encoded; a caller with none refuses every shot. */
export type Shots = { cwd: string; encode: ShotEncode }

/** What each argument's source is checked against: the session, the files as they read now, and the shot encoder. */
type Against = { messages: readonly SessionMessage[]; read: ReadFile; shots?: Shots; encoding: Promise<string[]>[] }

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null

/** A field's text as drawn: trimmed, its spaces collapsed; null when it is not text or holds none. */
const line = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  return text === '' ? null : text
}

const wordCount = (text: string) => text.split(' ').length

/** An option as a page names it: no case, no edge spaces. */
const sameOption = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Records every refusal of one declaration, and reads its text fields against their word limits. */
class Refusals {
  readonly all: string[] = []
  add(path: string, why: string): null {
    this.all.push(`${path}: ${why}`)
    return null
  }
  /** The field's text when it holds `words` or fewer; null, with the reason recorded at `path`, when not. */
  text(value: unknown, words: number, path: string, what: string): string | null {
    const said = line(value)
    if (said === null) return this.add(path, `${what}, ${words} words or fewer`)
    return wordCount(said) > words ? this.add(path, `${wordCount(said)} words, over its ${words}: ${what}`) : said
  }
  sentence(said: string | null, path: string): string | null {
    // A sentence ends at . ! or ? before a capital, a digit or a quote: a mark mid-sentence (an amber !) is no end.
    const count = said?.split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘'(])/).length ?? 1
    return count === 1 ? said : this.add(path, `one sentence, not ${count}`)
  }
}

/**
 * The decide tool's input as a decision (spec 171): every field checked, each argument's source against this session's
 * `messages` and the files as `read` returns them now, each picture through the picture module. Nothing is cut: every
 * failure comes back at once, named by its path, and the agent mends it in its own turn.
 */
export async function declared(input: Record<string, unknown>, messages: readonly SessionMessage[], read: ReadFile, shots?: Shots): Promise<Declared> {
  const no = new Refusals()
  const against: Against = { messages, read, ...(shots ? { shots } : {}), encoding: [] }
  const headline = no.text(input.headline, HEADLINE_WORDS, 'headline', 'the question the options answer')
  const ask = line(input.ask) === null ? no.add('ask', 'the question in one sentence') : no.sentence(line(input.ask), 'ask')
  const given = Array.isArray(input.options) ? input.options.map(line) : []
  const options = given.filter((one): one is string => one !== null)
  if (options.length !== given.length || options.length < 2 || options.length > 3 || new Set(options.map(one => one.toLowerCase())).size !== options.length) {
    no.add('options', 'two or three different labels')
  }
  const recommend = options.indexOf(line(input.recommend) ?? '')
  if (recommend < 0) no.add('recommend', 'one of options, exactly as written')
  if (no.all.length > 0) return { refused: no.all }

  const raw = Array.isArray(input.pages) ? input.pages.map(object) : []
  if (!Array.isArray(input.pages) || raw.some(one => one === null)) return { refused: ['pages: one {option, what, arguments, risk, whyNot} object per option'] }
  for (const page of raw) {
    const named = line(page!.option) ?? ''
    if (!options.some(option => sameOption(option, named))) no.add('pages', `"${named}" is not one of options`)
  }
  const pages: HumanQueueOptionPage[] = []
  for (const [i, option] of options.entries()) {
    const found = raw.filter(one => sameOption(line(one!.option) ?? '', option))
    if (found.length !== 1) no.add('pages', found.length === 0 ? `no page for "${option}"` : `${found.length} pages for "${option}", one only`)
    else {
      const page = await pageOf(found[0]!, `pages["${option}"]`, { options, i, recommend }, against, no)
      if (page !== null) pages.push(page)
    }
  }
  // Every shot cuts and encodes at once; each fills its argument's source, or its reasons follow the fields', in order.
  for (const reasons of await Promise.all(against.encoding)) no.all.push(...reasons)
  if (no.all.length > 0) return { refused: [...new Set(no.all)] }
  return { decision: { headline: headline!, ask: ask!, options, recommend, pages } }
}

/** One option's page, checked: null when any field of it is refused, each recorded at its path. */
async function pageOf(
  page: Record<string, unknown>,
  at: string,
  { options, i, recommend }: { options: readonly string[]; i: number; recommend: number },
  against: Against,
  no: Refusals,
): Promise<HumanQueueOptionPage | null> {
  const before = no.all.length
  const others = options.flatMap((label, j) => (j === i ? [] : [{ label, j }]))
  const otherIndex = (value: unknown) => others.find(one => sameOption(one.label, line(value) ?? ''))?.j ?? -1

  const what = no.sentence(no.text(page.what, WORDS.what, `${at}.what`, 'one sentence on what the option is'), `${at}.what`)
  const given = Array.isArray(page.arguments) ? page.arguments : []
  if (given.length < 1 || given.length > 4) no.add(`${at}.arguments`, '1 to 4 arguments, the strongest first')
  const argued: HumanQueueArgument[] = []
  for (const [n, one] of given.slice(0, 4).entries()) {
    const where = `${at}.arguments[${n}]`
    const argument = object(one)
    if (argument === null) {
      no.add(where, '{claim, rests, picture?}')
      continue
    }
    const claim = no.text(argument.claim, WORDS.claim, `${where}.claim`, 'the claim')
    const rests = await restsOf(argument.rests, `${where}.rests`, against, no)
    const kind = object(argument.rests)?.kind
    const seen = (claim?.toLowerCase().match(/[a-z]+/g) ?? []).filter(word => VISIBLE_WORDS.has(word))
    if (seen.length > 0 && KINDS.includes(kind as HumanQueueRests['kind']) && !SEEN_KINDS.includes(kind as HumanQueueRests['kind'])) {
      no.add(`${where}.rests`, `the claim is about what a person sees ("${seen[0]}"), so a ${String(kind)} cannot prove it: rest it on a shot of that surface, or the person's ruling`)
    }
    const drawn = argument.picture === undefined ? undefined : pictureOf(argument.picture, `${where}.picture`, no, claim)
    if (claim !== null && rests !== null && drawn !== null) argued.push({ claim, rests, ...(drawn === undefined ? {} : { picture: drawn }) })
  }
  const risk = no.text(page.risk, WORDS.risk, `${at}.risk`, 'what could go wrong')
  const fallback = page.fallback === undefined ? undefined : no.text(page.fallback, WORDS.fallback, `${at}.fallback`, 'what you would do then')
  const head = { what: what!, arguments: argued, risk: risk!, ...(fallback == null ? {} : { fallback }) }

  if (i !== recommend) {
    if (page.dependsOn !== undefined) no.add(`${at}.dependsOn`, 'only the recommended page says what the call depends on')
    const whyNot = no.text(page.whyNot, WORDS.whyNot, `${at}.whyNot`, 'one line on why this option was not recommended')
    return no.all.length > before ? null : { ...head, whyNot: whyNot! }
  }

  const depends = object(page.dependsOn)
  if (depends === null) no.add(`${at}.dependsOn`, 'the recommended page says what the call depends on, {on, otherwise, if}')
  const on = depends === null ? null : no.text(depends.on, WORDS.dependsOn.on, `${at}.dependsOn.on`, 'what the call hinges on')
  const when = depends === null ? null : no.text(depends.if, WORDS.dependsOn.if, `${at}.dependsOn.if`, 'when to choose the other option instead')
  const otherwise = depends === null ? -1 : otherIndex(depends.otherwise)
  if (depends !== null && otherwise < 0) no.add(`${at}.dependsOn.otherwise`, 'another of options, exactly as written')

  const lines = Array.isArray(page.whyNot) ? page.whyNot.map(object) : null
  if (lines === null || lines.some(one => one === null)) {
    no.add(`${at}.whyNot`, '[{option, line}], a line for each other option')
    return null
  }
  for (const one of lines) if (otherIndex(one!.option) < 0) no.add(`${at}.whyNot`, `"${line(one!.option) ?? ''}" is not another of options`)
  const whyNot = others.map(({ label, j }) => {
    const hits = lines.filter(one => sameOption(line(one!.option) ?? '', label))
    if (hits.length !== 1) return no.add(`${at}.whyNot`, `one line for "${label}"`)
    const said = no.text(hits[0]!.line, WORDS.whyNot, `${at}.whyNot["${label}"]`, `why not ${label}`)
    return said === null ? null : { option: j, line: said }
  })
  if (no.all.length > before) return null
  return { ...head, dependsOn: { on: on!, otherwise, if: when! }, whyNot: whyNot as { option: number; line: string }[] }
}

/** An argument's source, checked against the session; null, with the reason recorded, when it does not hold. */
async function restsOf(value: unknown, path: string, against: Against, no: Refusals): Promise<HumanQueueRests | null> {
  const given = object(value)
  const kind = KINDS.find(one => one === given?.kind)
  if (given === null || kind === undefined) return no.add(path, `{kind, ref?, excerpt?}, kind one of ${KINDS.join(', ')}`)
  const ref = line(given.ref)
  const excerpt = given.excerpt === undefined ? undefined : no.text(given.excerpt, WORDS.excerpt, `${path}.excerpt`, 'the words it rests on')
  if (excerpt === null) return null
  if (kind === 'shot') return shotOf(given, path, excerpt, against, no)
  const rests = { kind, ...(ref === null ? {} : { ref }), ...(excerpt === undefined ? {} : { excerpt }) }
  const held = await checkSource(rests, against.messages, against.read)
  if (!held.ok) return no.add(path, held.reason)
  // A read under the session's folder is stored relative to it, so the tag reads hooks/deck.ts:12, not a home path (the design review, round 5).
  const root = (against.shots?.cwd ?? '').replace(/\/+$/, '') + '/'
  return kind === 'read' && root !== '/' && rests.ref !== undefined && rests.ref.startsWith(root) ? { ...rests, ref: rests.ref.slice(root.length) } : rests
}

/**
 * A shot source (spec 176), checked against the session at once; its cut and encode start here and finish before
 * `declared` answers, filling `shot` on the source returned, or recording why not.
 */
function shotOf(given: Record<string, unknown>, path: string, excerpt: string | undefined, against: Against, no: Refusals): HumanQueueRests | null {
  if (against.shots === undefined) return no.add(path, 'a shot cannot be encoded here')
  const asked = shotAsk(given, path, against.shots.cwd)
  const wrong = 'refused' in asked ? asked.refused : unseenIn(asked.ask, against.messages, path)
  if ('refused' in asked || wrong.length > 0) {
    no.all.push(...wrong)
    return null
  }
  const rests: HumanQueueRests = { kind: 'shot', ref: asked.ask.file, ...(excerpt === undefined ? {} : { excerpt }) }
  against.encoding.push(against.shots.encode(asked.ask, path).then(out => {
    if ('refused' in out) return out.refused
    rests.shot = out.shot
    return []
  }))
  return rests
}

/** An argument's picture, checked by the picture module at its design width; null, with every reason recorded, when refused. */
function pictureOf(value: unknown, path: string, no: Refusals, claim: string | null): { html: string; height: number } | null {
  const given = object(value)
  if (given === null || typeof given.html !== 'string' || typeof given.height !== 'number') {
    return no.add(path, `{html, height}, an HTML fragment and its height in CSS pixels at ${DESIGN_WIDTH} wide`)
  }
  const spec = { html: given.html, height: given.height }
  // A picture that says its claim again shows nothing the claim does not (spec 176): most of its words are the claim's,
  // and too few are its own to carry where, which or how much.
  const words = contentWords(pictureText(spec.html))
  const claimed = claim === null ? new Map<string, string>() : contentWords(claim)
  const shared = [...words.keys()].filter(word => claimed.has(word))
  const restated = words.size > 0 && shared.length / words.size >= RESTATED_SHARE && words.size - shared.length < OWN_WORDS
  if (restated) no.add(path, `its text repeats its claim (${shared.map(word => words.get(word)).join(', ')}): draw what the claim cannot say (where, which, how much, how it is spread), or drop the picture`)
  const drawn = picture(spec, DESIGN_WIDTH)
  if (!('refused' in drawn)) return restated ? null : spec
  for (const reason of drawn.refused) no.add(path, reason)
  return null
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
