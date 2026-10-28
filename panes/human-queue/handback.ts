// Who takes a submit's rulings back (issue 66): the asking session, or a fresh agent beside it.
//
// Waking a session pays its whole cached prefix again once its cache is cold. A fresh agent
// pays its own context instead, so it is cheaper once the cold prefix passes what a fresh
// agent's context reaches by the end of a delegated task. `scripts/handback-threshold.mts`
// measures that from real transcripts; on 2026-10-17 it read 135k at the median and 190k at
// p75, steady across 14 and 60 days. The limit sits just past p75, leaning towards waking,
// since the asking session keeps everything it knew.
import type { Seen } from '../caches/caches'

export const WAKE_LIMIT = 200_000
/** A cache with less left than this may cool before the turn it starts reaches the model. */
export const WARM_MARGIN_MS = 30_000

export type Handback = { kind: 'wake' } | { kind: 'fresh'; prefix: number }

/** The session's own cache as it stands now; unknown keeps the old behaviour, a wake. */
export function handbackOf(own: Seen | undefined): Handback {
  if (own === undefined || own.left > WARM_MARGIN_MS || own.prefix <= WAKE_LIMIT) return { kind: 'wake' }
  return { kind: 'fresh', prefix: own.prefix }
}

/** What the fresh agent is told: the hand-back the session would have read, and whose work it is. */
export function freshBrief(handback: string): string {
  return [
    'You are picking up for a Claude Code session whose prompt cache went cold while a person ruled on its ask in the human queue.',
    'That session is not woken, so you are the one who acts on the rulings. You do not have its conversation: read the record named below',
    '(the issue and its comments, or the request in human-queue.md) and the repository for the context you need.',
    'Do the follow-up work the rulings unblock, as the asking agent would have, under the repository\'s own AGENTS.md. Where the rulings',
    'say no or leave the next step unclear, do not guess: write what you found where the ask lives (a comment on the issue) and stop.',
    'End with a short report of what you did.',
    '',
    handback,
  ].join('\n')
}

/** Whether a prompt is a fresh agent's report coming home to the session that spawned it. */
export function isHandbackOf(text: string, agentId: string): boolean {
  return text.startsWith(`<agent-message from="${agentId}">`)
}
