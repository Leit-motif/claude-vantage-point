// Every prompt cache on this machine, read from Claude Code's own transcripts (issue #50). Pure:
// hooks/caches.ts lists and reads the files, and the footer and the pane draw what this returns.
//
// Each response in `~/.claude/projects/**/*.jsonl` records its usage: the tokens read from the
// cache, the tokens written, and which TTL the write took (`cache_creation.ephemeral_1h_input_tokens`
// or `ephemeral_5m_input_tokens`). A hit refreshes the TTL, so a cache is warm until its last
// request plus that TTL. The tier is read, never assumed: subagents often write 5-minute caches.
import type { HumanQueueCache, HumanQueueCacheFilter } from '../../types'

export type Cache = HumanQueueCache
export type CacheFilter = HumanQueueCacheFilter
export type Ttl = Cache['ttl']

export const TTL_MS: Record<Ttl, number> = { '5m': 300_000, '1h': 3_600_000 }
/** A cold cache stays listed this long, with what it would cost to warm again. */
export const COLD_KEEP_MS = 15 * 60_000
/** Bytes read from the end of a transcript; its last response is always in them. */
export const TAIL_BYTES = 1 << 20
/** Under this share of its TTL left, a warm cache is cooling. */
export const COOLING_FRACTION = 0.2
/** Under this share of its TTL left, a cache is about to expire: 3 minutes of an hour, 15 seconds of five. */
export const EXPIRING_FRACTION = 0.05

/**
 * An awk program that cuts a transcript too big to read whole down to what readTail needs: its
 * response and title lines, and each user line's time alone, which starts the next request's
 * clock. A user line names its type in its first few hundred characters and can carry megabytes of
 * images after it, so it is matched by a plain search of its start, never a pattern over the line.
 */
/** The sh line that runs RESPONSES_AWK (`$1`) over a transcript (`$2`) and keeps its last 120 lines. */
export const RESPONSES_SH = 'awk "$1" "$2" | tail -n 120'

/**
 * RESPONSES_AWK and RESPONSES_SH in JS, for a host with no shell (Windows without Git for Windows,
 * issue 152): the same three plain searches, the same last 120 lines. scripts/caches.test.mts
 * holds the two to the same output.
 */
export function responsesOf(text: string): string {
  const out: string[] = []
  for (const line of text.split('\n')) {
    if (line === '') continue
    const head = line.slice(0, 300)
    if (head.includes('"type":"user"')) {
      const i = line.indexOf('"timestamp":"')
      if (i >= 0) {
        const t = line.slice(i + 13, i + 53)
        const end = t.indexOf('"')
        out.push(`{"type":"user","timestamp":"${end < 0 ? t : t.slice(0, end)}"}`)
      }
    } else if (head.includes('"type":"custom-title"') || line.includes('"type":"assistant"')) out.push(line)
  }
  return out.slice(-120).join('\n') + (out.length > 0 ? '\n' : '')
}

export const RESPONSES_AWK = String.raw`{ p = substr($0, 1, 300) }
index(p, "\"type\":\"user\"") { i = index($0, "\"timestamp\":\""); if (i) { t = substr($0, i + 13, 40); print "{\"type\":\"user\",\"timestamp\":\"" substr(t, 1, index(t, "\"") - 1) "\"}" } next }
index(p, "\"type\":\"custom-title\"") || index($0, "\"type\":\"assistant\"") { print }`

/** What one transcript's tail says about its cache, or null with no response in it. */
export type Facts = { cwd: string; title: string; model: string; ttl: Ttl; lastAt: number; prefix: number; read: number; sent: number }

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const record = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined

export function readTail(text: string): Facts | null {
  // A response's chunks are written when it ends, but the cache's TTL runs from the request. So a
  // request is timed from the entry written before its first chunk, the prompt or tool result that
  // sent it: never later than the request, so the countdown errs short. It keeps its last usage.
  const requests = new Map<string, { at: number; usage: Record<string, unknown>; model: string }>()
  let title = ''
  let firstPrompt = ''
  let cwd = ''
  let before = NaN
  for (const line of text.split('\n')) {
    if (line === '') continue
    let entry: Record<string, unknown> | undefined
    try { entry = record(JSON.parse(line)) } catch { continue }
    if (entry === undefined) continue
    const at = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN
    if (typeof entry.cwd === 'string') cwd = entry.cwd
    if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') title = entry.customTitle
    const message = record(entry.message)
    if (entry.type === 'user' && firstPrompt === '' && typeof message?.content === 'string') firstPrompt = message.content
    const usage = record(message?.usage)
    if (entry.type === 'assistant' && usage !== undefined && Number.isFinite(at)) {
      const id = String(entry.requestId ?? message?.id ?? entry.uuid)
      const held = requests.get(id)
      const model = typeof message?.model === 'string' ? message.model : (held?.model ?? '')
      requests.set(id, { at: held?.at ?? (Number.isFinite(before) ? before : at), usage, model })
    }
    if (Number.isFinite(at)) before = at
  }
  const list = [...requests.values()].filter(r => r.model !== '<synthetic>').sort((a, b) => a.at - b.at)
  const last = list.at(-1)
  if (last === undefined) return null
  // A request that only read wrote no tier; the cache keeps the last write's.
  let ttl: Ttl = '5m'
  for (const r of [...list].reverse()) {
    const written = record(r.usage.cache_creation)
    if (count(written?.ephemeral_1h_input_tokens) > 0) { ttl = '1h'; break }
    if (count(written?.ephemeral_5m_input_tokens) > 0) { ttl = '5m'; break }
  }
  const sent = (u: Record<string, unknown>) => count(u.input_tokens) + count(u.cache_read_input_tokens) + count(u.cache_creation_input_tokens)
  return {
    cwd,
    title: title || firstPrompt.replace(/\s+/g, ' ').trim().slice(0, 80),
    model: last.model.replace(/^claude-/, ''),
    ttl,
    lastAt: last.at,
    prefix: sent(last.usage),
    // Over every request the transcript holds: the input tokens sent, and those the cache served.
    read: list.reduce((sum, r) => sum + count(r.usage.cache_read_input_tokens), 0),
    sent: list.reduce((sum, r) => sum + sent(r.usage), 0),
  }
}

/** `my-app`, or `my-app ⎇ adoring-cohen` for a worktree under `.claude/worktrees`. */
export function projectOf(cwd: string, folder: string): string {
  const path = cwd || folder.replace(/^-/, '/').replaceAll('-', '/')
  const worktree = path.match(/[/\\]([^/\\]+)[/\\]\.claude[/\\]worktrees[/\\]([^/\\]+)/)
  if (worktree) return `${worktree[1]} ⎇ ${worktree[2]}`
  return path.split(/[/\\]/).filter(Boolean).at(-1) ?? path
}

export function cacheOf(facts: Facts, at: { file: string; kind: Cache['kind']; folder: string; touchedAt: number; title?: string }): Cache {
  return {
    file: at.file,
    kind: at.kind,
    project: projectOf(facts.cwd, at.folder),
    title: at.title ?? facts.title,
    model: facts.model,
    ttl: facts.ttl,
    lastAt: facts.lastAt,
    touchedAt: at.touchedAt,
    expiresAt: facts.lastAt + TTL_MS[facts.ttl],
    prefix: facts.prefix,
    read: facts.read,
    sent: facts.sent,
  }
}

/** A response just landed in `file`: its cache is warm again from `now`, before the next scan reads it. */
export function touch(caches: readonly Cache[], file: string, now: number): Cache[] {
  return caches.map(c => (c.file === file ? { ...c, lastAt: now, touchedAt: now, expiresAt: now + TTL_MS[c.ttl] } : c))
}

/** warm, cooling (under a fifth of its TTL left), expiring (under a twentieth), cold. */
export type CacheState = 'warm' | 'cooling' | 'expiring' | 'cold'
export type Seen = Cache & { left: number; fraction: number; state: CacheState }

export function stateOf(c: Cache, now: number): Seen {
  const left = c.expiresAt - now
  const ttl = TTL_MS[c.ttl]
  const state: CacheState = left <= 0 ? 'cold' : left < ttl * EXPIRING_FRACTION ? 'expiring' : left < ttl * COOLING_FRACTION ? 'cooling' : 'warm'
  return { ...c, left, fraction: Math.max(0, Math.min(1, left / ttl)), state }
}

/** Sibling folders of one stem before their sessions read as one batch. */
export const RUNS_AT = 5

/** `eval` for the temp folder `eval-zk4_p6r7`: what a folder's maker named it, without the random tail. */
const stemOf = (project: string) => (project.includes(' ⎇ ') ? undefined : project.match(/^(.+?)[-_][A-Za-z0-9_]{6,}$/)?.[1])

/**
 * Each batch of one-shot sessions as a single cache, `312 eval runs` (issue #161). A script
 * that runs `claude -p` per item in a fresh temp folder leaves a real transcript for each, and
 * nobody returns to any of them. A batch is at least RUNS_AT folders of one stem, so sessions
 * sharing one folder like `my-workspace` are never one, and a session the desktop holds
 * stays its own row. The batch counts as warm until its newest run cools, and holds only what its
 * warm runs hold.
 */
function collapseRuns(caches: readonly Cache[], now: number): Cache[] {
  const stems = new Map<string, Cache[]>()
  for (const c of caches) {
    const stem = c.kind === 'session' && c.desk === undefined ? stemOf(c.project) : undefined
    if (stem !== undefined) stems.set(stem, [...(stems.get(stem) ?? []), c])
  }
  const batches = [...stems].filter(([, runs]) => new Set(runs.map(c => c.project)).size >= RUNS_AT)
  const batched = new Set(batches.flatMap(([, runs]) => runs))
  return [
    ...caches.filter(c => !batched.has(c)),
    ...batches.map(([stem, runs]): Cache => {
      const newest = runs.reduce((a, b) => (b.expiresAt > a.expiresAt ? b : a))
      const warm = runs.filter(c => c.expiresAt > now)
      const sum = (of: (c: Cache) => number) => runs.reduce((total, c) => total + of(c), 0)
      return {
        ...newest,
        file: `runs:${stem}`,
        project: stem,
        title: `${runs.length} ${stem} runs`,
        prefix: (warm.length > 0 ? warm : runs).reduce((total, c) => total + c.prefix, 0),
        read: sum(c => c.read),
        sent: sum(c => c.sent),
      }
    }),
  ]
}

/**
 * Every cache as it stands at `now`: the warm soonest to cool first, then the cold most recently
 * cooled first, since a cold cache needs no eye. One cold past COLD_KEEP_MS is gone.
 */
export function cachesAt(caches: readonly Cache[], now: number): Seen[] {
  const all = collapseRuns(caches.filter(c => c.expiresAt - now > -COLD_KEEP_MS), now).map(c => stateOf(c, now))
  const warm = all.filter(c => c.state !== 'cold').sort((a, b) => a.left - b.left)
  const cold = all.filter(c => c.state === 'cold').sort((a, b) => b.left - a.left)
  return [...warm, ...cold]
}

export const isWarm = (c: Seen) => c.state !== 'cold'

/**
 * The id of the session whose transcript holds the cache: the file's name, or for a subagent, at
 * `<session>/subagents/<agent>.jsonl`, the folder its parent's transcript sits beside.
 */
export function transcriptId(cache: Pick<Cache, 'file' | 'kind'>): string | undefined {
  const parts = cache.file.split(/[/\\]/)
  const name = cache.kind === 'subagent' ? parts.at(-3) : parts.at(-1)?.replace(/\.jsonl$/, '')
  return name === undefined || name === '' ? undefined : name
}

/** A subagent, or a session another session started: drawn under its parent while that is listed. */
export const isChild = (c: Cache) => c.kind === 'subagent' || c.desk?.parent !== undefined

/** The filter with nothing hidden. */
export const SHOW_ALL: CacheFilter = { cold: false, children: false, merged: false, archived: false }

/** Whether the filter leaves the cache in: hidden when any kind it is of is hidden. */
export const passes = (c: Seen, hidden: CacheFilter) =>
  !(hidden.cold && c.state === 'cold') && !(hidden.children && isChild(c)) && !(hidden.merged && c.desk?.merged === true) && !(hidden.archived && c.desk?.archived === true)

/** How many of the caches each kind of the filter holds, so the menu says what a tick would hide. */
export const kindCounts = (caches: readonly Seen[]): Record<keyof CacheFilter, number> => ({
  cold: caches.filter(c => c.state === 'cold').length,
  children: caches.filter(isChild).length,
  merged: caches.filter(c => c.desk?.merged === true).length,
  archived: caches.filter(c => c.desk?.archived === true).length,
})

/** The row a child cache sits under: a subagent's session, or the session that started a session. */
function parentOf(c: Cache, caches: readonly Cache[]): Cache | undefined {
  if (c.kind === 'subagent') {
    const id = transcriptId(c)
    return caches.find(p => p.kind === 'session' && transcriptId(p) === id)
  }
  const parent = c.desk?.parent
  return parent === undefined ? undefined : caches.find(p => p.kind === 'session' && p.desk?.local === parent)
}

/**
 * The caches as the pane lists them: each in `caches`' order, a child right under its parent one
 * step in, and a child whose parent is not listed at the top, where its own order puts it.
 */
export function treeOf<C extends Cache>(caches: readonly C[]): { cache: C; depth: number }[] {
  const children = new Map<C, C[]>()
  const roots: C[] = []
  for (const c of caches) {
    const parent = parentOf(c, caches) as C | undefined
    if (parent === undefined || parent === c) roots.push(c)
    else children.set(parent, [...(children.get(parent) ?? []), c])
  }
  const out: { cache: C; depth: number }[] = []
  const seen = new Set<C>()
  const walk = (c: C, depth: number) => {
    if (seen.has(c)) return
    seen.add(c)
    out.push({ cache: c, depth })
    for (const child of children.get(c) ?? []) walk(child, depth + 1)
  }
  for (const c of roots) walk(c, 0)
  // A loop of parents leaves its members unreached: list them at the top rather than drop them.
  for (const c of caches) walk(c, 0)
  return out
}

/** `46m`, `40s`, `cold`: minutes up to the hour, so the label stays three characters. */
export const leftLabel = (ms: number) => (ms <= 0 ? 'cold' : ms >= 60_000 ? `${Math.floor(ms / 60_000)}m` : `${Math.ceil(ms / 1000)}s`)

/** `840`, `61k`, `1.1M`. */
export const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

/** The model as the app's footer names it: `opus-5-5` is `Opus 5.5`, `haiku-4-5-20251001` is `Haiku 4.5`. */
export function modelName(model: string): string {
  const [family, ...rest] = model.split('-')
  if (family === undefined || family === '' || !rest.every(part => /^\d+$/.test(part))) return model
  const version = rest.filter(part => part.length <= 2)
  return [`${family[0]?.toUpperCase()}${family.slice(1)}`, version.join('.')].filter(Boolean).join(' ')
}

/**
 * `94% hit`: of every input token these caches' transcripts sent, the share the cache served,
 * floored so 99.6% never reads 100%. Weighted by tokens, so a small subagent counts for little.
 * Null with nothing sent, or only caches an older release stored without their counts.
 */
export function hitLabel(caches: readonly Cache[]): string | null {
  const counted = caches.filter(c => c.sent > 0)
  const sent = counted.reduce((sum, c) => sum + c.sent, 0)
  return sent > 0 ? `${Math.floor((counted.reduce((sum, c) => sum + c.read, 0) / sent) * 100)}% hit` : null
}

/**
 * The pane's second line, fact by fact: `my-app · 258k · 94% hit · Opus 5.5 · 1h`,
 * `re-cache 258k` once cold. `extra` (Keep warm's refreshes) follows the hit rate. The facts run
 * from most to least telling, so a narrow row drops the model and TTL first. A child says nothing
 * of its kind: its elbow does.
 */
export const facts = (c: Seen, extra: readonly string[] = []) => [
  c.project,
  `${c.state === 'cold' ? 're-cache ' : ''}${tokens(c.prefix)}`,
  ...[hitLabel([c])].filter(label => label !== null),
  ...(c.desk?.archived === true ? ['archived'] : []),
  ...extra,
  modelName(c.model),
  c.ttl,
]

export const factsLine = (c: Seen) => facts(c).join(' · ')

/**
 * As many whole facts as fit in `chars`, joined; at least the first, which the row cuts if it
 * must. A fact is never cut in the middle, so `Opus 5.…` cannot be drawn.
 */
export function fitFacts(list: readonly string[], chars: number): string {
  let line = list[0] ?? ''
  for (const fact of list.slice(1)) {
    const next = `${line} · ${fact}`
    if (next.length > chars) break
    line = next
  }
  return line
}
