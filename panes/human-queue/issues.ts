// The gh side of asks filed as issues: finding the open ready-for-human issues
// across the owner's repositories, reading one, listing its comments, and the
// two writes an answer makes (one comment, one label removal). The owner is the
// signed-in gh account: signedInLogin reads it, and every call that needs one
// takes it. Every call goes through `run`, which the mod passes as
// `$.process.run`, so tests answer it from memory and nothing here touches the
// network or the disk itself. Who may write asks and answers, and when to send,
// are the mod's business; what an issue's text means is queue.ts's. Shared
// observation types live in types/.
import type { IssueSource } from './queue'
import { cardOf } from './mentions'
import type { TicketCard } from './mentions'
import type { HumanQueueAgentNext } from '../../types'

/** `$.process.run`'s shape: argv in, exit code and output back; rejects when the command cannot start. */
export type Run = (
  argv: readonly string[],
  init?: { env?: Record<string, string>; stdin?: string; timeoutMs?: number },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>

export const ASKS_LABEL = 'ready-for-human'
/** What an agent may pick up: open issues labelled this, across the owner's repositories. */
export const AGENT_LABEL = 'ready-for-agent'
export const BUILD_LABEL = 'stage:build'
/** GitHub's search returns at most this many results for one query. */
export const SEARCH_CEILING = 1000
/**
 * How long gh keeps a polled read in its cache, which every session on the
 * machine shares: just under a poll, so all of them together read GitHub
 * about once a poll however many are open.
 */
export const SHARED_FOR = '55s'

const ENV = { GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' }
const TIMEOUT_MS = 20_000
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/
const REPO_OF_URL = /^https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(?:issues|pull)\/\d+/i
const REPO_OF_API = /^https:\/\/api\.github\.com\/repos\/([\w.-]+\/[\w.-]+)$/i
const TARGET = /^([\w.-]+\/[\w.-]+)#(\d+)$/

const NOT_RUN = 'gh could not run'

/** gh missing, signed out, offline, or answering with something unreadable. */
export class GhError extends Error {}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Runs gh and resolves its standard output; a failure of any kind is a GhError. */
export async function gh(run: Run, args: readonly string[], init: { stdin?: string; timeoutMs?: number } = {}): Promise<string> {
  let ran: Awaited<ReturnType<Run>>
  try {
    ran = await run(['gh', ...args], { env: ENV, timeoutMs: TIMEOUT_MS, ...init })
  } catch (error) {
    throw new GhError(`${NOT_RUN} (${reason(error)})`)
  }
  if (ran.exitCode !== 0) {
    const said = ran.stderr.split('\n').map(line => line.trim()).find(line => line !== '')
    throw new GhError(said ?? `gh exited with ${ran.exitCode}`)
  }
  return ran.stdout
}

/** Whether `repo` (`owner/name`) belongs to `owner`, ignoring case as GitHub does. */
export function isOwned(repo: string, owner: string): boolean {
  return repo.split('/')[0]?.toLowerCase() === owner.toLowerCase()
}

/** Whether two logins are the same account, as GitHub compares them: ignoring case. */
export function sameLogin(a: string | null | undefined, b: string | null | undefined): boolean {
  return typeof a === 'string' && typeof b === 'string' && a !== '' && a.toLowerCase() === b.toLowerCase()
}

/**
 * The one search a poll makes: the owner's open issues carrying any of the
 * labels the band and the pane count (a comma is GitHub's "or"), every page,
 * through gh's shared cache. The REST path stays first: it names the budget.
 */
export function labelSearchArgs(owner: string): string[] {
  const q = `user:${owner} type:issue state:open label:${[ASKS_LABEL, AGENT_LABEL, BUILD_LABEL].join(',')}`
  return ['api', 'search/issues', '-X', 'GET', '-f', `q=${q}`, '-f', 'advanced_search=true', '-f', 'per_page=100', '--paginate', '--slurp', '--cache', SHARED_FOR]
}

export function viewArgs(repo: string, number: number): string[] {
  return ['issue', 'view', String(number), '--repo', repo, '--json', 'number,title,body,url,state,labels,createdAt,updatedAt,author,comments,parent']
}

/** The body is read from standard input (`--body-file -`), never `--body @-`, which posts a literal `@-`. */
export function commentArgs(repo: string, number: number): string[] {
  return ['issue', 'comment', String(number), '--repo', repo, '--body-file', '-']
}

export function unlabelArgs(repo: string, number: number): string[] {
  return ['issue', 'edit', String(number), '--repo', repo, '--remove-label', ASKS_LABEL]
}

/** Every comment on an issue, all pages, one JSON object per line. */
export function commentsArgs(repo: string, number: number): string[] {
  return ['api', `repos/${repo}/issues/${number}/comments`, '--paginate', '--jq', '.[] | {login: .user.login, url: .html_url, body: .body}']
}

export const LOGIN_ARGS = ['api', 'user', '--jq', '.login']

function json(stdout: string): unknown {
  try {
    return JSON.parse(stdout)
  } catch {
    throw new GhError('gh answered with something other than JSON')
  }
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** One search hit: which issue, and when it last changed. */
export type Found = { repo: string; number: number; updatedAt: string }

/**
 * One open issue the label search found, with the labels it carries,
 * lower-cased as GitHub's search matches them. Whether the hit says it is
 * open, its sub-issue counts and its GitHub issue type (null for none) are
 * absent when the hit's do not parse.
 */
export type Labelled = Found & { title: string; createdAt: string; labels: string[]; isOpen?: boolean; subIssues?: SubIssues; issueType?: string | null }

/** How many sub-issues an issue has, and how many of them GitHub counts completed. */
export type SubIssues = { total: number; completed: number }

/** The label search's hits, and whether they may be fewer than GitHub holds. */
export type LabelSearch = { hits: Labelled[]; isCapped: boolean }

/** GitHub's `sub_issues_summary`; null when it is missing or does not add up. */
export function subIssuesOf(summary: unknown): SubIssues | null {
  const { total, completed } = record(summary)
  return Number.isInteger(total) && Number(total) >= 0 && Number.isInteger(completed) && Number(completed) >= 0 && Number(completed) <= Number(total) ? { total: Number(total), completed: Number(completed) } : null
}

/**
 * An issue's GitHub type: its name, or null for none. GitHub leaves the field
 * out on a personal account's repositories, the issue read and the search
 * alike (seen 2026-10-17), so a missing type is none. Undefined when it does not parse.
 */
export function issueTypeOf(type: unknown): string | null | undefined {
  if (type === undefined || type === null) return null
  const { name } = record(type)
  return typeof name === 'string' && name.trim() !== '' ? name : undefined
}

/**
 * The pages of the label search, within the owner's repositories; any other
 * owner's are dropped. A malformed or duplicate hit means the counts are
 * unknown, not fewer issues.
 */
export function parseLabelSearch(stdout: string, owner: string): LabelSearch {
  const pages = json(stdout)
  if (!Array.isArray(pages) || pages.length === 0) throw new GhError('gh search answered with something other than pages of hits')
  const items = pages.flatMap(page => {
    const listed = record(page).items
    if (!Array.isArray(listed)) throw new GhError('gh search answered with a page without hits')
    return listed
  })
  const seen = new Set<string>()
  const hits = items.flatMap(item => {
    const one = record(item)
    const repo = REPO_OF_API.exec(text(one.repository_url))?.[1] ?? ''
    const number = Number(one.number)
    const labels = Array.isArray(one.labels) ? one.labels.map(label => text(record(label).name).toLowerCase()) : []
    if (repo === '' || !Number.isInteger(number) || number <= 0 || !Array.isArray(one.labels) || labels.includes('')) throw new GhError('gh search answered with a malformed hit')
    if (!isOwned(repo, owner)) return []
    const key = `${repo}#${number}`.toLowerCase()
    if (seen.has(key)) throw new GhError('gh search answered with a duplicate hit')
    seen.add(key)
    const isOpen = one.state === 'open' ? true : one.state === 'closed' ? false : undefined
    const subIssues = subIssuesOf(one.sub_issues_summary) ?? undefined
    return [{ repo, number, title: text(one.title), createdAt: text(one.created_at), updatedAt: text(one.updated_at), labels, isOpen, subIssues, issueType: issueTypeOf(one.type) }]
  })
  // Every page reports the total; a later, larger one still means hits went missing.
  const totals = pages.map(page => Number(record(page).total_count))
  const isIncomplete = pages.some(page => record(page).incomplete_results === true)
  return { hits, isCapped: isIncomplete || !totals.every(Number.isInteger) || Math.max(...totals) > items.length }
}

/** Runs the label search. */
export async function searchLabels(run: Run, owner: string): Promise<LabelSearch> {
  return parseLabelSearch(await gh(run, labelSearchArgs(owner)), owner)
}

/** The asks among the hits: issues labelled ready-for-human. */
export function asksOf(search: LabelSearch): Found[] {
  return search.hits.filter(hit => hit.labels.includes(ASKS_LABEL)).map(({ repo, number, updatedAt }) => ({ repo, number, updatedAt }))
}

/** An issue as `gh issue view --json` reports it, with whether it still waits on the owner. */
export type Viewed = IssueSource & { isOpen: boolean; isLabelled: boolean }

export function parseView(stdout: string, repo: string): Viewed {
  const issue = record(json(stdout))
  const number = Number(issue.number)
  if (!Number.isInteger(number)) throw new GhError('gh issue view answered without an issue number')
  const labels = Array.isArray(issue.labels) ? issue.labels.map(label => text(record(label).name)).filter(name => name !== '') : []
  const parent = record(issue.parent)
  const parentRepo = REPO_OF_URL.exec(text(parent.url))?.[1]
  const comments = Array.isArray(issue.comments) ? issue.comments.map(record) : []
  const author = text(record(issue.author).login)
  return {
    // GitHub's own spelling and number: after a transfer, where the issue lives now.
    repo: REPO_OF_URL.exec(text(issue.url))?.[1] ?? repo,
    number,
    title: text(issue.title),
    url: text(issue.url),
    body: text(issue.body),
    updatedAt: text(issue.updatedAt),
    createdAt: text(issue.createdAt) || null,
    author: author || null,
    labels,
    parent: parentRepo === undefined || !Number.isInteger(Number(parent.number)) ? null : { repo: parentRepo, number: Number(parent.number) },
    comments: comments.map(comment => ({ body: text(comment.body), author: text(record(comment.author).login) || null })),
    isOpen: text(issue.state).toUpperCase() === 'OPEN',
    isLabelled: labels.includes(ASKS_LABEL),
  }
}

/**
 * The opening of an issue body as one plain paragraph for a hover card: no
 * headings, fences, comments, list marks, emphasis or link targets, cut at a
 * word to `max` characters.
 */
export function gist(body: string, max = 240): string {
  const lines: string[] = []
  let inFence = false
  for (const raw of body.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence || line === '' || line.startsWith('#') || line.startsWith('|')) continue
    lines.push(line.replace(/^([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/, '').replace(/^>\s?/, ''))
  }
  const plain = lines
    .join(' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= max) return plain
  // Whole words up to max - 1 characters, room left for the ellipsis.
  let cut = ''
  for (const word of plain.split(' ')) {
    const next = cut === '' ? word : `${cut} ${word}`
    if (next.length > max - 1) break
    cut = next
  }
  if (cut === '') cut = plain.slice(0, max - 1)
  return `${cut.replace(/[\s,;:.\-–—]+$/, '')}…`
}

/** The ticket a session builds, read off its branch: `ticket/<n>-<slug>` or `spec/<n>-<slug>`. */
export function branchIssue(branch: string): { kind: 'ticket' | 'spec'; number: number } | null {
  const found = /^(ticket|spec)\/(\d+)(?:-|$)/.exec(branch.trim())
  return found === null ? null : { kind: found[1] as 'ticket' | 'spec', number: Number(found[2]) }
}

/** `owner/name` from an origin URL (https, ssh, or scp-like); null for anything not on github.com. */
export function repoOfRemote(remote: string | null): string | null {
  if (remote === null) return null
  const found = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(remote.trim())
  return found?.[1] ?? null
}

/** What the session's agent is building: its ticket's key, title and opening. */
export type SessionTicket = NonNullable<HumanQueueAgentNext>

export function ticketArgs(repo: string, number: number): string[] {
  return ['issue', 'view', String(number), '--repo', repo, '--json', 'number,title,body,url,state,labels,parent']
}

export function parseTicket(stdout: string, repo: string, kind: 'ticket' | 'spec'): SessionTicket {
  const issue = record(json(stdout))
  const number = Number(issue.number)
  if (!Number.isInteger(number)) throw new GhError('gh issue view answered without an issue number')
  if (!Array.isArray(issue.labels) || issue.labels.some(label => text(record(label).name) === '') || !['OPEN', 'CLOSED'].includes(text(issue.state).toUpperCase()) || text(issue.title).trim() === '' || text(issue.url) === '') throw new GhError('gh issue view answered with a malformed ticket observation')
  const labels = issue.labels.map(label => text(record(label).name))
  const stages = labels.filter(label => /^stage:(backlog|align|build|verify|ship)$/.test(label))
  const stage = stages.length === 1 ? stages[0]!.slice(6) : null
  const state = text(issue.state).toUpperCase()
  return {
    key: `${repo}#${number}`, kind, title: text(issue.title), gist: gist(text(issue.body)), url: text(issue.url),
    stage: stage === null ? null : stage[0]!.toUpperCase() + stage.slice(1),
    status: state === 'CLOSED' ? 'Done' : state !== 'OPEN' ? null : labels.includes(ASKS_LABEL) ? 'Waiting on you' : labels.includes('paused') ? 'Paused' : 'Moving',
    progress: null,
    parent: parentKey(issue.parent),
  }
}

/** `owner/name#n` from gh's `parent` field (its url); null when there is none or it is not a GitHub issue url. */
function parentKey(value: unknown): string | null {
  const found = /github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)/.exec(text(record(value).url))
  return found === null ? null : `${found[1]}#${found[2]}`
}

/** One issue ready for an agent, as the agent's zoomed-out pane lists it. */
export type ReadyIssue = { key: string; repo: string; number: number; title: string; createdAt: string }

/** The owner's ready-for-agent issues among the hits, oldest first. */
export function readyOf(search: LabelSearch): ReadyIssue[] {
  if (search.isCapped) throw new GhError('ready search reached GitHub\'s ceiling; the count is unknown')
  return search.hits
    .filter(hit => hit.labels.includes(AGENT_LABEL))
    .map(({ repo, number, title, createdAt }) => ({ key: `${repo}#${number}`, repo, number, title, createdAt }))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
}

/** A ticket as its pane shows it: the issue in full, with its newest comments. */
export type TicketPage = {
  key: string
  title: string
  url: string
  state: string
  labels: string[]
  body: string
  comments: { login: string; body: string }[]
}

export function ticketPageArgs(repo: string, number: number): string[] {
  return ['issue', 'view', String(number), '--repo', repo, '--json', 'number,title,body,url,state,labels,comments']
}

/** The page, its comments cut to the newest `keep`. */
export function parseTicketPage(stdout: string, repo: string, keep = 5): TicketPage {
  const issue = record(json(stdout))
  const number = Number(issue.number)
  if (!Number.isInteger(number)) throw new GhError('gh issue view answered without an issue number')
  const labels = Array.isArray(issue.labels) ? issue.labels.map(label => text(record(label).name)).filter(name => name !== '') : []
  const comments = (Array.isArray(issue.comments) ? issue.comments : [])
    .map(one => ({ login: text(record(record(one).author).login), body: text(record(one).body) }))
    .slice(-keep)
  return { key: `${repo}#${number}`, title: text(issue.title), url: text(issue.url), state: text(issue.state), labels, body: text(issue.body), comments }
}

/** One issue, read directly: its body, labels, parent and comments. Refused outside the owner's repositories. */
export async function viewAsk(run: Run, repo: string, number: number, owner: string): Promise<Viewed> {
  if (!isOwned(repo, owner)) throw new GhError(`${repo} is not one of ${owner}'s repositories`)
  const viewed = parseView(await gh(run, viewArgs(repo, number)), repo)
  if (!isOwned(viewed.repo, owner)) throw new GhError(`${repo}#${number} now lives outside ${owner}'s repositories (${viewed.repo})`)
  return viewed
}

export function cardArgs(repo: string, number: number): string[] {
  return ['issue', 'view', String(number), '--repo', repo, '--json', 'title,state,labels,body']
}

/** A ticket a reply mentions, as its card. Refused outside the owner's repositories, like every read here. */
export async function viewCard(run: Run, repo: string, number: number, owner: string): Promise<TicketCard> {
  if (!isOwned(repo, owner)) throw new GhError(`${repo} is not one of ${owner}'s repositories`)
  const card = cardOf(await gh(run, cardArgs(repo, number)))
  if (card === null) throw new GhError(`gh issue view answered with something other than ${repo}#${number}`)
  return card
}

/**
 * The login gh is signed in as: the only author whose asks and answers count,
 * and the owner whose repositories the queue reads. A failure tells the person
 * to sign in, since nothing is read without an owner.
 */
export async function signedInLogin(run: Run): Promise<string> {
  let said: string
  try {
    said = await gh(run, LOGIN_ARGS)
  } catch (error) {
    if (error instanceof GhError && error.message.startsWith(NOT_RUN)) throw error
    throw new GhError(`gh could not say who is signed in, so no issues are read; if it is signed out, sign in with \`gh auth login\` (${reason(error)})`)
  }
  const login = said.trim()
  if (!LOGIN.test(login)) throw new GhError('gh api user answered without a login')
  return login
}

/** A comment as `commentsArgs` lists it. */
export type Listed = { login: string; url: string; body: string }

export function parseComments(stdout: string): Listed[] {
  return stdout
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      const one = record(json(line))
      return { login: text(one.login), url: text(one.url), body: text(one.body) }
    })
}

export async function listComments(run: Run, repo: string, number: number): Promise<Listed[]> {
  return parseComments(await gh(run, commentsArgs(repo, number)))
}

/**
 * The URL of the comment that answers this submission: written by `login`,
 * carrying both its submission marker and its target marker. Null when there
 * is none, whatever else claims to be rulings.
 */
export function findAnswer(comments: readonly Listed[], submission: { id: string; target: string }, login: string): string | null {
  const id = `<!-- human-queue submission: ${submission.id} -->`
  const target = `<!-- human-queue target: ${submission.target} -->`
  const mine = comments.filter(c => sameLogin(c.login, login) && c.body.includes(id) && c.body.includes(target))
  return mine.at(-1)?.url ?? null
}

/** Posts one comment and resolves its URL as gh printed it, or null. Any failure is a GhError. */
export async function postComment(run: Run, repo: string, number: number, body: string): Promise<string | null> {
  const posted = await gh(run, commentArgs(repo, number), { stdin: body, timeoutMs: 30_000 })
  return posted.split('\n').map(line => line.trim()).find(line => /^https?:\/\//.test(line)) ?? null
}

export async function removeLabel(run: Run, repo: string, number: number): Promise<void> {
  await gh(run, unlabelArgs(repo, number))
}

export function parseTarget(target: string): { repo: string; number: number } | null {
  const match = TARGET.exec(target)
  return match === null ? null : { repo: match[1] as string, number: Number(match[2]) }
}
