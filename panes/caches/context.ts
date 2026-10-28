import { tokens } from './caches.ts'

/**
 * The footer's context label: how full this session's context window is, beside its cache label,
 * as `14% (14k/100k)`. Text alone: the footer draws no Svg (docs/palette.md), and the quarter-step
 * donut glyph it drew before read badly (the owner, 2026-10-19).
 */

/** `14k`, `1M`: the cache label's counts, without a `.0` on a round window. */
const count = (n: number) => tokens(n).replace(/\.0(?=M$)/, '')

/**
 * ` 14% (14k/100k)`, led by a space: it runs on inside the cache label's Text, since the footer
 * trims a run's leading space. Null before the session's first response, when the engine has no
 * fill to give.
 */
export function contextLabel(context: { percent?: number; tokens?: number; window?: number } | undefined): string | null {
  const percent = context?.percent
  if (percent === undefined) return null
  const of = context?.tokens === undefined || context.window === undefined ? '' : ` (${count(context.tokens)}/${count(context.window)})`
  return ` ${Math.round(percent)}%${of}`
}

/** From this fill the label takes the cooling cache's yellow: compaction is near. */
export const CONTEXT_HIGH = 80
