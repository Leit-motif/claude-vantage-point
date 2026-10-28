// GitHub's rate limits, kept for every session at once: which budget a gh
// call spends, the pause GitHub's refusal sets on it, and a runner that
// answers a paused call itself instead of asking GitHub again. GitHub warns
// that calling on while limited may get the integration banned. Pauses are
// read and written through injected calls, one value per budget; the mod
// passes its store, which every session reads, so one session's refusal
// pauses them all. Two sessions refused at once for one budget may each
// write, and the last write stands: it is still a pause of a minute or more,
// and the next refusal after it records the longer one.
//
// The runner reads gh's error text, not its headers, so a refusal's
// Retry-After goes unseen: a secondary limit waits GitHub's fallback of a
// minute, doubling while refusals continue.
import type { Run } from './issues'

/** The budgets GitHub counts separately. */
export type Budget = 'search' | 'core' | 'graphql'
export const BUDGETS: readonly Budget[] = ['search', 'core', 'graphql']

/** One budget's pause: until when (epoch ms), and how many secondary limits came in a row. */
export type Hold = { until: number; strikes: number }

/** What `gh api rate_limit` reports for a budget: requests left, and when its window resets (epoch s). */
export type Limits = Partial<Record<Budget, { remaining: number; reset: number }>>

/** The calls the pacing makes besides the runner it wraps. */
export type PauseIO = {
  now: () => Promise<number>
  load: (budget: Budget) => Promise<unknown>
  save: (budget: Budget, hold: Hold) => Promise<void>
}

const MINUTE = 60_000
/** The longest pause a secondary limit sets; this long without a refusal after a pause ends starts the doubling over. */
const LONGEST = 32 * MINUTE
const NAMES: Record<Budget, string> = { search: 'searches', core: 'reads', graphql: 'issue reads' }

/** The budget a call with gh's `args` spends; null for one GitHub does not count. */
export function budgetOf(args: readonly string[]): Budget | null {
  if (args[0] !== 'api') return args[0] === 'search' ? 'search' : 'graphql'
  const path = args[1] ?? ''
  if (path === 'rate_limit') return null
  if (path.startsWith('search/')) return 'search'
  return path === 'graphql' ? 'graphql' : 'core'
}

/** Which of GitHub's limits gh's error names, if any. A primary limit can come as a 429 too. */
export function limitOf(stderr: string): 'primary' | 'secondary' | null {
  if (/API rate limit (already )?exceeded|RATE_LIMITED/i.test(stderr)) return 'primary'
  if (/secondary rate limit|abuse detection|submitted too quickly|HTTP 429/i.test(stderr)) return 'secondary'
  return null
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** A stored hold; nothing paused when it is missing or unreadable. */
export function readHold(value: unknown): Hold {
  const one = record(value)
  const strikes = finite(one.strikes)
  return { until: finite(one.until) ?? 0, strikes: strikes !== null && Number.isInteger(strikes) && strikes > 0 ? strikes : 0 }
}

/** `gh api rate_limit`'s answer, per budget it reports in full. */
export function parseLimits(stdout: string): Limits {
  let answer: unknown
  try {
    answer = JSON.parse(stdout)
  } catch {
    return {}
  }
  const resources = record(record(answer).resources)
  const limits: Limits = {}
  for (const budget of BUDGETS) {
    const one = record(resources[budget])
    const remaining = finite(one.remaining)
    const reset = finite(one.reset)
    if (remaining !== null && reset !== null) limits[budget] = { remaining, reset }
  }
  return limits
}

/**
 * A budget's hold after a secondary limit at `now`: a minute that doubles
 * while the refusals keep coming. A refusal while the budget is paused
 * answers a call already under way when the pause began, and adds nothing.
 */
export function afterSecondary(hold: Hold, now: number): Hold {
  if (hold.until > now) return hold
  const strikes = now - hold.until > LONGEST ? 0 : hold.strikes
  return { until: now + Math.min(MINUTE * 2 ** strikes, LONGEST), strikes: strikes + 1 }
}

/**
 * The budgets a primary refusal of a call to `refused` pauses, and until
 * when: each one GitHub reports spent, until its window resets, and each of
 * `refused` the report does not show spent, for a minute.
 */
export function primaryPauses(refused: readonly Budget[], now: number, limits: Limits): [Budget, number][] {
  const spent = BUDGETS.flatMap(one => {
    const left = limits[one]
    return left?.remaining === 0 ? [[one, left.reset * 1000] as [Budget, number]] : []
  })
  const unreported = refused.filter(one => !spent.some(([paused]) => paused === one))
  return [...spent, ...unreported.map(one => [one, now + MINUTE] as [Budget, number])]
}

/** The line the pane shows for a paused budget. */
export function pausedLine(budget: Budget, until: number, now: number): string {
  const minutes = Math.ceil((until - now) / MINUTE)
  const left = minutes <= 1 ? 'about a minute' : `${minutes} minutes`
  return `GitHub's rate limit paused ${NAMES[budget]} for ${left}`
}

/** The pause line of the first of `budgets` paused now, or null when none is. */
export async function pausedNow(io: PauseIO, budgets: readonly Budget[]): Promise<string | null> {
  const now = await io.now()
  for (const budget of budgets) {
    const hold = readHold(await io.load(budget))
    if (hold.until > now) return pausedLine(budget, hold.until, now)
  }
  return null
}

/**
 * Records a refusal for every session, when `stderr` names one of GitHub's
 * limits, and resolves the line to show in its place; null when it names
 * none. `refused` is what the refused call may have spent, the first shown.
 */
export async function noteRefusal(run: Run, io: PauseIO, refused: readonly [Budget, ...Budget[]], stderr: string, env?: Record<string, string>): Promise<string | null> {
  const limit = limitOf(stderr)
  if (limit === null) return null
  let limits: Limits = {}
  if (limit === 'primary') {
    const report = await run(['gh', 'api', 'rate_limit'], { env, timeoutMs: 10_000 }).catch(() => null)
    if (report?.exitCode === 0) limits = parseLimits(report.stdout)
  }
  // The pause runs from the refusal, not from when the call set out.
  const now = await io.now()
  const pauses = limit === 'primary' ? primaryPauses(refused, now, limits) : BUDGETS.map(one => [one, 0] as [Budget, number])
  let shown = now
  for (const [one, until] of pauses) {
    const held = readHold(await io.load(one))
    const next = limit === 'primary' ? { ...held, until: Math.max(held.until, until) } : afterSecondary(held, now)
    await io.save(one, next)
    if (one === refused[0]) shown = next.until
  }
  return pausedLine(refused[0], shown, now)
}

/**
 * `run` with GitHub's limits kept. A gh call to a paused budget fails at once
 * with the pause, without reaching GitHub. A call GitHub refuses for a limit
 * pauses for every session and fails the same way. Other calls run as they are.
 */
export function paced(run: Run, io: PauseIO): Run {
  return async (argv, init) => {
    const budget = argv[0] === 'gh' ? budgetOf(argv.slice(1)) : null
    if (budget === null) return run(argv, init)
    const paused = await pausedNow(io, [budget])
    if (paused !== null) return { exitCode: 1, stdout: '', stderr: paused }
    const ran = await run(argv, init)
    if (ran.exitCode === 0) return ran
    const line = await noteRefusal(run, io, [budget], ran.stderr, init?.env)
    return line === null ? ran : { ...ran, stderr: line }
  }
}
