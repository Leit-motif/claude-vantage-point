// The native item card's saved comment at rest (issue #45): wrapped across the
// field, at most six lines, so a long comment never pushes the item it rules on
// away. The desktop's Input is one line, so the hooks draw the Input itself
// while you type, straight in the pane, where it fills its slot as the picture
// card's does; a click here asks for it back.
import type { ClientModule } from 'claude-code'

export type CommentProps = {
  /** The comment as stored. */
  text: string
}

/** Characters of the pane's text one cell holds, measured off the desktop (2026-10-17). */
const CHARS_PER_CELL = 1.4

const Comment: ClientModule<CommentProps, true> = (props, surface) => {
  if (surface.state === undefined) {
    surface.onPointer(event => {
      if (event.type === 'up') surface.post({ edit: true })
    })
    surface.setState(true)
  }
  const { Box, Text } = surface.elements
  const room = Math.floor(surface.columns * CHARS_PER_CELL * 6)
  const text = room > 0 && props.text.length > room ? `${props.text.slice(0, room - 1).trimEnd()}…` : props.text
  return (
    <Box key="comment-text" width="100%">
      <Text wrap="wrap">{text}</Text>
    </Box>
  )
}

export default Comment
