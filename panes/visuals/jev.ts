// The composer's one way to Jev (#96): every item's request in one run of
// scripts/jev_ask.py, the spend guard in front of the shared adapter, which
// reserves each request's cost on the composer's own ledger before it sends it.
// The state goes in on stdin and the answers come back on stdout, so nothing
// private is written to disk. The process runner is injected (`$.process.run`
// in the mod, a fake in tests), so this file holds no I/O of its own.
//
// Without a TypeSafe key or an adapter checkout (the public copy's normal case)
// nothing is run or reserved: every item ranks by prior, as a failed call does,
// and the plan says so. That is decided once per composer, not per item.

import { jevRequest, plan, type ComposeItem, type JevRequest, type Plan, type Reply } from './compose.ts'

export const COMPOSER_CONSUMER = 'vantage-composer'
/** The model every plan is made with; the adapter's config must price it. A bump replans (#97's cache key). */
export const COMPOSER_MODEL = 'jev-1.13.0'
/** The owner's cap for the composer on this machine: Jev spend is no gate while building (#92, the owner 2026-10-23). */
export const COMPOSER_CAP_USD = 5
/** The composer's one ledger, under the home directory. Every live call reserves here; nothing else changes it. */
export const COMPOSER_LEDGER = '.local/state/vantage-point/composer-ledger.json'
/** The whole Jev call's deadline in the adapter. Jev answered #37's requests at p95 229 ms. */
export const JEV_DEADLINE_S = 3
/** The driver process's limit: the deadline plus python's start, the adapter's import and its git check. */
export const PROCESS_TIMEOUT_MS = 20_000

/** `$.process.run`'s shape: resolves once the child exits, rejects when it cannot start or runs past `timeoutMs`. */
export type ProcessRun = (argv: readonly string[], init: { stdin: string; timeoutMs: number }) => Promise<{ exitCode: number; stdout: string }>

type Driver = { root: string; adapter: string; python: string }

/** How this process reaches Jev. `dry` is the adapter's synthetic transport, with its ledger and cost log in `dir`. */
export type Access =
  | ({ kind: 'live'; home: string } & Driver)
  | ({ kind: 'dry'; dir: string; capUsd: number } & Driver)
  | { kind: 'absent'; why: 'no key' | 'no adapter' | 'probe failed' }

/** Live only with both a key and the adapter checkout; otherwise absent, which is not an error. */
export function access(probe: { key: string | undefined; adapterFound: boolean; root: string; home: string; adapter: string; python?: string }): Access {
  if (!probe.key?.trim()) return { kind: 'absent', why: 'no key' }
  if (!probe.adapterFound) return { kind: 'absent', why: 'no adapter' }
  return { kind: 'live', home: probe.home, root: probe.root, adapter: probe.adapter, python: probe.python ?? 'python3' }
}

/** The driver's command line. The ledger and cap come from code for a live call, never from the caller. */
export function driverArgv(how: Exclude<Access, { kind: 'absent' }>): string[] {
  const live = how.kind === 'live'
  const cap = live ? COMPOSER_CAP_USD : how.capUsd
  if (!(Number.isFinite(cap) && cap > 0 && cap <= COMPOSER_CAP_USD)) throw new RangeError(`the composer's cap is above zero and at most $${COMPOSER_CAP_USD}, not ${cap}`)
  return [
    how.python, `${how.root}/scripts/jev_ask.py`, '--adapter', how.adapter, '--requests', '-', '--answers', '-',
    '--ledger', live ? `${how.home}/${COMPOSER_LEDGER}` : `${how.dir}/ledger.json`, '--cap-usd', String(cap),
    '--consumer', COMPOSER_CONSUMER, '--model', COMPOSER_MODEL, '--deadline-s', String(JEV_DEADLINE_S),
    ...(live ? [] : ['--dry-run', '--cost-log', `${how.dir}/cost.jsonl`]),
  ]
}

type Summary = { consumer?: unknown; model?: unknown; dry_run?: unknown; stopped?: unknown }
type Answered = { unit?: unknown; answers?: unknown; served_model?: unknown }

/**
 * One reply per request unit: the answers of each request the driver
 * answered with the pinned model, else why not. An unexpected summary, an exit
 * other than done (0) or stopped (3), a timeout or unreadable output fails
 * every unit. Throws only on a cap outside the composer's.
 */
export async function askJev(requests: readonly JevRequest[], how: Access, run: ProcessRun): Promise<Map<string, Reply>> {
  const all = (failed: string) => new Map<string, Reply>(requests.map(r => [r.unit, { failed }]))
  if (how.kind === 'absent') return all('no Jev')
  if (requests.length === 0) return new Map()
  const argv = driverArgv(how)
  let lines: unknown[]
  try {
    const done = await run(argv, { stdin: requests.map(r => JSON.stringify(r)).join('\n') + '\n', timeoutMs: PROCESS_TIMEOUT_MS })
    if (done.exitCode !== 0 && done.exitCode !== 3) return all('failed')
    lines = done.stdout.split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line) as unknown)
  } catch {
    return all('failed')
  }
  const summary = lines.at(-1) as Summary | undefined
  if (summary?.consumer !== COMPOSER_CONSUMER || summary.model !== COMPOSER_MODEL || summary.dry_run !== (how.kind === 'dry')) return all('failed')
  const out = all(typeof summary.stopped === 'string' && summary.stopped.startsWith('Refused') ? 'refused' : 'failed')
  for (const line of lines.slice(0, -1) as Answered[]) {
    if (typeof line?.unit !== 'string' || !out.has(line.unit)) continue
    const answers = line.answers
    out.set(line.unit, line.served_model === COMPOSER_MODEL && typeof answers === 'object' && answers !== null
      ? { model: COMPOSER_MODEL, answers: answers as Record<string, unknown> }
      : { failed: 'wrong model' })
  }
  return out
}

/**
 * A composer: plans items, one Jev request per item in one driver run. `decide`
 * says how to reach Jev and runs once, on the first call; a decide that throws
 * counts as no Jev.
 */
export function composer(decide: () => Access | Promise<Access>, run: ProcessRun): (items: readonly ComposeItem[]) => Promise<Plan[]> {
  let decided: Promise<Access> | null = null
  return async items => {
    decided ??= Promise.resolve().then(decide).catch((): Access => ({ kind: 'absent', why: 'probe failed' }))
    const how = await decided
    const requests = [...new Map(items.flatMap(item => {
      const request = jevRequest(item)
      return request ? [[request.unit, request] as const] : []
    })).values()]
    const replies = await askJev(requests, how, run)
    return items.map(item => plan(item, replies.get(item.id) ?? { failed: 'no request' }))
  }
}
