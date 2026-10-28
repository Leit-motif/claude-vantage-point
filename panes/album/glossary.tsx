// The mock album's "tap a term" page (`/vantage-point album`): the names an item
// leans on, each a press that shows its one-line meaning beneath, so the card
// carries no definitions until one is wanted. A Client, since only a Client's
// state redraws its own region without a round trip through the hooks.
import type { ClientModule } from 'claude-code'

export type GlossaryProps = { terms: readonly { term: string; means: string }[] }

const Glossary: ClientModule<GlossaryProps, string> = (props, surface) => {
  const { Box, Text, Button } = surface.elements
  const open = surface.state ?? ''
  const picked = props.terms.find(one => one.term === open)
  return (
    <Box key="glossary" flexDirection="column">
      <Box key="terms" flexDirection="row" columnGap={2} flexWrap="wrap" alignItems="center">
        {/* Named, so the presses read as words to look up and never as a sequence (the design review, 2026-10-23). */}
        <Text key="what" dimColor>
          Terms:
        </Text>
        {props.terms.map(one => (
          <Button key={`term-${one.term}`} plain dimColor={one.term !== open} label={one.term === open ? `${one.term} ▾` : one.term} onPress={() => surface.setState(one.term === open ? '' : one.term)} />
        ))}
      </Box>
      {picked === undefined ? null : <Text key="means">{picked.means}</Text>}
    </Box>
  )
}

export default Glossary
