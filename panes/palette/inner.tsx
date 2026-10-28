// One element a Client may draw (`/vantage-point palette`, page Pointer), one
// Client each, so the desktop refusing one leaves the others drawn: a refused
// Client draws a dim line naming its module in its place. The page names each
// in its own column, from the hooks, so a refused one is still named.
import type { ClientModule } from 'claude-code'

export type InnerProps = { kind: 'button' | 'select' | 'link' | 'markdown' | 'code' }

const Inner: ClientModule<InnerProps, string> = (props, surface) => {
  const { Box, Text, Button, Select, Link, Markdown, Code } = surface.elements
  const said = surface.state ?? ''
  const picked = said.startsWith('picked ') ? said.slice('picked '.length) : 'one'
  const element =
    props.kind === 'button' ? (
      <Button key="inner-button" label="Client Button" onPress={() => surface.setState('pressed')} />
    ) : props.kind === 'select' ? (
      <Select key="inner-select" options={[{ value: 'one' }, { value: 'two' }]} value={picked} onSelect={value => surface.setState(`picked ${value}`)} />
    ) : props.kind === 'link' ? (
      <Link href="https://github.com/Leit-motif/claude-vantage-point" label="a Link in a Client" />
    ) : props.kind === 'markdown' ? (
      <Markdown key="inner-markdown" text="**Markdown** and `code` in a Client" />
    ) : (
      <Code key="inner-code" source="const inside = 'a Client'" language="typescript" />
    )
  return (
    <Box key={`inner-${props.kind}`} flexDirection="row" columnGap={2} alignItems="center">
      {element}
      {said === '' ? null : <Text dimColor>{said}</Text>}
    </Box>
  )
}

export default Inner
