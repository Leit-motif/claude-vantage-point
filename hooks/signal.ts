// The band's signal colours, shared with the queue's native card so the two speak
// one language: the theme palette's 42%-saturation accents, colour only where
// something needs the eye (issue #22), never the engine's saturated theme keys.
// Anything that needs no eye is the theme's dim text, as the band's grey dot is.

/**
 * The recommended option's green: the cache countdown's warm tone (agent-config's
 * cache-countdown mod) and the pane picture's yes, one family with the desktop's text colours.
 */
export const RECOMMENDED = '#96de81'
/** The agent: working, or what it is on. */
export const SIGNAL_BLUE = '#81b0de'
/** You: what waits on the person. */
export const SIGNAL_YELLOW = '#dec281'
/** Something failed, or a no. */
export const SIGNAL_RED = '#de8481'

// The desktop app's own neutrals, sampled off its window (2026-10-16), so a pane
// drawn beside them reads as part of the app rather than a palette of its own.
/** The side panel's border: a card's outline. */
export const CARD_LINE = '#2a2a2a'
/** The composer's fill: a raised card or a field. */
export const FILL = '#20201f'
/** The composer's border at rest: a field's outline. */
export const REST_LINE = '#363635'
/** A pane's ground (docs/palette.md): a label's halo in a picture drawn on it. */
export const PANE = '#1a1a19'
/** The app's white text: the one step up from grey. */
export const TEXT = '#f0efec'
/** The composer's placeholder and the band's idle dot: text and marks that need no eye. */
export const QUIET = '#898781'
/** The app's own merged purple, its `merged` theme key as the desktop draws it: a merged pull request (docs/palette.md). */
export const MERGED = '#b796ff'

/** The theme's `inactive`, which `dimColor` draws: the band's own labels, a step under white (docs/palette.md). */
export const INACTIVE = '#c3c2b7'
/** The band's ground, sampled off the app: a label's halo in a picture drawn on it (ADR 0046). */
export const BAND = '#262625'
