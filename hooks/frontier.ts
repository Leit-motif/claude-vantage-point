// The frontier (issue 115): every open issue of this project, each placed in one state,
// so the pane can say what waits on the person, what is next, and count the rest.
// States come from one label map: Matt Pocock's triage labels (renamed by the repo's
// docs/agents/triage-labels.md when it has one), then agent-config's stage labels.
// Pure: the I/O is in register.tsx.

export type IssueState = 'waiting' | 'accepting' | 'active' | 'ready' | 'blocked' | 'shaping' | 'parked' | 'open'
export type FrontierItem = { number: number; title: string; state: IssueState }
/** Every open issue, oldest first, each with its state. */
export type Frontier = { items: FrontierItem[] }

/** How the pane names each state, in the order it counts what is left over. */
export const STATES: readonly { state: IssueState; name: string }[] = [
  { state: 'waiting', name: 'waiting on you' },
  { state: 'blocked', name: 'blocked' },
  { state: 'active', name: 'in progress' },
  { state: 'ready', name: 'ready' },
  { state: 'accepting', name: 'to accept' },
  { state: 'shaping', name: 'to shape' },
  { state: 'open', name: 'unlabelled' },
  { state: 'parked', name: 'parked' },
]

/** When an issue's labels and facts point at several states, the earliest here wins. */
const PRECEDENCE: readonly IssueState[] = ['parked', 'waiting', 'accepting', 'blocked', 'active', 'ready', 'shaping', 'open']

/** Matt Pocock's triage roles, by the label string his skills use. */
const TRIAGE: Readonly<Record<string, IssueState>> = {
  'needs-triage': 'shaping',
  'needs-info': 'shaping',
  'ready-for-agent': 'ready',
  'ready-for-human': 'waiting',
  wontfix: 'parked',
}

const OTHERS: Readonly<Record<string, IssueState>> = {
  'stage:backlog': 'parked',
  'stage:align': 'shaping',
  'stage:build': 'active',
  'stage:verify': 'accepting',
  'stage:ship': 'active',
  paused: 'parked',
  deferred: 'parked',
}

export type LabelMap = ReadonlyMap<string, IssueState>

/**
 * The label map: Matt's triage labels under the names `triageLabels` (the repo's
 * docs/agents/triage-labels.md) gives them, his own names otherwise, then the rest.
 */
export function labelMap(triageLabels: string | null): LabelMap {
  const map = new Map<string, IssueState>(Object.entries(OTHERS))
  for (const [role, state] of Object.entries(TRIAGE)) map.set(role, state)
  for (const line of (triageLabels ?? '').split('\n')) {
    const cells = /^\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/.exec(line)
    const state = cells === null ? undefined : TRIAGE[cells[1]!]
    if (state !== undefined) map.set(cells![2]!, state)
  }
  return map
}

/** One open issue of this repo, as the frontier needs it. */
export type RepoIssue = {
  number: number
  title: string
  labels: string[]
  assignees: number
  /** Open native blockers. */
  blockedBy: number
  createdAt: string
}

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
        createdAt: typeof one.created_at === 'string' ? one.created_at : '',
      })
    }
  }
  return out
}

/** An issue's state: an open blocker or an assignee counts beside its labels, and precedence settles a tie. */
export function stateOf(issue: RepoIssue, map: LabelMap): IssueState {
  const found = new Set<IssueState>(issue.labels.flatMap(label => map.get(label) ?? []))
  if (issue.blockedBy > 0) found.add('blocked')
  if (issue.assignees > 0) found.add('active')
  return PRECEDENCE.find(state => found.has(state)) ?? 'open'
}

export function frontierOf(issues: RepoIssue[], map: LabelMap): Frontier {
  const sorted = [...issues].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.number - b.number))
  return { items: sorted.map(i => ({ number: i.number, title: i.title, state: stateOf(i, map) })) }
}

export const NEXT_LIMIT = 3

/**
 * What the pane lists: every ask waiting on the person, everything blocked, then at most three
 * next (in progress first, then ready), then the rest, landed work to accept among it.
 */
export function viewOf(frontier: Frontier): { waiting: FrontierItem[]; blocked: FrontierItem[]; next: FrontierItem[]; rest: FrontierItem[] } {
  const waiting = frontier.items.filter(i => i.state === 'waiting')
  const blocked = frontier.items.filter(i => i.state === 'blocked')
  const next = [...frontier.items.filter(i => i.state === 'active'), ...frontier.items.filter(i => i.state === 'ready')].slice(0, NEXT_LIMIT)
  const shown = new Set([...waiting, ...blocked, ...next])
  return { waiting, blocked, next, rest: frontier.items.filter(i => !shown.has(i)) }
}

/** How many issues are ready for an agent: what the pill counts. */
export const readyCount = (frontier: Frontier): number => frontier.items.filter(i => i.state === 'ready').length

/** What is next for an idle agent: the first ready issue, or null (the row reads Idle). */
export function nextOf(frontier: Frontier): FrontierItem | null {
  return frontier.items.find(i => i.state === 'ready') ?? null
}
