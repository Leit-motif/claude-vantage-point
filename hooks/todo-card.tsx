// The to-do card (#147, ADR 0051): an issue labelled ready-for-human with
// nothing that stands alone to rule on, drawn in the item card's frame so the
// two read as one family. The body is the same surface module (native-body.tsx):
// the issue's title, where it lives, then why it needs a person dim in the
// lead-in's place, and the frame holds the brief's acceptance criteria as the
// agent card draws its steps, a dim dot each and a met one's text dim. The
// brief's summary is not drawn: it restates the title by design. With no brief
// the frame holds the body's opening. One gap under it, on the footer's
// leading edge, the two acts: Hand to agent and Done, the desktop's plain
// buttons, since neither is the white act that ends a ruling. Never takes `$`:
// register.tsx hands it the elements, the presses and the body.
import type { BoxProps, ButtonProps, ElementConstructor, MarkdownProps, RenderChildren, RenderElement, TextProps } from 'claude-code'
import type { HumanQueueTodo } from '../types'
import { blocks, runs, type Block } from '../panes/human-queue/markdown'
import type { BodyProps } from '../panes/human-queue/native-body'
import { PALETTE } from './native-card'

export type TodoCard = {
  /** Where the issue lives: `my-app#45`. */
  source: string
  title: string
  /** Absent on an ask held from before #147, until it is read again: the card draws its title alone. */
  todo: HumanQueueTodo | undefined
  /** The pane's height in rows of text and its width in cells: the criteria that fit are drawn, and a count says how many more. */
  rows: number
  columns: number
  mono: boolean
}

type Press = ButtonProps['onPress']
export type TodoPresses = { agent: Press; done: Press; plate?: Press }

/** A criterion's mark, the agent card's step dot (GLOSSARY "Steps"); the Body draws it dim. */
const DOT = '●'

/** The rows a line of text wraps to across `cells` of 7.8pt, at about 6.5pt a character: body text measured in the card lab's calibrated pane, a little wide of it. */
const rowsOf = (text: string, cells: number) => Math.max(1, Math.ceil((text.length * 6.5) / Math.max(140, cells * 7.8)))

/**
 * How many rows of the pane the criteria may take: what the back arrow, the
 * title and source, the reason, the frame's edges and the footer leave, each
 * step down inside the body a whole row (docs/palette.md), and one to spare.
 */
function criteriaRows(card: TodoCard): number {
  const reason = card.todo?.brief?.reason ?? ''
  const fixed = 3 + rowsOf(card.title, card.columns - 2) + 1 + (reason === '' ? 0 : 1 + rowsOf(reason, card.columns - 2)) + 3 + 2 + 1
  return card.rows - fixed
}

/** What the body's frame holds: the criteria that fit, then how many more the issue has; else the body's opening. */
function frameOf(card: TodoCard): Block[] {
  const todo = card.todo
  if (todo === undefined) return []
  if (todo.brief === null) return todo.opening === '' ? [] : blocks(todo.opening)
  const all = todo.brief.criteria
  const cells = card.columns - 8
  const room = criteriaRows(card)
  const lines = all.map(one => rowsOf(one.text, cells))
  let shown = all.length
  // The note that ends a cut list costs two rows, its gap and its line, so a list cuts only past them.
  if (lines.reduce((sum, n) => sum + n, 0) > room + 2) {
    shown = 0
    for (let used = lines[0] ?? 0; shown < all.length && used <= room; used += lines[++shown] ?? 0);
  }
  const items: Block[] = all.slice(0, shown).map(one => ({ kind: 'item', depth: 0, marker: DOT, runs: runs(one.text), ...(one.done ? { dim: true as const } : {}) }))
  const more = all.length - shown
  return more === 0 ? items : [...items, { kind: 'para', depth: 0, runs: [{ text: `${more} more on the issue` }], dim: true }]
}

/** What the card's body draws, as the item card's surface module takes it. */
export function todoBodyProps(card: TodoCard): BodyProps {
  return {
    dots: [],
    current: 1,
    title: card.title,
    source: card.source,
    setup: card.todo?.brief?.reason ?? '',
    heading: null,
    blocks: frameOf(card),
    mono: card.mono,
    line: PALETTE.card,
    fill: PALETTE.fill,
    well: PALETTE.card,
  }
}

/** The body where no surface module draws (the phone, VS Code): the same lines, the frame's as Markdown. */
export function todoFallback(
  el: { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps>; Markdown: ElementConstructor<MarkdownProps> },
  card: TodoCard,
): RenderElement {
  const { Box, Text, Markdown } = el
  const reason = card.todo?.brief?.reason ?? ''
  const brief = card.todo?.brief ?? null
  const frame =
    card.todo === undefined
      ? ''
      : brief === null
        ? card.todo.opening
        : brief.criteria.map(one => `- ${one.text}`).join('\n')
  return (
    <Box key="body" flexDirection="column" gap={1}>
      <Box key="ask" flexDirection="column">
        <Text wrap="wrap">{card.title}</Text>
        <Text dimColor wrap="truncate-end">{card.source}</Text>
      </Box>
      {reason === '' ? null : <Text key="setup" dimColor wrap="wrap">{reason}</Text>}
      {frame.trim() === '' ? null : <Markdown key="frame" text={frame} />}
    </Box>
  )
}

export function todoCard(el: { Box: ElementConstructor<BoxProps>; Button: ElementConstructor<ButtonProps> }, card: TodoCard, on: TodoPresses, body: RenderChildren): RenderElement {
  const { Box, Button } = el
  return (
    // The card runs to its own height, its buttons one gap under the brief, as the composed item card does (#105).
    <Box key="todo" flexDirection="column" gap={1}>
      {on.plate === undefined ? null : (
        <Box key="to-plate" flexShrink={0} marginBottom={1}>
          <Button key="plate" label="←" onPress={on.plate} />
        </Box>
      )}
      {/* A Client cannot shrink, so the criteria are cut to fit before they are drawn (frameOf). */}
      <Box key="body-slot" flexShrink={0}>
        {body}
      </Box>
      <Box key="footer" flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
        <Button key="agent" label="Hand to agent" onPress={on.agent} />
        <Button key="close" label="Done" onPress={on.done} />
      </Box>
    </Box>
  )
}
