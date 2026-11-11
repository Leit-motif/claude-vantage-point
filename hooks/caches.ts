// The scan behind the footer's cache label and the Caches pane (issue #50): every
// transcript under `~/.claude/projects` touched recently enough to hold a warm cache, and this
// session's own whatever its age. register.tsx hands in the file system calls;
// panes/caches/caches.ts reads what comes back. scripts/cache-fleet.mts runs the same scan from
// outside Claude Code (issue #55), so its imports name their files for node.
import { cacheOf, COLD_KEEP_MS, readTail, TAIL_BYTES, TTL_MS } from '../panes/caches/caches.ts'
import type { Cache, CacheState } from '../panes/caches/caches.ts'
import { deskOf, parseDesktopSession } from '../panes/caches/sessions.ts'
import type { DesktopSession } from '../panes/caches/sessions.ts'
import { QUIET, RECOMMENDED, SIGNAL_RED, SIGNAL_YELLOW } from './signal.ts'

export type CacheEntry = { name: string; kind: 'file' | 'dir' | 'other'; size: number; mtimeMs: number }
export type CacheIO = {
  home: () => Promise<string | undefined>
  list: (path: string) => Promise<readonly CacheEntry[]>
  read: (path: string) => Promise<string>
  /**
   * The last response and title lines of a file too big to read whole. A transcript's tail can
   * be one pasted screenshot, so the last bytes alone may hold no response at all.
   */
  responses: (path: string) => Promise<string>
}

/** The state's colour: green warm, yellow cooling, red expiring, and a cold cache the theme's grey, since it needs no eye (issue #50). */
export const CACHE_TONE: Record<CacheState, string> = { warm: RECOMMENDED, cooling: SIGNAL_YELLOW, expiring: SIGNAL_RED, cold: QUIET }

/** The folder that holds every project's transcripts, or null when no home is known. */
export async function projectsRoot(io: CacheIO): Promise<string | null> {
  const home = await io.home()
  return home === undefined || home === '' ? null : `${home}/.claude/projects`
}

const text = (io: CacheIO, path: string, size: number) => (size <= TAIL_BYTES ? io.read(path) : io.responses(path))

/**
 * Every cache under `root` that is warm, or went cold within COLD_KEEP_MS of `now`, and this
 * session's (`own`, a transcript's file name) at any age. A transcript that reads as no cache this
 * time keeps what `previous` knew of it: one failed read does not drop a warm cache.
 */
export async function scanCaches(io: CacheIO, root: string, now: number, own: string, previous: readonly Cache[] = []): Promise<Cache[]> {
  const recent = (mtime: number) => now - mtime < TTL_MS['1h'] + COLD_KEEP_MS
  const found: { path: string; size: number; mtime: number; kind: Cache['kind']; folder: string }[] = []
  const folders = (await io.list(root).catch(() => [])).filter(f => f.kind === 'dir')
  await Promise.all(folders.map(async folder => {
    const dir = `${root}/${folder.name}`
    for (const f of await io.list(dir).catch(() => [])) {
      if (f.kind !== 'file' || !f.name.endsWith('.jsonl') || !(recent(f.mtimeMs) || f.name === own)) continue
      found.push({ path: `${dir}/${f.name}`, size: f.size, mtime: f.mtimeMs, kind: 'session', folder: folder.name })
      // A subagent runs inside its parent's turn, so only a recent session can have a recent one.
      const subs = `${dir}/${f.name.slice(0, -'.jsonl'.length)}/subagents`
      for (const s of await io.list(subs).catch(() => [])) {
        if (s.kind === 'file' && s.name.endsWith('.jsonl') && recent(s.mtimeMs)) found.push({ path: `${subs}/${s.name}`, size: s.size, mtime: s.mtimeMs, kind: 'subagent', folder: folder.name })
      }
    }
  }))
  const known = new Map(previous.map(c => [c.file, c]))
  const caches = await Promise.all(found.map(async f => {
    let cache = known.get(f.path) ?? null
    // A transcript unwritten since the last scan says the same: only sessions at work are read,
    // and one an older release stored without its token counts.
    const facts = cache?.touchedAt === f.mtime && cache.sent !== undefined ? null : readTail(await text(io, f.path, f.size).catch(() => ''))
    if (facts !== null) {
      let title: string | undefined
      if (f.kind === 'subagent') {
        try {
          const meta = JSON.parse(await io.read(`${f.path.slice(0, -'.jsonl'.length)}.meta.json`)) as { description?: unknown }
          if (typeof meta.description === 'string') title = meta.description
        } catch { /* a subagent without its meta keeps its first prompt */ }
      }
      cache = cacheOf(facts, { file: f.path, kind: f.kind, folder: f.folder, touchedAt: f.mtime, ...(title === undefined ? {} : { title }) })
    }
    const isOwn = f.path.endsWith(`/${own}`)
    return cache !== null && (isOwn || cache.expiresAt > now - COLD_KEEP_MS) ? cache : null
  }))
  return caches.filter((c): c is Cache => c !== null)
}

/** Each desktop session file as last read, by its path, so one unwritten since is not read again. */
export type SessionFiles = ReadonlyMap<string, { mtime: number; session: DesktopSession | null }>

/**
 * Every desktop session file under `root`, the Host's `desktopSessions` (issues #62, 152). A file is about 55 kB and there can be
 * hundreds, most archived, so only those written since `previous` read them are read again.
 */
export async function scanDesktopSessions(io: CacheIO, root: string, previous: SessionFiles = new Map()): Promise<Map<string, { mtime: number; session: DesktopSession | null }>> {
  const dirs = async (path: string) => (await io.list(path).catch(() => [])).filter(e => e.kind === 'dir').map(e => `${path}/${e.name}`)
  const orgs = (await Promise.all((await dirs(root)).map(dirs))).flat()
  const files = (await Promise.all(orgs.map(async org =>
    (await io.list(org).catch(() => [])).filter(f => f.kind === 'file' && /^local_.*\.json$/.test(f.name)).map(f => ({ path: `${org}/${f.name}`, mtime: f.mtimeMs })),
  ))).flat()
  const read = await Promise.all(files.map(async f => {
    const known = previous.get(f.path)
    if (known !== undefined && known.mtime === f.mtime) return [f.path, known] as const
    const session = parseDesktopSession(await io.read(f.path).catch(() => ''))
    // A file caught mid-write keeps what was known of it, and is read again next time.
    return [f.path, session === null && known !== undefined ? known : { mtime: f.mtime, session }] as const
  }))
  return new Map(read)
}

/** Each cache with the desktop session that holds it, or none: a link an earlier scan made is dropped first. */
export function linkDesks(caches: readonly Cache[], files: SessionFiles): Cache[] {
  const sessions = [...files.values()].flatMap(f => (f.session === null ? [] : [f.session]))
  return caches.map(c => {
    const { desk: _, ...rest } = c
    const desk = deskOf(c, sessions)
    return desk === undefined ? rest : { ...rest, desk }
  })
}
