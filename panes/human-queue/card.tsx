// The item card on the desktop: draws the item and turns the mouse's middle
// button (comment) and the game keys (once a click has focused the card) into
// posts the hooks module maps to actions. The pane's Button hotkeys cover the
// keys without a click.
import type { ClientModule } from 'claude-code'

export type CardProps = { text: string }

const KEYS = 'wasdeqr'

const Card: ClientModule<CardProps, true> = (props, surface) => {
  if (surface.state === undefined) {
    surface.onPointer(event => {
      if (event.type === 'down' && event.button === 'middle') surface.post({ act: 'comment' })
    })
    surface.onKey(event => {
      const key = event.key.toLowerCase()
      if (key.length === 1 && KEYS.includes(key) && event.ctrl !== true && event.meta !== true) {
        surface.post({ key })
      }
    })
    surface.setState(true)
  }
  const { Markdown } = surface.elements

  return <Markdown text={props.text === '' ? '_(empty item)_' : props.text} />
}

export default Card
