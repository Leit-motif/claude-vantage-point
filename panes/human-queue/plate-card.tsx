// One row on the queue's overview (the plate, issues #47 and 69): an ask in the
// band's row grammar, a ticket's number, its title in full and how long ago it
// was opened. Every ask is its own row, so any ask opens straight from the
// plate, never only a repo's next one. The same row draws the Next row (issue
// 71), one ask with the amber dot and a dim facts line under it, and a group's
// "N more", which opens the first ask it stands for. It is a surface module so
// the whole row is a click target wherever it lands: a Box takes no click
// (docs/palette.md). A click opens its ask through the hooks' `ui.message`.
// The hooks draw the fill that lifts the row under the pointer, since inside a
// Client a Box's hover draws nothing.
import type { ClientModule } from 'claude-code'

export type PlateAsk = {
  /** The request's qualified id, the one a click opens. */
  qid: string
  /** The ticket's number (`#221`), or the file request's (`0003`). */
  id: string
  title: string
  /** How long ago it was opened (`today`, `3d`, `2w`), empty when unknown (issue #65). */
  age: string
  /** Its `Opened:` date (`2026-10-02 by …`), which picks the Next row (issue 71). */
  opened?: string | null
}

export type PlateCardProps = {
  /** The ask this row draws and opens; a "N more" row's title is its count. */
  ask: PlateAsk
  /** Its age's colour, one salience step at a time (issue 69). */
  tone: string
  /** The title's step: white for a repo's next ask, dim for the asks after it, quiet for "N more". */
  title: 'white' | 'dim' | 'quiet'
  /** Cells the number column takes, the widest number's, so every title starts on one edge. */
  idWidth: number
  /** Cells the age column takes at least, the widest age's; it grows to its text rather than wrap. 0 with none. */
  ageWidth: number
  /** What waits on the person: the Next row's amber dot alone (issue 71), null on every other row. */
  dot: string | null
  /** The Next row's facts line, drawn under its ask. */
  facts?: string
  /** Text that needs no eye: the numbers, "N more". */
  quiet: string
}

const PlateCard: ClientModule<PlateCardProps, true> = (props, surface) => {
  // A press is a left button going down and coming up inside the row, so a drag
  // that leaves it opens nothing.
  if (surface.state === undefined) {
    let pressed = false
    const inside = (x: number, y: number) => surface.columns === 0 || (x >= 0 && y >= 0 && x < surface.columns && y < surface.rows)
    surface.onPointer(event => {
      const left = event.button === undefined || event.button === 'left'
      if (event.type === 'down') pressed = left && inside(event.x, event.y)
      if (event.type !== 'up') return
      if (pressed && left && inside(event.x, event.y)) surface.post({ open: true })
      pressed = false
    })
    surface.setState(true)
  }
  const { Box, Text } = surface.elements
  const { ask } = props

  return (
    <Box key="row" flexDirection="column" width="100%">
      <Box key="ask" flexDirection="row" columnGap={1}>
        {/* The Next row's dot, as the band marks what waits on you; every other row keeps its cell so titles share an edge. */}
        <Box width={1} flexShrink={0}>
          {props.dot !== null ? <Text color={props.dot}>●</Text> : null}
        </Box>
        <Box width={props.idWidth} flexShrink={0}>
          <Text color={props.quiet}>{ask.id}</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          {props.title === 'quiet' ? (
            <Text color={props.quiet}>{ask.title}</Text>
          ) : (
            <Text dimColor={props.title === 'dim'} wrap="wrap">
              {ask.title}
            </Text>
          )}
        </Box>
        {/* Its age at the trailing edge, as a mail list dates its rows. A minimum, not a width: a proportional "2w" is wider than two cells and wrapped in one. */}
        {props.ageWidth === 0 ? null : (
          <Box minWidth={props.ageWidth} flexShrink={0} justifyContent="flex-end">
            <Text color={props.tone}>{ask.age}</Text>
          </Box>
        )}
      </Box>
      {props.facts === undefined ? null : (
        <Box key="facts" flexDirection="row" columnGap={1}>
          <Box width={1} flexShrink={0} />
          <Box width={props.idWidth} flexShrink={0} />
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text dimColor wrap="truncate-end">
              {props.facts}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}

export default PlateCard
