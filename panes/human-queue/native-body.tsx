// The native item card's body (issue #45): the row of dots, the ask and its
// lead-in, and the item's card, filling the pane down to the comment field. It
// is a surface module so a click anywhere on it gives the pane the keyboard:
// a click on plain Box or Text does not, and the Buttons' W, S and R then reach
// the message box instead (the owner, 2026-10-17). Once clicked, the game keys
// are posted to the hooks module, which maps them to the card's actions. The
// item's Markdown arrives as blocks (./markdown.ts) and is drawn here with Box
// and Text, since the desktop refuses its Markdown element inside a Client
// (issue 79).
import type { ClientElements, ClientModule, RenderChildren } from 'claude-code'
import type { Block, Run } from './markdown.ts'

export type BodyProps = {
  /** One dot per item, in its colour; the one at `current` is drawn hollow (◎), so the place shows whatever its state. Empty for a plain ask. */
  dots: string[]
  /** 1-based. */
  current: number
  /** Empty over a composed item, which draws no ask block. */
  title: string
  /** Where the rulings go, and the ask's place among several. */
  source: string
  /** The request's lead-in, dim over the item; empty when it has none. */
  setup: string
  /** The item's name over its text, whole and bold: its question; null when its number already says it, or the hooks draw the item (#97). */
  heading: string | null
  /** The item's Markdown, parsed. */
  blocks: Block[]
  /** The engine draws Text's `mono` (2.1.299 on); an older one refuses the whole tree over it. */
  mono: boolean
  /** The card's outline and fill, and a fenced block's fill (hooks/signal.ts). */
  line: string
  fill: string
  well: string
}

/** Cells a list level steps in. */
const INDENT = 2

const KEYS = 'wasdqer'

const Body: ClientModule<BodyProps, true> = (props, surface) => {
  if (surface.state === undefined) {
    surface.onKey(event => {
      const key = event.key.toLowerCase()
      if (key.length === 1 && KEYS.includes(key) && event.ctrl !== true && event.meta !== true) surface.post({ key })
    })
    surface.setState(true)
  }
  const { Box, Text } = surface.elements

  return (
    <Box key="body" flexDirection="column" width="100%" height="100%" gap={1}>
      {props.dots.length === 0 ? null : (
        <Box key="strip" flexDirection="row" columnGap={1} flexShrink={0}>
          {props.dots.map((color, i) => (
            <Box key={`strip-${i + 1}`}>
              <Text color={color}>{i + 1 === props.current ? '◎' : '●'}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* On the page's left edge; the request's title regular, so the question below is the first bold line (the design review, 2026-10-24).
          Empty over a composed item, whose card is its question and pictures alone (#105). */}
      {props.title === '' ? null : <Box key="ask" flexDirection="column" flexShrink={0}>
        <Text wrap="wrap">{props.title}</Text>
        <Text dimColor wrap="truncate-end">{props.source}</Text>
        {props.setup === '' ? null : (
          <Box key="setup" marginTop={1}>
            <Text dimColor wrap="wrap">
              {props.setup}
            </Text>
          </Box>
        )}
      </Box>}

      {/* A composed item (#97) draws its card in the hooks, under this body, so the body draws no item frame. */}
      {props.heading === null && props.blocks.length === 0 ? null : <Box
        key="item"
        width="100%"
        flexDirection="column"
        flexShrink={1}
        minHeight={0}
        overflow="hidden"
        borderStyle="round"
        borderColor={props.line}
        backgroundColor={props.fill}
        paddingX={1}
        rowGap={1}
      >
        {/* The heading is the question being ruled on, so it wraps whole: cut to one line, the person could not read what they rule (the owner, 2026-10-23). */}
        {props.heading === null ? null : (
          <Text key="heading" bold wrap="wrap">
            {props.heading}
          </Text>
        )}
        <Box key="text" flexDirection="column">
          {props.blocks.map((block, i) => drawBlock(Box, Text, block, `md-${i}`, props, i > 0 && !(block.kind === 'item' && props.blocks[i - 1]!.kind === 'item')))}
        </Box>
      </Box>}
    </Box>
  )
}

/** A paragraph's runs; inline code sits on the fence's well, so a short span reads as code, not prose. */
/** The closing `Refs:` line names what the prose explained (the ask skill), so it steps back to dim. */
const REFS = /^Refs:/

function line(Text: ClientElements['Text'], runs: Run[], key: string, props: BodyProps, heading = false): RenderChildren {
  return (
    <Text key={key} wrap="wrap" bold={heading || undefined} dimColor={REFS.test(runs[0]?.text ?? '') || undefined}>
      {runs.map((run, i) =>
        run.bold === undefined && run.italic === undefined && run.code === undefined ? (
          run.text
        ) : (
          <Text key={`${key}-${i}`} bold={run.bold} italic={run.italic} {...(run.code ? { backgroundColor: props.well, ...(props.mono ? { mono: true } : {}) } : {})}>
            {run.text}
          </Text>
        ),
      )}
    </Text>
  )
}

/** `apart` sets a block a row below the one before, as a blank line does; a list's items stay together. */
function drawBlock(Box: ClientElements['Box'], Text: ClientElements['Text'], block: Block, key: string, props: BodyProps, apart: boolean): RenderChildren {
  const inset = block.depth * INDENT
  const top = apart ? 1 : 0
  if (block.kind === 'code') {
    return (
      <Box key={key} flexDirection="column" marginLeft={inset} marginTop={top} backgroundColor={props.well} paddingX={1}>
        {block.lines.map((code, i) => (
          <Text key={`${key}-${i}`} wrap="wrap" {...(props.mono ? { mono: true } : {})}>
            {code === '' ? ' ' : code}
          </Text>
        ))}
      </Box>
    )
  }
  if (block.kind === 'item') {
    return (
      <Box key={key} flexDirection="row" marginLeft={inset} marginTop={top} columnGap={1}>
        <Box key={`${key}-mark`} flexShrink={0}>
          <Text dimColor>{block.marker}</Text>
        </Box>
        <Box key={`${key}-runs`} flexShrink={1}>
          {line(Text, block.runs, `${key}-text`, props)}
        </Box>
      </Box>
    )
  }
  return (
    <Box key={key} marginLeft={inset} marginTop={top}>
      {line(Text, block.runs, `${key}-text`, props, block.kind === 'heading')}
    </Box>
  )
}

export default Body
