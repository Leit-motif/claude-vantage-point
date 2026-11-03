// The to-do card's text (#147): what an issue labelled ready-for-human shows
// when it has nothing to rule on. It reads Matt Pocock's triage brief, the
// `## Agent Brief` his triage skill posts (its AGENT-BRIEF.md), never writes
// one: `**Summary:**`, the line saying why it cannot go to an agent, and the
// `**Acceptance criteria:**` checkboxes. The read is loose, so a change on his
// side makes the card plainer, never broken: a brief missing a field shows what
// it has, and an issue with none shows its body's opening. Pure, but for the
// card's two moves, which run gh through the runner they are handed.
import type { HumanQueueBrief, HumanQueueTodo } from '../../types'
import { closeArgs, gh, gist, handToAgent, reopenArgs, takeBackArgs, type Run } from './issues'
import type { Conventions } from './conventions'
import { contextGaps, plainText, type IssueSource, type Request } from './queue'

const BRIEF = /^##(?!#)[ \t]+agent brief[ \t]*#*[ \t]*$/i
/** An H1 or H2 heading ends the brief. */
const SECTION_END = /^#{1,2}(?!#)[ \t]+\S/
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/
/** `**Summary:** text` or `**Summary**: text`: a field's label and what follows it on the line. */
const FIELD = /^[ \t]*\*\*([^*\n]+?)\*\*[ \t]*:?[ \t]*(.*)$/
const CRITERION = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[([ xX])\][ \t]+)?(.*)$/
/** The field that says why it needs a person: Matt's template names no label, so any that speaks of delegating or a person. */
const REASON = /delegat|human|person|manual|why/i

/**
 * An issue with nothing that stands alone to rule on: no ### items, or items
 * that lean on what the card does not show. It draws as a to-do card, with
 * Hand to agent and Done in place of rulings.
 */
export function isTodo(request: Pick<Request, 'issue' | 'items' | 'body'>): boolean {
  return request.issue !== undefined && (request.items.length === 0 || contextGaps(request).length > 0)
}

/** How long the summary and the reason may run on the card. */
const LINE_MAX = 280

/** The lines under the first `## Agent Brief` heading outside a fence, up to the next `#` or `##` heading; null with none. */
export function briefSection(markdown: string): string | null {
  const lines = markdown.split('\n')
  let fence: string | null = null
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    const run = FENCE.exec(line)?.[1]
    if (fence !== null) {
      if (run !== undefined && run[0] === fence[0] && run.length >= fence.length) fence = null
      continue
    }
    if (run !== undefined) {
      fence = run
      continue
    }
    if (start < 0) {
      if (BRIEF.test(line)) start = i + 1
    } else if (SECTION_END.test(line)) {
      return lines.slice(start, i).join('\n')
    }
  }
  return start < 0 ? null : lines.slice(start).join('\n')
}

/** A brief's fields, read as loosely as they were written; null when it holds none the card draws. */
export function parseBrief(section: string): HumanQueueBrief | null {
  const fields: { label: string; lines: string[] }[] = []
  for (const line of section.split('\n')) {
    const field = FIELD.exec(line)
    if (field !== null) fields.push({ label: (field[1] as string).replace(/:$/, '').trim(), lines: [field[2] as string] })
    else fields.at(-1)?.lines.push(line)
  }
  const prose = (lines: string[]) => gist(lines.join('\n'), LINE_MAX)
  const summaryField = fields.find(one => /^summary$/i.test(one.label))
  const summary = summaryField === undefined ? '' : prose(summaryField.lines)
  const reasonField = fields.find(one => one !== summaryField && !/criteri/i.test(one.label) && REASON.test(one.label))
  const why = reasonField === undefined ? '' : prose(reasonField.lines)
  const criteria: HumanQueueBrief['criteria'] = []
  for (const line of fields.find(one => /criteri/i.test(one.label))?.lines ?? []) {
    const item = CRITERION.exec(line)
    const last = criteria.at(-1)
    if (item !== null && (item[2] as string).trim() !== '') criteria.push({ text: (item[2] as string).trim(), done: item[1] !== undefined && item[1] !== ' ' })
    // A criterion wrapped onto an indented line runs on.
    else if (last !== undefined && /^[ \t]+\S/.test(line)) last.text = `${last.text} ${line.trim()}`
  }
  const brief = {
    summary: summary === '' ? null : summary,
    reason: why === '' ? null : why[0]!.toUpperCase() + why.slice(1),
    criteria,
  }
  return brief.summary === null && brief.reason === null && criteria.length === 0 ? null : brief
}

/**
 * What an issue's to-do card draws: the newest brief from a trusted author, in
 * a comment whose author `trust.comments` names, or in the body when
 * `trust.body` says the issue's author is trusted (HumanQueueIssue.trusted);
 * else the body's opening, which only the person reads.
 */
export function todoOf(source: Pick<IssueSource, 'body' | 'comments'>, trust: { body: boolean; comments: (login: string) => boolean }): HumanQueueTodo {
  const body = plainText(source.body)
  const written = [...(trust.body ? [body] : []), ...source.comments.filter(one => one.author !== null && trust.comments(one.author)).map(one => plainText(one.body))]
  const brief =
    written
      .reverse()
      .map(text => briefSection(text))
      .filter((section): section is string => section !== null)
      .map(parseBrief)
      .find(one => one !== null) ?? null
  return { brief, opening: gist(body) }
}

/** What a to-do card's two presses do to its issue, and what their undo does. */
export type TodoMoves = Record<'handToAgent' | 'takeBack' | 'close' | 'reopen', (repo: string, number: number) => Promise<void>>

/**
 * The moves through gh, in the issue's repository's labels: Hand to agent swaps
 * its waiting label for its ready one, Done closes the issue, and each undo
 * moves it back. Any failure is a GhError.
 */
export function todoMoves(run: Run, conventions: Conventions): TodoMoves {
  return {
    handToAgent: (repo, number) => handToAgent(run, repo, number, conventions),
    takeBack: async (repo, number) => void (await gh(run, takeBackArgs(repo, number, conventions))),
    close: async (repo, number) => void (await gh(run, closeArgs(repo, number))),
    reopen: async (repo, number) => void (await gh(run, reopenArgs(repo, number))),
  }
}
