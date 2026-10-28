// The palette's pointer specimen (`/vantage-point palette`, page Pointer): a region
// that writes down each pointer event and key it hears, with the cell under it,
// so a shot of the desktop shows what a Client gets there. Moves in a row fold
// into one line, and the log always draws its eight lines, so the region keeps
// one height. Its frame clock counts seconds, and an `up` is posted to the hooks.
import type { ClientModule, ClientPointerEvent } from 'claude-code'

export type PointerProps = {
  /** The region's outline (hooks/signal.ts). */
  line: string
}

type Heard = { lines: string[]; at: string; ticks: number }

/** Lines of the log the region keeps, newest first. */
const KEPT = 8

const said = (e: ClientPointerEvent) =>
  [
    e.type,
    `${e.x},${e.y}`,
    e.button,
    e.fine === undefined ? undefined : `fine ${e.fine.x.toFixed(2)},${e.fine.y.toFixed(2)}`,
    e.shift ? 'shift' : undefined,
    e.alt ? 'alt' : undefined,
    e.ctrl ? 'ctrl' : undefined,
  ]
    .filter(part => part !== undefined)
    .join(' ')

const MOVES = /^move ×(\d+) /

const Pointer: ClientModule<PointerProps, Heard> = (props, surface) => {
  const heard = () => surface.state ?? { lines: [], at: '—', ticks: 0 }
  const write = (line: string, at = heard().at) => {
    const { lines, ticks } = heard()
    const last = lines[0] ?? ''
    // A move after a move replaces it, counting how many there were.
    const isMove = line.startsWith('move ')
    const folded = isMove && last.startsWith('move ')
    const count = folded ? Number(MOVES.exec(last)?.[1] ?? 1) + 1 : 1
    const entry = isMove ? `move ×${count} ${line.slice(5)}` : line
    surface.setState({ lines: [entry, ...(folded ? lines.slice(1) : lines)].slice(0, KEPT), at, ticks })
  }
  if (surface.state === undefined) {
    surface.onPointer(e => {
      write(said(e), `${e.x},${e.y}`)
      if (e.type === 'up') surface.post({ up: `${e.x},${e.y}` })
    })
    surface.onKey(e => write(['key', e.key, e.shift ? 'shift' : '', e.ctrl ? 'ctrl' : '', e.meta ? 'meta' : ''].filter(Boolean).join(' ')))
    surface.every(1000, () => surface.setState({ ...heard(), ticks: heard().ticks + 1 }))
    surface.setState(heard())
  }
  const { Box, Text } = surface.elements
  const { lines, at, ticks } = heard()

  return (
    <Box key="pointer-region" flexDirection="column" width="100%" height="100%" borderStyle="round" borderColor={props.line} paddingX={1}>
      <Text key="pointer-size">{`${surface.columns}×${surface.rows} cells · last cell ${at} · every(1000) ${ticks}`}</Text>
      {(lines.length === 0 ? ['Point, press, drag and type here.'] : lines)
        .concat(Array.from({ length: KEPT }, () => '\u00a0'))
        .slice(0, KEPT)
        .map((line, i) => (
          <Text key={`heard-${i}`} dimColor={i > 0 || lines.length === 0} wrap="truncate-end">
            {line}
          </Text>
        ))}
    </Box>
  )
}

export default Pointer
