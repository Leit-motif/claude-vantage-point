// The agent's steps (issue 104): its task list, drawn in the band's agent card in place of the desktop's own.
//
// The desktop draws its list from each `update_plan` call as the model streamed it: the app's own
// handler keeps only the steps' statuses, never their words (desktop 3.6556.2). So the mod renames
// the call in the stream to a tool of its own, which forwards it to the app's: the app's reply and
// state stay exact, and the app has no `update_plan` block to draw. Pure: hooks/register.tsx keeps
// the steps and draws the card.
import type { HumanQueueStep } from '../types'

export type Step = HumanQueueStep

export const UPDATE_PLAN_TOOL = 'mcp__ccd_turn__update_plan'
export const STEPS_TOOL = 'mcp__vantage-point__steps'
const WRAP_UP_TOOL = 'mcp__ccd_turn__wrap_up'

/** The app keeps at most this many steps, each cut to this many characters. */
const MOST_STEPS = 12
const MOST_CHARS = 160
const SCOPES = new Set(['first_task', 'continuation', 'new_task'])

/** A whole step number counted from 1, as the app reads one. */
const isStep = (n: unknown, length: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= length
const isTrue = (value: unknown) => value === true || value === 'true'

/** A list's steps as the app keeps them: those with words, at most twelve, any other status pending. */
function stepsOf(items: readonly unknown[]): Step[] {
  const steps: Step[] = []
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue
    const { content, status } = item as Record<string, unknown>
    const text = typeof content === 'string' ? content.trim().slice(0, MOST_CHARS) : ''
    if (text === '') continue
    steps.push({ text, status: status === 'completed' || status === 'in_progress' ? status : 'pending' })
    if (steps.length >= MOST_STEPS) break
  }
  return steps
}

/**
 * One `update_plan` call applied to the steps, as the app applies it: a list replaces them, and
 * `done`, then `start`, then `advance` move them. A call the app would refuse changes nothing.
 */
export function applyCall(steps: readonly Step[], input: Record<string, unknown>): Step[] {
  if (Array.isArray(input.items)) {
    const listed = stepsOf(input.items)
    return SCOPES.has(String(input.scope)) && listed.length > 0 ? listed : [...steps]
  }
  const named = [...(Array.isArray(input.done) ? input.done : []), ...(input.start === undefined ? [] : [input.start])]
  if (steps.length === 0 || named.some(n => !isStep(n, steps.length))) return [...steps]
  const next = steps.map(step => ({ ...step }))
  for (const n of Array.isArray(input.done) ? input.done : []) next[(n as number) - 1]!.status = 'completed'
  if (isStep(input.start, next.length)) next[input.start - 1]!.status = 'in_progress'
  if (isTrue(input.advance)) {
    const current = next.findIndex(step => step.status === 'in_progress')
    if (current >= 0) next[current]!.status = 'completed'
    const after = next.findIndex((step, i) => i > current && step.status === 'pending')
    const following = after >= 0 ? after : next.findIndex(step => step.status === 'pending')
    if (following >= 0) next[following]!.status = 'in_progress'
  }
  return next
}

/** A wrap-up checks off every step, as the app's list does. */
export const finished = (steps: readonly Step[]): Step[] => steps.map(step => ({ ...step, status: 'completed' }))

/** The steps the conversation's calls leave, replayed in order: how a restarted session gets them back. */
export function stepsOfCalls(calls: readonly { tool: string; input: Record<string, unknown>; isError?: true }[]): Step[] {
  let steps: Step[] = []
  for (const call of calls) {
    if (call.isError === true) continue
    if (call.tool === STEPS_TOOL || call.tool === UPDATE_PLAN_TOOL) steps = applyCall(steps, call.input)
    else if (call.tool === WRAP_UP_TOOL) steps = finished(steps)
  }
  return steps
}

/** How many steps are done, of how many. */
export const doneOf = (steps: readonly Step[]) => `${steps.filter(step => step.status === 'completed').length}/${steps.length}`

/** The step the agent is on: the one in progress, else the next one pending; none when every step is done. */
export const currentOf = (steps: readonly Step[]): Step | undefined =>
  steps.find(step => step.status === 'in_progress') ?? steps.find(step => step.status === 'pending')

/**
 * The band as the desktop draws it, in points (desktop 3.6556.2, measured from shots, issue 104): about
 * 21.5 a row of `maxRows` (a 12-row band showed about 258); 40 a row with a pill and its gap; 76 for
 * the band's padding and the agent card's outline, first line and gaps; 19 a line of text; 19.75 a step.
 * The agent card and three rows with two steps measured 235.5, which this gives.
 */
const BAND_PT = { row: 21.5, pillRow: 40, card: 76, text: 19, step: 19.75 }

/**
 * How many step lines the agent card can hold beside what else the band shows (`pillRows` rows with
 * pills, `textLines` other lines of text), so it never pushes a row out of view; one at least.
 */
export function cardLines(maxRows: number, pillRows: number, textLines: number): number {
  const room = maxRows * BAND_PT.row - pillRows * BAND_PT.pillRow - textLines * BAND_PT.text - BAND_PT.card
  return Math.max(1, Math.floor(room / BAND_PT.step))
}

/** A line of the card's steps: a step, the done ones folded into a count, or the ones left past the room. */
export type StepLine = { kind: 'step'; step: Step } | { kind: 'done'; count: number } | { kind: 'more'; count: number }

/**
 * The steps as the card's `lines` hold them. All of them when they fit; else the done ones folded into
 * one line and every step left; else the steps left alone; else from the step the agent is on as many
 * as fit, the rest counted on the last line. A count never stands for one step: that step fits in its line.
 */
export function linesOf(steps: readonly Step[], lines: number): StepLine[] {
  if (steps.length <= lines) return steps.map(step => ({ kind: 'step', step }))
  const left = steps.filter(step => step.status !== 'completed')
  const done = steps.length - left.length
  const fold: StepLine[] = done === 0 ? [] : [{ kind: 'done', count: done }]
  const listed = (count: number) => left.slice(0, count).map(step => ({ kind: 'step' as const, step }))
  if (fold.length + left.length <= lines) return [...fold, ...listed(left.length)]
  if (left.length <= lines) return listed(left.length)
  // Past here more steps are left than lines, so the count below stands for two at least.
  const keep = lines - 1 - fold.length
  if (keep >= 1) return [...fold, ...listed(keep), { kind: 'more', count: left.length - keep }]
  if (lines >= 2) return [...listed(lines - 1), { kind: 'more', count: left.length - lines + 1 }]
  return listed(1)
}

/**
 * The model's stream with every `update_plan` call renamed to the mod's own tool before the app
 * sees it, so the app draws no list; the arguments stream on untouched. A rename keeps the call
 * in the transcript, where `stepsOfCalls` finds it again after a restart.
 */
export async function* renamedPlans<C extends { kind: string }, R>(stream: AsyncGenerator<C, R>): AsyncGenerator<C, R> {
  while (true) {
    const step = await stream.next()
    if (step.done) return step.value
    const chunk = step.value
    yield (chunk.kind === 'tool' && (chunk as unknown as { name?: unknown }).name === UPDATE_PLAN_TOOL ? { ...chunk, name: STEPS_TOOL } : chunk)
  }
}
