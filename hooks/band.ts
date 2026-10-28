// Source-backed observations for the band, separate from rendering and the reply row.
import { gh, GhError, isOwned, SHARED_FOR } from '../panes/human-queue/issues'
import type { Run } from '../panes/human-queue/issues'
import type { HumanQueueCountObservation } from '../types'

export type CountObservation = HumanQueueCountObservation
export const freshCount = (value: number, at: number): CountObservation => ({ value, at, stale: false })
export const staleCount = (held: CountObservation | null): CountObservation => ({ value: held?.value ?? null, at: held?.at ?? null, stale: true })

/** Unknown is not zero. An age belongs only to a failed refresh of a previously observed value. */
export function countLabel(name: 'waiting' | 'ready', held: CountObservation | null, now: number, local = 0): string {
  const value = held?.value === null || held === null ? '—' : String(held.value + local)
  return `${value} ${name}${ageOf(held, now)}`
}

const ageOf = (held: CountObservation | null, now: number) =>
  held?.stale && held.at !== null ? ` · ${Math.max(0, Math.floor((now - held.at) / 60_000))}m old` : ''

const countText = (held: CountObservation | null, extra = 0): string | null =>
  held === null || held.value === null ? null : String(held.value + extra)

/** How long a rise in the queue keeps the pill's leading number on the new asks. */
export const NEW_ASK_MS = 120_000

/**
 * The you pill while new asks are in the queue. The leading number is how many
 * arrived since `seen`, for `NEW_ASK_MS`, then the steady label returns.
 * The first count is the baseline: it is not a new ask.
 */
export function freshPill(steady: string, total: number | null, seen: number | null, since: number | null, now: number): { label: string; seen: number | null; since: number | null } {
  if (total === null) return { label: steady, seen, since }
  if (seen === null || total < seen) return { label: steady, seen: total, since: null }
  if (total === seen || (since !== null && now - since >= NEW_ASK_MS)) return { label: steady, seen: total, since: null }
  return { label: `${total - seen} (${total})`, seen, since: since ?? now }
}

/** The waiting count the you pill shows: GitHub's count plus this project's file. Unknown stays unknown. */
export function waitingTotal(waiting: CountObservation | null, local = 0): number | null {
  if (waiting === null || waiting.value === null) return null
  return waiting.value + local
}

/**
 * The agent pill. The stage (or the status that replaces it) and a spec's closed
 * sub-issues describe this issue; the count in parentheses is every ready ticket,
 * which is what the pill opens. With no stage, the count stands alone in parentheses.
 */
export function agentPill(stage: string | null, progress: { closed: number; total: number } | null, ready: CountObservation | null, now: number): string {
  const count = countText(ready) ?? '—'
  const fraction = progress !== null && progress.total > 0 ? `${progress.closed}/${progress.total}` : null
  const head = [stage, fraction].filter((part): part is string => part !== null && part !== '').join(' ')
  return `${head === '' ? `(${count})` : `${head} (${count})`}${ageOf(ready, now)}`
}

/**
 * The you pill. With an ask on the row, `2/3` is its place among this project's
 * asks. Parentheses add every project's count when that differs from this
 * project's. With no ask here, the project count stands alone. An unknown total
 * is `—`, never zero.
 */
export function youPill(place: number | null, project: number, waiting: CountObservation | null, now: number, local = 0): string {
  const age = ageOf(waiting, now)
  const all = countText(waiting, local)
  if (all === null) return `${place !== null && project > 0 ? `${place}/${project}` : '—'}${age}`
  const total = Number(all)
  const here = place !== null && project > 0 ? `${place}/${project}` : String(project)
  return `${total === project ? here : `${here} (${total})`}${age}`
}

const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new GhError('GitHub answered without an object')
  return value as Record<string, unknown>
}
const lines = (stdout: string): Record<string, unknown>[] => {
  try { return stdout.split('\n').filter(line => line.trim() !== '').map(line => object(JSON.parse(line))) }
  catch { throw new GhError('GitHub answered with malformed observations') }
}
const time = (value: unknown): number => {
  const at = typeof value === 'string' ? Date.parse(value) : NaN
  if (!Number.isFinite(at)) throw new GhError('GitHub observation has no valid timestamp')
  return at
}

export type SpecProgress = { closed: number; total: number; lastClosedAt: number | null }

/**
 * All native children. GitHub allows a parent 100, so one page of 100 holds
 * them all, read at one moment.
 * Closed-child counts are not a completion percentage.
 */
export async function readSpecProgress(run: Run, repo: string, number: number, owner: string): Promise<SpecProgress> {
  if (!isOwned(repo, owner)) throw new GhError('The band reads only the owner\'s repositories')
  const children = lines(await gh(run, ['api', `repos/${repo}/issues/${number}/sub_issues`, '-X', 'GET', '-f', 'per_page=100', '--paginate', '--cache', SHARED_FOR, '--jq', '.[] | {id, number, state, closed_at}']))
  const seen = new Set<number>()
  let closed = 0
  let lastClosedAt: number | null = null
  for (const child of children) {
    if (!Number.isInteger(child.id) || Number(child.id) <= 0 || !Number.isInteger(child.number) || Number(child.number) <= 0 || seen.has(Number(child.id)) || (child.state !== 'open' && child.state !== 'closed')) throw new GhError('GitHub answered with malformed sub-issues')
    seen.add(Number(child.id))
    if (child.state === 'closed') {
      closed += 1
      lastClosedAt = Math.max(lastClosedAt ?? 0, time(child.closed_at))
    }
  }
  return { closed, total: children.length, lastClosedAt }
}
