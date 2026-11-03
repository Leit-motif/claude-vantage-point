// The gh side of asks filed as issues: finding the open ready-for-human issues
// across the owner's repositories, reading one, listing its comments, the two
// writes an answer makes (one comment, one label removal), and the edit that
// hands an issue to an agent. Each repository's conventions are
// conventions.ts's; resolveConventions reads one repository's through gh on
// demand. The owner is the
// signed-in gh account: signedInLogin reads it, and every call that needs one
// takes it. Every call goes through `run`, which the mod passes as
// `$.process.run`, so tests answer it from memory and nothing here touches the
// network or the disk itself. Who may write asks and answers, and when to send,
// are the mod's business; what an issue's text means is queue.ts's. Shared
// observation types live in types/.
import { afterRefusedSwap, labelMove } from './queue'
import type { IssueSource, LabelMove } from './queue'
import { cardOf } from './mentions'
import type { TicketCard } from './mentions'
import type { HumanQueueAgentNext } from '../../types'
import { carries, conventionsIn, conventionsOf, DEFAULTS, isFresh, isPaused, readRecord, recordOf, stageOf } from './conventions'
import type { Conventions, Known, RepoRecord, Resolved } from './conventions'

/** `$.process.run`'s shape: argv in, exit code and output back; rejects when the command cannot start. */
export type Run = (
  argv: readonly string[],
  init?: { env?: Record<string, string>; stdin?: string; timeoutMs?: number },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>

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

/** GitHub's longest search query, in characters. */
export const QUERY_MAX = 256
/** The most OR operators GitHub takes in one query; each repository whose labels are renamed costs one. */
export const QUERY_OR_MAX = 5

/** The label search, and the conventions that read its hits: those of the repositories it could scope. */
export type SearchPlan = { args: string[]; known: Known }

/**
 * Labels as a query writes them: lower-cased, once each, sorted, a name with a space quoted.
 * Only a name of letters, digits, spaces and `. _ - : /` goes in: any other (a `)`, a quote, a
 * comma) could break the one search every session shares, so it is left out and its issues go unseen.
 */
function labelList(names: readonly string[]): string[] {
  return [...new Set(names.map(name => name.toLowerCase()))]
    .filter(name => /^[\p{L}\p{N} ._:/-]+$/u.test(name))
    .sort()
    .map(name => (name.includes(' ') ? `"${name}"` : name))
}

/**
 * The one search a poll makes: the owner's open issues carrying any of the
 * labels the band and the pane count (a comma is GitHub's "or"), every page,
 * through gh's shared cache. The waiting and ready labels of the defaults and
 * the person's file are asked of every repository; a recorded repository's
 * other names only of that repository, `(repo:owner/name label:…)`, so a
 * rename to a common label such as `bug` cannot flood the search. GitHub takes
 * at most QUERY_MAX characters and QUERY_OR_MAX ORs: the most recently read
 * repositories are scoped while they fit, and the rest are read by the
 * person's names, so their renamed labels go unseen, never misread. Every
 * session reading one store builds the same query, which gh's cache answers
 * once. The REST path stays first: it names the budget.
 */
export function searchPlan(owner: string, known: Known): SearchPlan {
  const shared = labelList([DEFAULTS, known.fallback].flatMap(one => [one.roles.waiting, one.roles.ready]))
  const base = `user:${owner} type:issue state:open`
  const scoped: string[] = []
  const repos = new Map<string, Conventions>()
  for (const [repo, conventions] of known.repos) {
    const own = labelList([conventions.roles.waiting, conventions.roles.ready]).filter(name => !shared.includes(name))
    if (own.length === 0) {
      repos.set(repo, conventions)
      continue
    }
    if (!isOwned(repo, owner) || scoped.length === QUERY_OR_MAX) continue
    const group = `(repo:${repo} label:${own.join(',')})`
    if (`${base} (label:${shared.join(',')} OR ${[...scoped, group].sort().join(' OR ')})`.length > QUERY_MAX) continue
    scoped.push(group)
    repos.set(repo, conventions)
  }
  const q = scoped.length === 0 ? `${base} label:${shared.join(',')}` : `${base} (label:${shared.join(',')} OR ${scoped.sort().join(' OR ')})`
  return {
    args: ['api', 'search/issues', '-X', 'GET', '-f', `q=${q}`, '-f', 'advanced_search=true', '-f', 'per_page=100', '--paginate', '--slurp', '--cache', SHARED_FOR],
    known: { repos, fallback: known.fallback },
  }
}

/**
 * The oldest gh whose `gh issue view --json` takes `parent`, which `viewArgs` and `ticketArgs` ask for:
 * cli/cli v2.94.0 added it with sub-issues (PR 13057, "Issues 2.0"); v2.93.0 has neither.
 */
export const GH_MIN = '2.94.0'

/** The `X.Y.Z` that `gh --version` prints (`gh version 2.101.0 (2026-09-15)`); null for anything else, a pre-release (`2.94.0-rc1`) among it. */
export function parseGhVersion(stdout: string): string | null {
  const found = /^gh version (\d+\.\d+\.\d+)(?=\s|$)/m.exec(stdout)
  return found?.[1] ?? null
}

/** Whether a gh version reads `parent`: unreadable is `unknown`, never `met`, and so is none at all (a setup stored before the version was read). */
export function ghVersionState(found: string | null | undefined): 'met' | 'old' | 'unknown' {
  const have = typeof found === 'string' ? found.split('.').map(Number) : []
  if (have.length !== 3 || have.some(part => !Number.isInteger(part))) return 'unknown'
  const [major = 0, minor = 0, patch = 0] = have
  const [needMajor = 0, needMinor = 0, needPatch = 0] = GH_MIN.split('.').map(Number)
  const order = major - needMajor || minor - needMinor || patch - needPatch
  return order >= 0 ? 'met' : 'old'
}

/** The gh on this machine, or null when it answers with something else; a gh that cannot run is a GhError. */
export async function installedGhVersion(run: Run): Promise<string | null> {
  return parseGhVersion(await gh(run, ['--version']))
}

export function viewArgs(repo: string, number: number): string[] {
  return ['issue', 'view', String(number), '--repo', repo, '--json', 'number,title,body,url,state,labels,createdAt,updatedAt,author,comments,parent']
}

/** The body is read from standard input (`--body-file -`), never `--body @-`, which posts a literal `@-`. */
export function commentArgs(repo: string, number: number): string[] {
  return ['issue', 'comment', String(number), '--repo', repo, '--body-file', '-']
}

/** Takes the repository's waiting label off. */
export function unlabelArgs(repo: string, number: number, conventions: Conventions): string[] {
  return ['issue', 'edit', String(number), '--repo', repo, '--remove-label', conventions.roles.waiting]
}

/** Hands an issue to an agent in one edit: the repository's ready label on, its waiting label off. */
export function handToAgentArgs(repo: string, number: number, conventions: Conventions): string[] {
  return ['issue', 'edit', String(number), '--repo', repo, '--add-label', conventions.roles.ready, '--remove-label', conventions.roles.waiting]
}

/** Takes an issue back from the agents, undoing a to-do card's Hand to agent (#147): the waiting label on, the ready label off. */
export function takeBackArgs(repo: string, number: number, conventions: Conventions): string[] {
  return ['issue', 'edit', String(number), '--repo', repo, '--add-label', conventions.roles.waiting, '--remove-label', conventions.roles.ready]
}

/** The two files a repository's conventions are read from, by their place in it. */
export const CONVENTION_FILES = { repoFile: '.claude/vantage-point.json', triageFile: 'docs/agents/triage-labels.md' } as const

/** One file of a repository as its raw text. */
export function rawFileArgs(repo: string, path: string): string[] {
  return ['api', `repos/${repo}/contents/${path}`, '-H', 'Accept: application/vnd.github.raw+json']
}

export function closeArgs(repo: string, number: number): string[] {
  return ['issue', 'close', String(number), '--repo', repo]
}

export function reopenArgs(repo: string, number: number): string[] {
  return ['issue', 'reopen', String(number), '--repo', repo]
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

/** The label search's hits, whether they may be fewer than GitHub holds, and the conventions it searched by, which read its hits. */
export type LabelSearch = { hits: Labelled[]; isCapped: boolean; known: Known }

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
export function parseLabelSearch(stdout: string, owner: string, known: Known): LabelSearch {
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
  return { hits, isCapped: isIncomplete || !totals.every(Number.isInteger) || Math.max(...totals) > items.length, known }
}

/** Runs the label search `known` plans, and reads its hits by the conventions it could scope. */
export async function searchLabels(run: Run, owner: string, known: Known): Promise<LabelSearch> {
  const plan = searchPlan(owner, known)
  return parseLabelSearch(await gh(run, plan.args), owner, plan.known)
}

/** Whether a hit carries `role`'s label in its own repository, which keeps its issues on GitHub. */
function isRole(search: LabelSearch, hit: Labelled, role: 'waiting' | 'ready'): boolean {
  const conventions = conventionsIn(search.known, hit.repo)
  return conventions.tracker === 'github' && carries(hit.labels, conventions.roles[role])
}

/** The asks among the hits: issues carrying their repository's waiting label. */
export function asksOf(search: LabelSearch): Found[] {
  return search.hits
    .filter(hit => isRole(search, hit, 'waiting'))
    .map(({ repo, number, updatedAt }) => ({ repo, number, updatedAt }))
}

/** An issue as `gh issue view --json` reports it, with whether it still waits on the owner: whether it carries its repository's waiting label. */
export type Viewed = IssueSource & { isOpen: boolean; isLabelled: boolean }

/** The issue read by `conventions`: its waiting label, and which parent links they name (issueAsk reads a trusted body's `Part of` line). */
export function parseView(stdout: string, repo: string, conventions: Conventions): Viewed {
  const issue = record(json(stdout))
  const number = Number(issue.number)
  if (!Number.isInteger(number)) throw new GhError('gh issue view answered without an issue number')
  const labels = Array.isArray(issue.labels) ? issue.labels.map(label => text(record(label).name)).filter(name => name !== '') : []
  const native = record(issue.parent)
  const nativeRepo = REPO_OF_URL.exec(text(native.url))?.[1]
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
    parent: conventions.parent.includes('native') && nativeRepo !== undefined && Number.isInteger(Number(native.number)) ? { repo: nativeRepo, number: Number(native.number) } : null,
    readsPartOf: conventions.parent.includes('part-of'),
    comments: comments.map(comment => ({ body: text(comment.body), author: text(record(comment.author).login) || null })),
    isOpen: text(issue.state).toUpperCase() === 'OPEN',
    isLabelled: carries(labels, conventions.roles.waiting),
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

/** `owner/name` from an origin URL (https, ssh, or scp-like); null for anything not on github.com. */
export function repoOfRemote(remote: string | null): string | null {
  if (remote === null) return null
  const found = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(remote.trim())
  return found?.[1] ?? null
}

/** What the session's agent is building: its ticket's key, title and opening. */
export type SessionTicket = NonNullable<HumanQueueAgentNext>

export function ticketArgs(repo: string, number: number): string[] {
  return ['issue', 'view', String(number), '--repo', repo, '--json', 'number,title,body,url,state,labels,parent,author']
}

/** The ticket read by `conventions`: its stage, whether it waits on the person or is set aside, and whether `owner` opened it. */
export function parseTicket(stdout: string, repo: string, kind: 'ticket' | 'spec', conventions: Conventions, owner: string): SessionTicket {
  const issue = record(json(stdout))
  const number = Number(issue.number)
  if (!Number.isInteger(number)) throw new GhError('gh issue view answered without an issue number')
  if (!Array.isArray(issue.labels) || issue.labels.some(label => text(record(label).name) === '') || !['OPEN', 'CLOSED'].includes(text(issue.state).toUpperCase()) || text(issue.title).trim() === '' || text(issue.url) === '') throw new GhError('gh issue view answered with a malformed ticket observation')
  const labels = issue.labels.map(label => text(record(label).name))
  const state = text(issue.state).toUpperCase()
  return {
    key: `${repo}#${number}`, kind, title: text(issue.title), gist: gist(text(issue.body)), url: text(issue.url),
    stage: stageOf(labels, conventions),
    status: state === 'CLOSED' ? 'Done' : state !== 'OPEN' ? null : carries(labels, conventions.roles.waiting) ? 'Waiting on you' : isPaused(labels, conventions) ? 'Paused' : 'Moving',
    progress: null,
    parent: parentKey(issue.parent),
    isTrusted: sameLogin(text(record(issue.author).login), owner),
  }
}

/** `owner/name#n` from gh's `parent` field (its url); null when there is none or it is not a GitHub issue url. */
function parentKey(value: unknown): string | null {
  const found = /github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)/.exec(text(record(value).url))
  return found === null ? null : `${found[1]}#${found[2]}`
}

/** One issue ready for an agent, as the agent's zoomed-out pane lists it. */
export type ReadyIssue = { key: string; repo: string; number: number; title: string; createdAt: string }

/** The owner's issues carrying their repository's ready label among the hits, oldest first. */
export function readyOf(search: LabelSearch): ReadyIssue[] {
  if (search.isCapped) throw new GhError('ready search reached GitHub\'s ceiling; the count is unknown')
  return search.hits
    .filter(hit => isRole(search, hit, 'ready'))
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

/** One issue, read directly and by `conventions`: its body, labels, parent and comments. Refused outside the owner's repositories. */
export async function viewAsk(run: Run, repo: string, number: number, owner: string, conventions: Conventions): Promise<Viewed> {
  if (!isOwned(repo, owner)) throw new GhError(`${repo} is not one of ${owner}'s repositories`)
  const viewed = parseView(await gh(run, viewArgs(repo, number)), repo, conventions)
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

export async function removeLabel(run: Run, repo: string, number: number, conventions: Conventions): Promise<void> {
  await gh(run, unlabelArgs(repo, number, conventions))
}

export async function handToAgent(run: Run, repo: string, number: number, conventions: Conventions): Promise<void> {
  await gh(run, handToAgentArgs(repo, number, conventions))
}

/**
 * What a submit does to the waiting label, by the repository's `afterRulings`: one swap to
 * its ready label, or one removal. A swap gh refuses because the ready label does not exist
 * there is made again as a removal, once; any other failure is a GhError for the person to retry.
 * Resolves the move that was made.
 */
export async function moveLabel(run: Run, repo: string, number: number, conventions: Conventions): Promise<LabelMove> {
  const move = labelMove(conventions)
  if (move.kind === 'remove') {
    await removeLabel(run, repo, number, conventions)
    return move
  }
  try {
    await handToAgent(run, repo, number, conventions)
    return move
  } catch (error) {
    const fallback = error instanceof GhError ? afterRefusedSwap(move, error.message) : null
    if (fallback === null) throw error
    await removeLabel(run, repo, number, conventions)
    return fallback
  }
}

/** What resolving a repository's conventions calls besides gh: the clock, the repository's record in the plugin's store, and the person's file. */
export type ConventionsIO = {
  now: () => Promise<number>
  load: (repo: string) => Promise<unknown>
  save: (repo: string, record: RepoRecord) => Promise<void>
  personFile: () => Promise<string | null>
}

/** One file of a repository through gh: its text, or null on a 404. Any other failure is a GhError. */
async function rawFile(run: Run, repo: string, path: string): Promise<string | null> {
  try {
    return await gh(run, rawFileArgs(repo, path))
  } catch (error) {
    if (error instanceof GhError && /\(HTTP 404\)/.test(error.message)) return null
    throw error
  }
}

/**
 * One repository's conventions, for an action on one of its issues: from its
 * record while one was read within RECORD_FRESH_FOR, else from its two files
 * read through gh, recorded (a 404 as no file). Any other failure is a
 * GhError and records nothing. The poll never calls this: it reads only what
 * sessions recorded from their checkouts.
 */
export async function resolveConventions(run: Run, repo: string, io: ConventionsIO): Promise<Resolved> {
  const now = await io.now()
  let held = readRecord(await io.load(repo))
  if (held === null || !isFresh(held, now)) {
    const [repoFile, triageFile] = await Promise.all([rawFile(run, repo, CONVENTION_FILES.repoFile), rawFile(run, repo, CONVENTION_FILES.triageFile)])
    held = recordOf(repoFile, triageFile, now)
    await io.save(repo, held)
  }
  return conventionsOf({ repoFile: held.repoFile, triageFile: held.triageFile, personFile: await io.personFile() })
}

export function parseTarget(target: string): { repo: string; number: number } | null {
  const match = TARGET.exec(target)
  return match === null ? null : { repo: match[1] as string, number: Number(match[2]) }
}
