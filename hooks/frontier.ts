// The frontier: what is ready for an agent in this project, and what is not and why.
// It is agent-config's spec-frontier.mjs read as JSON when that script is set and a
// spec is in flight, else this repo's issue labels. Pure: the I/O is in register.tsx.

export type FrontierItem = { number: number; title: string }
export type FrontierGroup = 'ready' | 'ownerOnly' | 'claimed' | 'blocked' | 'paused' | 'refused'
export type Frontier = { source: 'script' | 'labels'; spec: number | null } & Record<FrontierGroup, FrontierItem[]>

/** The groups in the order the pane shows them, with the names spec-frontier.mjs prints. */
export const GROUPS: readonly { key: FrontierGroup; name: string }[] = [
  { key: 'ready', name: 'Ready' },
  { key: 'ownerOnly', name: 'Waiting on you' },
  { key: 'claimed', name: 'Claimed' },
  { key: 'blocked', name: 'Blocked' },
  { key: 'paused', name: 'Paused' },
  { key: 'refused', name: 'Refused' },
]

/** One open issue of this repo, as the frontier needs it. */
export type RepoIssue = {
  number: number
  title: string
  labels: string[]
  assignees: number
  /** Open native blockers. */
  blockedBy: number
  subIssues: number
  createdAt: string
}

const AGENT = 'ready-for-agent'
const HUMAN = 'ready-for-human'
const PAUSED = 'paused'
const BUILD = 'stage:build'

const record = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/** `gh api repos/<repo>/issues?state=open` pages, pull requests left out. Throws on a non-list. */
export function parseRepoIssues(stdout: string): RepoIssue[] {
  const raw: unknown = JSON.parse(stdout)
  // `gh api --paginate --slurp` gives a list of pages; a single page is a list of issues.
  const pages = Array.isArray(raw) && raw.every(Array.isArray) ? raw as unknown[][] : [raw]
  const out: RepoIssue[] = []
  for (const page of pages) {
    if (!Array.isArray(page)) throw new Error('the issues read was not a list')
    for (const v of page) {
      const one = record(v)
      if (one.pull_request !== undefined || typeof one.number !== 'number') continue
      out.push({
        number: one.number,
        title: typeof one.title === 'string' ? one.title : '',
        labels: Array.isArray(one.labels) ? one.labels.map(l => String(record(l).name ?? '')).filter(Boolean) : [],
        assignees: Array.isArray(one.assignees) ? one.assignees.length : 0,
        blockedBy: count(record(one.issue_dependencies_summary).blocked_by),
        subIssues: count(record(one.sub_issues_summary).total),
        createdAt: typeof one.created_at === 'string' ? one.created_at : '',
      })
    }
  }
  return out
}

/** The spec in flight: the lowest open issue in Build that has sub-issues; null when none. */
export function inFlightSpec(issues: RepoIssue[]): number | null {
  const specs = issues.filter(i => i.labels.includes(BUILD) && i.subIssues > 0).map(i => i.number).sort((a, b) => a - b)
  return specs[0] ?? null
}

const empty = (source: Frontier['source'], spec: number | null): Frontier =>
  ({ source, spec, ready: [], ownerOnly: [], claimed: [], blocked: [], paused: [], refused: [] })

/** The frontier from labels alone, for a setup without the script: oldest first in every group. */
export function fromLabels(issues: RepoIssue[]): Frontier {
  const out = empty('labels', null)
  const item = (i: RepoIssue): FrontierItem => ({ number: i.number, title: i.title })
  for (const i of [...issues].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.number - b.number))) {
    if (i.labels.includes(PAUSED)) out.paused.push(item(i))
    else if (i.labels.includes(HUMAN)) out.ownerOnly.push(item(i))
    else if (!i.labels.includes(AGENT)) continue
    else if (i.blockedBy > 0) out.blocked.push(item(i))
    else if (i.assignees > 0) out.claimed.push(item(i))
    else out.ready.push(item(i))
  }
  return out
}

/** spec-frontier.mjs --json for `spec`: its two ready lists become one, committing first. Throws on a shape it does not print. */
export function fromScript(stdout: string, spec: number): Frontier {
  const raw = record(JSON.parse(stdout))
  const list = (key: string): FrontierItem[] => {
    const v = raw[key]
    if (!Array.isArray(v)) throw new Error(`spec-frontier printed no ${key} list`)
    return v.map(t => record(t)).filter(t => typeof t.number === 'number').map(t => ({ number: t.number as number, title: typeof t.title === 'string' ? t.title : '' }))
  }
  return {
    source: 'script',
    spec,
    ready: [...list('readyCommitting'), ...list('readyNonCommitting')],
    ownerOnly: list('ownerOnly'),
    claimed: list('claimed'),
    blocked: list('blocked'),
    paused: list('paused'),
    refused: list('refused'),
  }
}

/** What is next: the first ready item, or null when nothing is ready (the row reads Idle). */
export function nextOf(frontier: Frontier): FrontierItem | null {
  return frontier.ready[0] ?? null
}
