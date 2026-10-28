// Keep warm (issue #60): an armed session's mod refreshes its own prompt cache while it is idle,
// until 6 hours after the person last acted on it or local midnight, whichever comes first, and at
// once if a ping misses the cache (the owner's ruling on #60, 2026-10-18).
//
// Why 6 hours: a refresh reads the prefix at 0.05x base input on Opus 5.5 and Sonnet 5.5 (0.025x on
// Fable 5.1), where letting it cool and coming back writes it at 2x on the 1h tier. Over three
// months of the owner's sessions, 79% of returns after a lapse came within 6 hours, the rest the
// next day; capped at 6 hours or midnight, an armed session costs at most about what never
// pinging does even when nobody comes back. The research and its numbers are on #60.
// Pure: hooks/register.tsx keeps the store, the timer and the ping.
//
// The ping is the session's own `$.prompt.submit`: a turn of its own once the session is idle,
// whose request reads the prefix from the cache and so resets its TTL (the spike on #60, on the
// desktop's engine 2.1.299). A session cannot `$.session.send` to itself, and a mod pings no
// session but its own, so a cache is kept warm only while its session runs.
import type { Cache, Ttl } from './caches'
import { TTL_MS } from './caches'

/**
 * How long before the cache would cool the ping goes. A 1h cache pings as it turns expiring (three
 * minutes left); a 5m one's expiring window is 15 s, too close to a turn's start, so it pings at 30 s.
 */
export const PING_LEAD_MS: Record<Ttl, number> = { '1h': 3 * 60_000, '5m': 30_000 }

/** What the mod submits. One word back, and no tools, keeps the turn to one small request. */
export const PING = 'Keep warm: the human-queue mod is refreshing this session’s prompt cache while it is idle. Reply with the single word ok, and call no tools.'

/** A session's Keep warm, kept in the plugin's store under its key so any session's pane can arm it. */
export type Warmth = {
  armed: boolean
  /** The person's last act on the session: arming it, or a real turn. The stop counts from here. */
  since: number
  /** A ping rewrote the prefix instead of reading it: the cache was gone, so pinging stopped. */
  missed: boolean
}
export const UNARMED: Warmth = { armed: false, since: 0, missed: false }

/** The store key of a session's Keep warm: its transcript's id, the id `$.session.id()` answers. */
export const warmthKey = (sessionId: string) => `keep-warm-${sessionId}`
export const WARMTH_PREFIX = 'keep-warm-'

/** A stored Keep warm; unarmed when missing or unreadable. One an older release stored with no `since` reads as stopped. */
export function readWarmth(value: unknown): Warmth {
  if (typeof value !== 'object' || value === null) return UNARMED
  const { armed, since, missed } = value as Record<string, unknown>
  return { armed: armed === true, since: typeof since === 'number' && Number.isFinite(since) && since > 0 ? since : 0, missed: missed === true }
}

/** How long after the person's last act the pinging stops, unless midnight comes first. */
export const IDLE_LIMIT_MS = 6 * 60 * 60_000

/** The first local midnight after `at`. */
export function midnightAfter(at: number): number {
  const day = new Date(at)
  day.setHours(24, 0, 0, 0)
  return day.getTime()
}

/** When the pinging stops: 6 hours after the person's last act, or the local midnight after it, whichever comes first. */
export const stopAt = (w: Warmth) => Math.min(w.since + IDLE_LIMIT_MS, midnightAfter(w.since))

/** off; armed and refreshing; or armed but stopped, by the clock or a missed ping. */
export type WarmState = 'off' | 'armed' | 'stopped'

export function warmStateOf(w: Warmth, now: number): WarmState {
  if (!w.armed) return 'off'
  return w.missed || now >= stopAt(w) ? 'stopped' : 'armed'
}

/**
 * When to ping the cache, or null for no ping: unarmed, stopped, already cold (a cold cache's next
 * request writes it whatever it says), or due only after the stop. A time already past means now.
 */
export function pingAt(cache: Pick<Cache, 'ttl' | 'expiresAt'>, w: Warmth, now: number): number | null {
  if (warmStateOf(w, now) !== 'armed' || cache.expiresAt <= now) return null
  const at = cache.expiresAt - Math.min(PING_LEAD_MS[cache.ttl], TTL_MS[cache.ttl])
  return at < stopAt(w) ? at : null
}

/** A ping's request missed the cache when it wrote more of the prefix than it read. */
export const missedCache = (usage: { cache_read_input_tokens: number; cache_creation_input_tokens: number }) =>
  usage.cache_creation_input_tokens > usage.cache_read_input_tokens

/** A turn ended: a ping that missed stops the pinging; a real turn is the person acting, so the stop counts from it. */
export const afterTurn = (w: Warmth, turn: { ping: true; missed: boolean } | { ping: false; at: number }): Warmth =>
  turn.ping ? { ...w, missed: w.missed || turn.missed } : { ...w, since: turn.at, missed: false }

/** A press of the toggle: armed turns it off; off or stopped arms it from now. */
export const toggled = (w: Warmth, now: number): Warmth => (warmStateOf(w, now) === 'armed' ? UNARMED : { armed: true, since: now, missed: false })

/** `17:40`, local. */
const clockTime = (at: number) => {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The Caches row's fact: `warm till 17:40` while armed, `ping missed` or `stopped 17:40` once stopped; null off. */
export function warmFact(w: Warmth, now: number): string | null {
  const state = warmStateOf(w, now)
  if (state === 'off') return null
  if (state === 'armed') return `warm till ${clockTime(stopAt(w))}`
  return w.missed ? 'ping missed' : `stopped ${clockTime(stopAt(w))}`
}
