// The band's subagents row (issue #22): this session's subagents, kept after the
// engine drops them. Pure: the hooks in register.tsx feed it what `$.agent.list()`,
// `agent.spawn`, `turn.step` and `tool.call` report, and draw what it returns.
import type { HumanQueueSubagent, HumanQueueSubagentMeta } from '../types'

export type Subagent = HumanQueueSubagent
export type SubagentMeta = HumanQueueSubagentMeta

/** What one `$.agent.list()` entry carries that the row needs. */
export type Listed = { id: string; description: string; type: string; status: string; parentId?: string }

/** Statuses of a loop that has not ended. */
export const LIVE = new Set(['pending', 'running', 'waiting', 'idle'])

/** The band shows this many subagents open; the rest are counted. */
export const ROOM = 8

/** A tool call this long reads as waiting on that tool. */
export const STALL_MS = 30_000

export const isLive = (s: Subagent) => LIVE.has(s.status)
export const isFailed = (s: Subagent) => s.status === 'failed' || s.status === 'killed'

/**
 * The rows after one read of the engine's list: what it lists, as it lists it,
 * and every row it has dropped kept, a live one marked completed, since the
 * engine drops a subagent's task seconds after it ends.
 */
export function mergeListed(prev: readonly Subagent[], listed: readonly Listed[]): { rows: Subagent[]; dropped: string[] } {
  const seen = new Set(listed.map(a => a.id))
  const kept = prev.filter(r => !seen.has(r.id))
  const rows = [
    ...kept.map(r => (isLive(r) ? { ...r, status: 'completed' } : r)),
    ...listed.map(a => ({
      id: a.id,
      description: a.description,
      type: a.type,
      status: a.status,
      ...(a.parentId === undefined ? {} : { parentId: a.parentId }),
    })),
  ]
  return { rows, dropped: kept.filter(isLive).map(r => r.id) }
}

/** `1 running · 3 done · 1 failed`, each part only when it has any. */
export function counts(rows: readonly Subagent[]): string {
  const running = rows.filter(isLive).length
  const done = rows.filter(r => r.status === 'completed').length
  const failed = rows.filter(isFailed).length
  return [running && `${running} running`, done && `${done} done`, failed && `${failed} failed`].filter(Boolean).join(' · ')
}

/** Running first, oldest first; then finished, newest first. */
export function ordered(rows: readonly Subagent[], meta: Readonly<Record<string, SubagentMeta>>): Subagent[] {
  const started = (s: Subagent) => meta[s.id]?.startedAt ?? 0
  const live = rows.filter(isLive).sort((a, b) => started(a) - started(b))
  const ended = rows.filter(r => !isLive(r)).sort((a, b) => started(b) - started(a))
  return [...live, ...ended]
}

/** `42s`, `1m05s`. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

/** `840`, `61k`. */
export const kTokens = (n: number) => (n < 1000 ? `${n}` : `${Math.round(n / 1000)}k`)

export const elapsed = (m: SubagentMeta | undefined, now: number) => (m === undefined ? '—' : clock((m.endedAt ?? now) - m.startedAt))

/** The model without its `claude-` prefix, or the agent type when no model is known. */
export const modelOf = (s: Subagent, m: SubagentMeta | undefined) => m?.model?.replace(/^claude-/, '') ?? s.type

/** `waiting on Bash 1m40s` once one tool call has run past STALL_MS; '' otherwise. */
export function waitingOn(m: SubagentMeta | undefined, now: number): string {
  if (m?.tool === undefined || m.toolAt === undefined || m.endedAt !== undefined) return ''
  return now - m.toolAt > STALL_MS ? `waiting on ${m.tool} ${clock(now - m.toolAt)}` : ''
}

/** The dim line beside a row: `haiku-5-5 · 42s · 397 out`. */
export const rowFacts = (s: Subagent, m: SubagentMeta | undefined, now: number) =>
  `${modelOf(s, m)} · ${elapsed(m, now)} · ${kTokens(m?.outTokens ?? 0)} out`

/** The open row's detail: what it was spawned as, where it stands, what it is doing. */
export function detail(s: Subagent, m: SubagentMeta | undefined, now: number): [string, string] {
  const doing = m?.tool !== undefined ? `now: ${m.tool} for ${clock(now - (m.toolAt ?? now))}` : isLive(s) ? 'now: thinking' : 'finished'
  return [`${s.type}${m?.effort === undefined ? '' : ` @${m.effort}`} · ${s.status} · context ${kTokens(m?.context ?? 0)}`, doing]
}

/** A fresh record for a subagent first seen at `now`. */
export const freshMeta = (now: number): SubagentMeta => ({ startedAt: now, outTokens: 0, context: 0 })
