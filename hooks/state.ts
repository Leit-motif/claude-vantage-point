// The state line (issue 20): where this session stands in the workflow, for the agent.
// Pure: built from what the band already read (the branch and its ticket).
// It sits in the system prompt, so a change between turns re-caches the conversation:
// it holds only what changes rarely (branch, ticket, stage, status, parent spec),
// never counts that move with every merge (the frontier, a spec's closed children).
// register.tsx takes it once at the start of each turn.
import type { HumanQueueAgentBranch, HumanQueueAgentNext } from '../types'

export const STATE_SECTION = 'vantage-point:state'

export type StateInput = {
  branch: HumanQueueAgentBranch
  ticket: HumanQueueAgentNext
}

/**
 * The section's text, or null off a ticket or spec branch (and when git could
 * not be read): such a session gets no section at all, so its prompt does not change.
 */
export function stateLine({ branch, ticket }: StateInput): string | null {
  if (branch.state !== 'ticket' || branch.branch === null) return null
  const head = `Workflow state (read from git and GitHub): branch ${branch.branch}`
  // No key yet means the remote is unread (a session's first request) or not on GitHub: say nothing rather than guess.
  if (branch.key === null) return null
  if (ticket === null || ticket.key !== branch.key) return `${head} → ${branch.key} (could not be read).`
  const parts = [`${head} → ${ticket.key} "${ticket.title}"`]
  if (ticket.kind === 'spec') parts.push('a spec')
  parts.push(ticket.stage === null ? 'no stage' : `stage ${ticket.stage.toLowerCase()}`)
  if (ticket.status !== null && ticket.status !== 'Moving') parts.push(ticket.status.toLowerCase())
  if (ticket.parent !== null) parts.push(`spec ${ticket.parent}`)
  return `${parts.join(', ')}.`
}
