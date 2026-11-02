// The band's subagents row (issue #22): this session's subagents, kept after the
// engine drops them. Pure: the hooks in register.tsx feed it what `$.agent.list()`,
// `agent.spawn`, `turn.step` and `tool.call` report, and draw what it returns.
import type { HumanQueueBackground, HumanQueueChildSession, HumanQueueSubagent, HumanQueueSubagentMeta } from '../types'
import type { DesktopSession } from '../panes/caches/sessions'
import { commandName } from '../panes/band/command.ts'
import { shortTitle } from '../panes/band/title.ts'

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

/** `42s`, `1m05s`, and past an hour `21h34m`: a session started yesterday is not 1294 minutes old (issue 131). */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`
}

/** The open outline's marks (issue 131): the shape says what an entry is, its fill how it stands. */
export const SUBAGENT_SHAPE = '●'
export const TASK_SHAPE = '■'
export const SESSION_SHAPE = '◆'

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

// Background tasks (issue 126): the engine lists no shell or monitor for a mod, so the
// row keeps its own, from the call that backgrounded one to the notification that ends it.
export type Background = HumanQueueBackground

export const isRunning = (b: Background) => b.status === 'running'

/** The task a tool call's record says it left running in the background, or null. */
export function launched(tool: string, input: Record<string, unknown>, record: unknown, now: number): Background | null {
  const r = typeof record === 'object' && record !== null ? (record as Record<string, unknown>) : {}
  const id = [r.backgroundTaskId, r.taskId, r.task_id].find((v): v is string => typeof v === 'string' && v !== '')
  if (id === undefined) return null
  const command = typeof input.command === 'string' ? input.command : undefined
  const named = typeof input.description === 'string' && input.description !== '' ? input.description : command === undefined ? null : commandName(command)
  return { id, tool, description: named ?? tool, ...(command === undefined ? {} : { command }), status: 'running', startedAt: now }
}

/** Each task a delivery's `<task-notification>` reports ended, with how it ended. */
export function notified(text: string): { id: string; status: string }[] {
  return [...text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)].flatMap(([, body = '']) => {
    const id = /<task-id>([^<]+)<\/task-id>/.exec(body)?.[1]
    const status = /<status>([^<]+)<\/status>/.exec(body)?.[1]
    return id === undefined ? [] : [{ id, status: status ?? 'completed' }]
  })
}

/** The rows once these tasks ended; a task already ended keeps its first end. */
export const ended = (rows: readonly Background[], ends: readonly { id: string; status: string }[], now: number): Background[] =>
  rows.map(b => {
    const end = ends.find(e => e.id === b.id)
    return end === undefined || !isRunning(b) ? b : { ...b, status: end.status, endedAt: now }
  })

/** Running first, oldest first; then finished, newest first. */
export const orderedTasks = (rows: readonly Background[]): Background[] => [
  ...rows.filter(isRunning).sort((a, b) => a.startedAt - b.startedAt),
  ...rows.filter(b => !isRunning(b)).sort((a, b) => b.startedAt - a.startedAt),
]

/** A task's label in the outline: one line, as short as a subagent's. */
export const taskLabel = (b: Background) => shortTitle(b.description, 6, 32)

/** The dim line beside a task: `Bash · 42s`, and how it ended once it has. */
export const taskFacts = (b: Background, now: number) =>
  [b.tool, clock((b.endedAt ?? now) - b.startedAt), isRunning(b) ? '' : b.status].filter(Boolean).join(' · ')

// Child sessions (issue 129): a session this one started in the desktop is drawn with its
// subagents. The desktop's session file names its parent but cannot say whether a turn runs
// (a turn another session's message started looks idle there), so its transcript's tail decides.
export type ChildSession = HumanQueueChildSession

/** A turn unwritten this long reads idle: a session the app quit mid-turn never ends one. */
export const CHILD_STALE_MS = 10 * 60_000

/** Whether a transcript's tail ends inside a turn: after its last turn marker, no stop hooks' summary. Null with no marker. */
export function midTurn(tail: string): boolean | null {
  let open: boolean | null = null
  for (const line of tail.split('\n')) {
    let entry: unknown
    try { entry = JSON.parse(line) } catch { continue }
    if (typeof entry !== 'object' || entry === null) continue
    const { type, subtype } = entry as Record<string, unknown>
    if (type === 'system' && (subtype === 'stop_hook_summary' || subtype === 'turn_duration')) open = false
    else if (type === 'user' || type === 'assistant' || type === 'api-request') open = true
  }
  return open
}

/** The sessions the desktop session holding transcript `own` started; none when the desktop knows no such session. */
export function childrenOf(sessions: readonly DesktopSession[], own: string): DesktopSession[] {
  const me = sessions.find(s => s.cli === own && !s.archived) ?? sessions.find(s => s.cli === own)
  return me === undefined ? [] : sessions.filter(s => s.parent === me.local && s.local !== me.local)
}

/** One child as the row draws it, from its file and what its transcript said: `open` is midTurn's answer, undefined when unread. */
export function childOf(s: DesktopSession, seen: { title?: string; model?: string; touchedAt: number; open?: boolean | null } | undefined, now: number): ChildSession {
  const touchedAt = seen?.touchedAt ?? s.createdAt ?? 0
  const status = s.archived ? 'archived' : seen?.open === true && now - touchedAt < CHILD_STALE_MS ? 'running' : 'idle'
  const model = seen?.model ?? s.model
  return { local: s.local, title: s.title ?? seen?.title ?? s.local, ...(model === undefined ? {} : { model }), status, startedAt: s.createdAt ?? touchedAt, touchedAt }
}

export const isChildRunning = (c: ChildSession) => c.status === 'running'

/** Running first, oldest first; then the rest, the last written first. */
export const orderedChildren = (rows: readonly ChildSession[]): ChildSession[] => [
  ...rows.filter(isChildRunning).sort((a, b) => a.startedAt - b.startedAt),
  ...rows.filter(c => !isChildRunning(c)).sort((a, b) => b.touchedAt - a.touchedAt),
]

/** A child as the row's counts take it: running, or done once its turn ended. */
export const childCounted = (c: ChildSession) => ({ status: isChildRunning(c) ? 'running' : 'completed' })

/** The dim line beside a child: `session · opus-5-5 · 12m40s`, its age from its start, and `archived` once it is. */
export const childFacts = (c: ChildSession, now: number) =>
  ['session', c.model, clock((isChildRunning(c) ? now : c.touchedAt) - c.startedAt), c.status === 'archived' ? 'archived' : ''].filter(Boolean).join(' · ')
