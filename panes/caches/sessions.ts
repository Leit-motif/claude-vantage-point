// Which desktop session holds a cache's transcript, so a click on its row in the Caches pane
// can open it (issue #62). Pure: hooks/caches.ts lists and reads the files.
//
// The desktop keeps one file per session, `<account>/<org>/local_<id>.json` under
// the Host's `desktopSessions` (panes/host.ts), whose `cliSessionId` is the transcript's file name. Its link,
// `claude://claude.ai/epitaxy/local_<id>`, opened with `open`, shows that session in the main
// window's pane (tried 2026-10-18 on the desktop's 2.42304.0). No form of it opens a pop-out: the
// app routes every claude:// link to its main window.
import type { Cache } from './caches'
import { transcriptId } from './caches.ts'

export { transcriptId }

/**
 * What one session file says: its transcript's id, its own, whether it is archived, whether a pull
 * request of its merged (`prs[].state`), the session that started it (`spawnedFrom`), and, when it
 * says, its title, model and start (the band's child sessions, issue 129).
 */
export type DesktopSession = { cli: string; local: string; archived: boolean; merged: boolean; parent?: string; title?: string; model?: string; createdAt?: number }

const LOCAL = /^local_[A-Za-z0-9-]{1,64}$/

/** A session file's text, or null when it names no transcript or no session id the desktop would take. */
export function parseDesktopSession(text: string): DesktopSession | null {
  let entry: unknown
  try { entry = JSON.parse(text) } catch { return null }
  if (typeof entry !== 'object' || entry === null) return null
  const { cliSessionId, sessionId, isArchived, prs, spawnedFrom, title, model, createdAt } = entry as Record<string, unknown>
  if (typeof cliSessionId !== 'string' || cliSessionId === '' || typeof sessionId !== 'string' || !LOCAL.test(sessionId)) return null
  const merged = Array.isArray(prs) && prs.some(pr => typeof pr === 'object' && pr !== null && (pr as Record<string, unknown>).state === 'MERGED')
  const parent = typeof spawnedFrom === 'object' && spawnedFrom !== null ? (spawnedFrom as Record<string, unknown>).sessionId : undefined
  return {
    cli: cliSessionId,
    local: sessionId,
    archived: isArchived === true,
    merged,
    ...(typeof parent === 'string' && LOCAL.test(parent) ? { parent } : {}),
    ...(typeof title === 'string' && title !== '' ? { title } : {}),
    ...(typeof model === 'string' && model !== '' ? { model: model.replace(/^claude-/, '') } : {}),
    ...(typeof createdAt === 'number' && Number.isFinite(createdAt) ? { createdAt } : {}),
  }
}

/** The desktop session that holds the cache's transcript, the one not archived when two name it; undefined when none does. */
export function deskOf(cache: Pick<Cache, 'file' | 'kind'>, sessions: Iterable<DesktopSession>): DesktopSession | undefined {
  const id = transcriptId(cache)
  if (id === undefined) return undefined
  let found: DesktopSession | undefined
  for (const s of sessions) if (s.cli === id && (found === undefined || found.archived)) found = s
  return found
}

/** The desktop session a click on the cache's row opens, or undefined when it has none or it is archived. */
export const sessionOf = (cache: Pick<Cache, 'desk'>): string | undefined => (cache.desk === undefined || cache.desk.archived ? undefined : cache.desk.local)

/** The link that shows the session in the desktop's main window; null for an id it would not take. */
export const sessionLink = (local: string) => (LOCAL.test(local) ? `claude://claude.ai/epitaxy/${local}` : null)
