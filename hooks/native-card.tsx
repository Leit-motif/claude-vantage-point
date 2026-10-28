// The item card drawn from the desktop's own elements (issue #45): the desktop's
// default since 2026-10-17; the SVG picture in screen.ts stays behind
// `/vantage-point picture`. It meets
// docs/design.md: the body (panes/human-queue/native-body.tsx: a row of dots, as
// the band's, carrying every verdict and the place, then the ask and the item's
// card), the comment field (the desktop's own Input framed as the app's
// composer), and a footer: ◀, No, Yes and ▶ on the leading edge, as A, S, W and
// D sit on the keyboard, and Submit (R) alone on the trailing one, drawn on the
// last item only, where R submits, and white once every item is answered. No and Yes are the desktop's plain
// buttons: the dots already show each verdict's colour (the owner, 2026-10-16).
// Its colours are the band's signals and the app's neutrals (./signal.ts).
// Never takes `$`: register.tsx hands it the element table, the presses, the
// body and the field.
import type { BoxProps, ButtonProps, ElementConstructor, RenderChildren, RenderElement, TextProps } from 'claude-code'
import { blocks } from '../panes/human-queue/markdown'
import { withoutPictures } from '../panes/human-queue/pictures'
import type { Request } from '../panes/human-queue/queue'
import type { BodyProps } from '../panes/human-queue/native-body'
import { plainQuote } from './reply'
import { CARD_LINE, FILL, QUIET, RECOMMENDED, REST_LINE, SIGNAL_RED } from './signal'

export const PALETTE = {
  fill: FILL,
  card: CARD_LINE,
  rest: REST_LINE,
  quiet: QUIET,
  yes: RECOMMENDED,
  no: SIGNAL_RED,
} as const

/**
 * A request's setup line: its lead-in, plain, its pictures taken out (the card draws them).
 * A long one is cut at the last sentence that fits, never dropped: the lead-in is the
 * context an item stands on (issue 87).
 */
export function setupText(request: Request): string {
  const text = plainQuote(withoutPictures(request.body).replace(/\s+/g, ' ').trim())
  if (text.length <= SETUP_MAX) return text
  const cut = text.slice(0, SETUP_MAX)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf(': '))
  return `${end > SETUP_MAX / 2 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '')} …`
}

const SETUP_MAX = 480

export type NativeVerdict = 'yes' | 'no' | null
export type NativeItem = { heading: string; text: string; verdict: NativeVerdict }

export type NativeCard = {
  /** Where the rulings go: `my-app#45`, or the project and `human-queue.md`. */
  source: string
  /** This request's place among its bucket's, said only when there are several. */
  position: number
  of: number
  title: string
  /** The request's lead-in, drawn dim over the item; empty when it has none. */
  setup: string
  /** Empty for a plain ask. */
  items: NativeItem[]
  /** 1-based; 1 for a plain ask. */
  index: number
  /** The pane's width in cells, which the strip is cut to. */
  columns: number
  /** The pane's height in cells: the card takes what the rest leaves. */
  rows: number
  /**
   * A saved comment rests as text wrapped across a frame drawn as the app's
   * composer; otherwise the field is the desktop's own Input, which draws its
   * own outline and focus ring, so it gets no frame around it.
   */
  resting: boolean
  /** The engine draws Text's `mono`, which inline code and fenced blocks take. */
  mono: boolean
}

type Press = ButtonProps['onPress']
export type NativePresses = { yes: Press; no: Press; r: Press; back: Press; next: Press; plate?: Press }

export type NativeElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

/**
 * R is a button only where it submits: the last item, or a plain ask. Before
 * that, the R key saves and moves on as Next does, so a Save button would be a
 * second control for one act.
 */
export function rSubmits(card: Pick<NativeCard, 'items' | 'index'>): boolean {
  return card.items.length === 0 || card.index >= card.items.length
}

/**
 * Each item's dot colour: a ruled item its verdict's from the press on, an
 * unruled one the band's idle grey (the owner, 2026-10-17). Colour says only the
 * verdict; the body draws the current item hollow, so the place shows
 * whatever its state.
 */
export function strip(items: readonly { verdict: NativeVerdict }[]): string[] {
  return (items.length === 0 ? [{ verdict: null }] : items).map(one =>
    one.verdict === 'yes' ? PALETTE.yes : one.verdict === 'no' ? PALETTE.no : PALETTE.quiet,
  )
}

/** What the card's body draws, as its surface module takes it. */
export function bodyProps(card: NativeCard): BodyProps {
  const plain = card.items.length === 0
  const item = plain ? undefined : card.items[card.index - 1]
  return {
    dots: plain ? [] : strip(card.items),
    current: card.index,
    title: card.title,
    // The dots give the place; a second count of requests read against them (the design review, 2026-10-24).
    source: card.source,
    // The request's lead-in once, on its first item: on every item it pushed each question down the page (the design review, 2026-10-24).
    setup: plain || card.index > 1 ? '' : card.setup,
    // A numbered item's heading is its number, which the dots already say.
    heading: item === undefined || item.heading === String(card.index) ? null : item.heading,
    blocks: blocks(plain ? card.setup || card.title : (item?.text ?? '')),
    mono: card.mono,
    line: PALETTE.card,
    fill: PALETTE.fill,
    well: PALETTE.card,
  }
}

export function nativeCard(
  el: NativeElements,
  card: NativeCard,
  on: NativePresses,
  body: RenderChildren,
  comment: RenderChildren,
  pictures: RenderChildren = null,
  composed: RenderChildren = null,
): RenderElement {
  const { Box, Button } = el
  const plain = card.items.length === 0

  return (
    // A composed card runs to its own height, the pane scrolling where its two pictures need it to (#105).
    <Box key="native" flexDirection="column" {...(composed === null ? { height: card.rows } : {})} gap={1}>
      {/* Back to the overview of every repo's asks: the arrow alone, and no hotkey, since the
          pane seldom holds the keyboard (the owner, 2026-10-17, issue #65). */}
      {on.plate === undefined ? null : (
        <Box key="to-plate" flexShrink={0} marginBottom={1}>
          <Button key="plate" label="←" onPress={on.plate} />
        </Box>
      )}
      {/* The body takes what the rest leaves and clips there: a Client cannot shrink, and one
          sized to the whole pane pushed the comment and the footer below the fold (issue #65). */}
      {composed === null ? (
        <Box key="body-slot" flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden">
          {body}
        </Box>
      ) : (
        // A composed item (#97): the body keeps the dots and the ask, and the card the hooks draw
        // takes what the rest leaves, so the comment and the footer stay at the foot of the pane.
        <Box key="body-slot" flexShrink={0}>
          {body}
        </Box>
      )}
      {composed === null ? null : (
        <Box key="composed-slot" flexDirection="column" flexShrink={0}>
          {composed}
        </Box>
      )}
      {/* What the item shows, which the body's Client cannot draw: a bitmap draws only in a plain Svg (issue 87). */}
      {pictures}

      {card.resting ? (
        <Box key="comment-row" borderStyle="round" borderColor={PALETTE.rest} backgroundColor={PALETTE.fill} paddingX={1} flexShrink={0}>
          {comment}
        </Box>
      ) : (
        <Box key="comment-row" flexShrink={0}>
          {comment}
        </Box>
      )}

      <Box key="footer" flexDirection="row" justifyContent="space-between" alignItems="center" flexShrink={0}>
        <Box key="choices" flexDirection="row" alignItems="center" columnGap={1}>
          {/* At either end the step that cannot move is drawn dim, as a native app dims an action that cannot act. */}
          {plain ? null : <Button key="back" hotkey="a" label="◀" dimColor={card.index <= 1} onPress={on.back} />}
          {plain ? null : <Button key="no" hotkey="s" label="No" onPress={on.no} />}
          <Button key="yes" hotkey="w" label={plain ? 'Done' : 'Yes'} onPress={on.yes} />
          {plain ? null : <Button key="next" hotkey="d" label="▶" dimColor={card.index >= card.items.length} onPress={on.next} />}
        </Box>
        {rSubmits(card) ? (
          // White only once every item is answered (the owner, 2026-10-17); the standard grey until then.
          <Button key="r" hotkey="r" variant={card.items.every(one => one.verdict !== null) ? 'primary' : 'secondary'} label="Submit" onPress={on.r} />
        ) : null}
      </Box>
    </Box>
  )
}
