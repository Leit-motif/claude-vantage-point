// Which reply the Reader reads: the final reply of the latest completed turn
// in the main conversation, as the linearizer's parts.

import type { ReplyPart } from './linearize.ts'

/** The fields the Reader reads of `$.session.messages()`'s rows. */
export type ReplyMessage = {
  role: 'user' | 'assistant'
  text: string
  toolUses?: readonly { tool: string }[]
  toolResults?: readonly unknown[]
}

/**
 * Calls that tell the person where the turn stands rather than do its work:
 * the desktop's end-of-turn box and task list, and the band's task line. Text
 * on either side of them is one reply.
 */
const REPORTING_TOOLS: ReadonlySet<string> = new Set(['mcp__ccd_turn__wrap_up', 'mcp__ccd_turn__update_plan', 'mcp__vantage-point__task'])

/**
 * The final reply of the latest turn that has one: the last stretch of text
 * the turn wrote between calls that did work, as the transcript shows it last.
 * Text before a later such call is narration of that work, not the reply, and
 * is left out. A user row that carries tool results is the agent's own loop,
 * not a prompt. While a turn runs its reply is not complete, so the reply
 * before it is the latest. A row that answers nothing (a slash command's
 * output, an interruption) leaves the reply before it the one to read. Tool
 * calls and their output are the agent's actions, not its reply, and are left
 * out. Null when no reply has text.
 */
export function latestReply(messages: readonly ReplyMessage[], isWorking: boolean): ReplyPart[] | null {
  // Each turn's text, split into runs at its calls that did work.
  const turns: ReplyPart[][][] = [[[]]]
  for (const message of messages) {
    const runs = turns[turns.length - 1]!
    if (message.role === 'user') {
      if ((message.toolResults?.length ?? 0) === 0) turns.push([[]])
      continue
    }
    if (message.text.trim() !== '') runs[runs.length - 1]!.push({ kind: 'text', text: message.text })
    if (message.toolUses?.some(use => !REPORTING_TOOLS.has(use.tool))) runs.push([])
  }
  if (isWorking) turns.pop()
  for (let i = turns.length - 1; i >= 0; i--) {
    const runs = turns[i]!
    for (let j = runs.length - 1; j >= 0; j--) {
      const run = runs[j]!
      if (run.length > 0) return run
    }
  }
  return null
}
