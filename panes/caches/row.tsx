// One cache's title and facts in the Caches pane, drawn as a surface module so a click
// anywhere on them opens the cache's desktop session (issue #62): a Box takes no click
// (docs/palette.md). The hooks draw the row's marker and the TTL bar around it, since a Client draws no
// Svg, and the fill that lifts the row under the pointer, since a Box's hover inside a Client
// draws nothing. They draw a row whose session the desktop does not know without this module,
// so it neither lifts nor takes a click. Each click goes to the hooks, which time it: one click
// expands the row's card, two close together open its session. The desktop reports no double
// click and no time with a pointer event, and the hooks hold a clock.
import type { ClientModule } from 'claude-code'
import { fitFacts } from './caches.ts'

/** Characters of the dim facts line a cell holds on the desktop, as the band measured it (docs/palette.md); the row cuts a fact that overruns rather than wrap. */
const CHARS_PER_CELL = 1.3

export type CacheRowProps = {
  title: string
  /** `46m`, `40s`, `cold`. */
  left: string
  /** The state's colour, for the minutes. */
  tone: string
  /** Most telling first; the row draws as many whole as fit. */
  facts: string[]
  /** A cold cache's title steps back. */
  cold: boolean
  /** Keep warm is armed: a lit 🔥 before the minutes; nothing while off. */
  warm: boolean
}

const CacheRow: ClientModule<CacheRowProps, true> = (props, surface) => {
  // A click is a left button going down and coming up inside the row, so a drag that leaves it
  // counts for nothing.
  if (surface.state === undefined) {
    let pressed = false
    const inside = (x: number, y: number) => surface.columns === 0 || (x >= 0 && y >= 0 && x < surface.columns && y < surface.rows)
    surface.onPointer(event => {
      const left = event.button === undefined || event.button === 'left'
      if (event.type === 'down') pressed = left && inside(event.x, event.y)
      if (event.type !== 'up') return
      if (pressed && left && inside(event.x, event.y)) surface.post({ click: true })
      pressed = false
    })
    surface.setState(true)
  }
  const { Box, Text } = surface.elements
  return (
    <Box key="row" flexDirection="column" width="100%">
      <Box key="title" flexDirection="row" columnGap={1}>
        {/* minWidth 0 lets a long title cut at the column's edge instead of widening it. */}
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text wrap="truncate-end" dimColor={props.cold}>{props.title}</Text>
        </Box>
        {/* The minutes never shrink, so a long title cuts rather than stacking them a letter a line. */}
        <Box flexShrink={0}>
          <Text color={props.tone}>{props.warm ? `🔥 ${props.left}` : props.left}</Text>
        </Box>
      </Box>
      <Text key="facts" dimColor wrap="truncate-end">{surface.columns > 0 ? fitFacts(props.facts, Math.floor(surface.columns * CHARS_PER_CELL)) : props.facts.join(' · ')}</Text>
    </Box>
  )
}

export default CacheRow
