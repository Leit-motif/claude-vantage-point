// The palette's broken Client (`/vantage-point palette`, page Pointer): a click
// starts a render loop, a setState on every render with nothing between, so a
// shot shows what the desktop draws once the engine unmounts a Client for it.
import type { ClientModule } from 'claude-code'

type Fault = { looping: boolean; renders: number }

const Fault: ClientModule<null, Fault> = (_props, surface) => {
  if (surface.state === undefined) {
    surface.onPointer(e => {
      if (e.type === 'up') surface.setState({ looping: true, renders: 0 })
    })
    surface.setState({ looping: false, renders: 0 })
  }
  const fault = surface.state ?? { looping: false, renders: 0 }
  if (fault.looping) surface.setState({ looping: true, renders: fault.renders + 1 })
  const { Box, Text } = surface.elements

  return (
    <Box key="fault-region" borderStyle="round" paddingX={1}>
      <Text dimColor={!fault.looping}>
        {fault.looping ? `looping, render ${fault.renders}` : 'Click here to start a render loop: the engine unmounts this Client.'}
      </Text>
    </Box>
  )
}

export default Fault
