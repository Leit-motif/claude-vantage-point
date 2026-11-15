// The reply row's words: the headline's room and the plain text a quote is drawn as.
// The decision itself is checked where the agent declares it (`declared` in `hooks/deck.ts`).

/** The most words a deck's headline holds: the first step a yes starts, asked as a question (#123). */
export const HEADLINE_WORDS = 12

/** The band shows plain text: markdown marks in a quote are dropped, never rendered. */
export function plainQuote(quote: string): string {
  return quote
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(^|\s)[*_]([^*_\s][^*_]*?)[*_](?=\s|[.,;:!?]|$)/g, '$1$2')
    .replace(/^#+\s+/, '')
    .trim()
}
