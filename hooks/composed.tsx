// The composed item card (#97, #102, #105): an item with facts drawn as its plan
// says. The question, bold and whole; then at most two pictures, the catalog's
// tiles (panes/visuals/page.ts) and the item's own images together; then a row
// with the prose one press away and, on hover, the dim line that names each
// tile's score. Nothing else: no so-what, no why line, no answers box (the
// owner, 2026-10-26). A Client cannot draw an Svg, so the hooks draw all of it,
// under the card's body. The deck keeps its own page (`deckPictures`). Never
// takes `$`: register.tsx hands it the elements, the plan, the presses and the
// glossary's Client, whose module path must sit in register.tsx's own source.
import type {
  BoxProps,
  ButtonProps,
  ElementConstructor,
  LinkProps,
  MarkdownProps,
  RenderChildren,
  RenderElement,
  SelectProps,
  SvgProps,
  TextProps,
} from 'claude-code'
import { TECHNIQUES, type TileSize } from '../panes/visuals/catalog'
import { card, type Plan, type Surface } from '../panes/visuals/compose'
import { DRAWN_VIEWS, drawsWhole, PICTURES, threshold, type Picture } from '../panes/visuals/draw'
import { QUESTIONS, type Facts, type Question } from '../panes/visuals/facts'
import { CARD_CAP, explainPage, MAX_TEXT_TILES, MAX_TILES, page, type Cap, type Tile } from '../panes/visuals/page'
import { CARD_LINE, FILL, SIGNAL_YELLOW } from './signal'
import { deckViews, NOT_ON_DECK } from './deck'
import { views, type Views } from './views'

type F = Required<Facts>

export type ComposedElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Svg: ElementConstructor<SvgProps>
  Link: ElementConstructor<LinkProps>
  Markdown: ElementConstructor<MarkdownProps>
  /** The desktop's picker; the phone has none, and no view it draws needs one. */
  Select?: ElementConstructor<SelectProps>
}

/** What a drawing reads: the item's facts and question, the card's width, the what-if scope, and the presses. */
type Kit = {
  el: ComposedElements
  v: Views
  facts: F
  question: string
  /** The card's inner width in CSS pixels. */
  room: number
  /** The threshold value the what-if picker raises, by index. */
  scope: number
  /** The card carries the what-if picker, which re-scopes the threshold picture. */
  scoped: boolean
  /** The card's lead, which the what-if picker re-scopes when it is the threshold. */
  lead: string | undefined
  pick: (scope: number) => void
  glossary: ((terms: F['terms']) => RenderElement) | null
  /** A picture on the card already draws a dollar figure, so the answer rows leave their costs out. */
  costShown: boolean
  /** The tile takes the page's whole width, so a two-sided tile sets its sides side by side. */
  wide: boolean
}

const pic = (k: Kit, p: Picture, live = false) => <k.el.Svg source={p.source} alt={p.alt} width={p.width} height={p.height} {...(live ? { isInteractive: true } : {})} />

/**
 * Every catalog view a composed card can draw, by id: the one map from a view to
 * its drawing. A view missing here is never put on a card; the sequence is drawn
 * by Mermaid ahead of time, so no item's facts can draw it yet. `type` is the
 * text card's base layer: the question and the answers, which are drawn anyway.
 */
/** A view's picture for this card. The what-if starts on every value (scope -1), so the picture opens on the whole case. */
const pictureOf = (id: string, k: Kit): Picture | undefined =>
  PICTURES[id]?.({ facts: k.facts, question: k.question, room: k.room, ...(k.scoped && k.scope >= 0 ? { lit: k.scope } : {}), ...(k.lead === undefined ? {} : { lead: k.lead }) })

const DRAW: Record<string, (k: Kit) => RenderChildren> = {
  answers: k => k.v.answers(k.facts.answers, k.costShown),
  outcomes: k => k.v.outcomes(k.facts.answers),
  tiles: k => k.v.tiles(k.facts.figures),
  ...Object.fromEntries(Object.keys(PICTURES).map(id => [id, (k: Kit) => pic(k, pictureOf(id, k)!, id === 'flow-live')])),
  'what-if': k => {
    const values = k.facts.threshold.values
    const picker =
      k.el.Select === undefined ? null : (
        <k.el.Select
          key="scope"
          label="Highlight"
          options={[{ value: '-1', label: 'every bar' }, ...values.map((one, i) => ({ value: String(i), label: one.label }))]}
          value={String(k.scope)}
          onSelect={value => k.pick(Number(value))}
        />
      )
    // Over the lead's own threshold it re-scopes that picture; under another lead it brings its own.
    return k.lead === 'threshold' ? picker : [picker, <k.el.Box key="scoped">{pic(k, threshold(k.facts.threshold, k.room, k.scope >= 0 ? k.scope : undefined))}</k.el.Box>]
  },
  ledger: k => k.v.ledger(k.facts.comparison, false),
  table: k => k.v.table(k.facts.comparison),
  sources: k => k.v.sources(k.facts.sources),
  // Only the terms the card itself says: a term the reader never meets on it explains nothing (the design review, 2026-10-23).
  glossary: k => {
    const said = JSON.stringify([k.question, k.facts.answers, k.facts.comparison, k.facts.flow, k.facts.steps, k.facts.figures]).toLowerCase()
    const terms = k.facts.terms.filter(one => said.includes(one.term.toLowerCase()))
    return terms.length === 0 ? null : (k.glossary?.(terms) ?? null)
  },
  reveal: k => k.v.reveal(k.facts.terms[0]!),
  type: () => null,
  evidence: k => k.v.evidence(k.facts.evidence, k.facts.answers?.recommend),
  impact: k => k.v.impact(k.facts.impact, k.facts.answers?.recommend, k.wide),
  tradeoffs: k => k.v.tradeoffs(k.facts.tradeoffs, k.wide),
  gotchas: k => k.v.gotchas(k.facts.gotchas),
  precedent: k => k.v.precedent(k.facts.precedent),
  touches: k => k.v.touches(k.facts.touches),
}

/** The plan less the views nothing here draws, so `card` never picks one that would draw nothing. */
export function drawable(p: Plan): Plan {
  return { ...p, views: p.views.filter(one => DRAWN_VIEWS.has(one.view)), answers: p.answers.filter(id => DRAWN_VIEWS.has(id)) }
}

const slotOf = (id: string) => TECHNIQUES.find(one => one.id === id)?.slot

export type ComposedInput = {
  plan: Plan
  surface: Surface
  facts: Facts
  /** The item's question; null when its heading is only its number. */
  question: string | null
  /** The item's prose, drawn in place of the lead and support while it is open. */
  prose: string
  proseOpen: boolean
  room: number
  scope: number
  newProps: boolean
  /** The item's own images, drawn after the tiles; each takes one of the card's two pictures. */
  images?: { count: number; node: RenderElement } | null
  /** A control that sits beside Full text, as the images' Full size does. */
  beside?: RenderElement | null
}

/** A row of the desktop's text is about 19pt, a character about 7pt (docs/palette.md). */
const ROW_PT = 19
const textRows = (text: string, room: number) => Math.max(1, Math.ceil((text.length * 7) / Math.max(70, room)))
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

/** A tile's frame and head take this much of its width (a cell of padding each side and the border), and these rows. */
const TILE_INSET_PX = 26
const TILE_FRAME_ROWS = 2
/** The gap between two half tiles, in pixels: one cell. */
const HALF_GAP_PX = 10
/**
 * A Box's width cell, in points: a frame 32 cells wide drew 282pt in the shot of
 * EXP-023 (#103). 10.2pt, read off a body column count a pop-out had skewed,
 * built frames too narrow, and the desktop scaled their pictures down to fit.
 */
const CELL_PT = 8.8

/** The width a tile's content fills at a size, from the page's width. */
const tileRoom = (room: number, size: TileSize) => Math.floor((size === 'wide' ? room : (room - HALF_GAP_PX) / 2) - TILE_INSET_PX)

/** About how many rows a view's content takes in `room` pixels: an Svg's own height for a picture, else counted from its facts. */
function contentRows(id: string, k: Kit): number {
  const picture = pictureOf(id, k)
  if (picture !== undefined) return Math.ceil(picture.height / ROW_PT)
  const f = k.facts
  const col = k.wide ? (k.room - 20) / 2 : k.room
  switch (id) {
    case 'answers':
    case 'outcomes':
      // A deck's call carries no answers fact: its options are its answers.
      if (f.answers === undefined) return 0
      return sum((['yes', 'no'] as const).map(which => textRows(f.answers[which].map(c => c.does).join('; '), k.room - 60))) * (id === 'outcomes' ? 2 : 1)
    case 'evidence':
      return sum(f.evidence.map(one => 1 + textRows(one.says, k.room - 20))) + f.evidence.length - 1
    case 'impact': {
      const side = (which: 'yes' | 'no') => 1 + sum(f.impact[which].map(one => textRows(one.what, col - 20) + (one.undo === undefined ? 0 : textRows(`Undo: ${one.undo}`, col - 20))))
      return k.wide ? Math.max(side('yes'), side('no')) : side('yes') + side('no') + 1
    }
    case 'tradeoffs': {
      const side = (lines: string[]) => sum(lines.map(line => textRows(line, col - 20)))
      return k.wide ? Math.max(side(f.tradeoffs.pros), side(f.tradeoffs.cons)) : side(f.tradeoffs.pros) + side(f.tradeoffs.cons) + 1
    }
    case 'gotchas':
      return sum(f.gotchas.map(one => textRows(one.text, k.room - 20)))
    case 'precedent':
      return sum(f.precedent.map(one => textRows(`${one.ask} Yes`, k.room) + 1)) + f.precedent.length - 1
    case 'touches':
      return sum(f.touches.map(one => textRows(`${one.name} ${one.change}`, k.room)))
    case 'tiles':
      return 3
  }
  return TECHNIQUES.find(one => one.id === id)?.rows ?? 4
}

export type ComposedPresses = { prose: () => void; scope: (scope: number) => void }

/** A tile's frame: the composer's fill, the card's line, amber where it holds a catch that could change the answer. */
function frameOf(id: string, facts: F): { borderColor: string } {
  return { borderColor: id === 'gotchas' && facts.gotchas.some(one => one.level === 'risk') ? SIGNAL_YELLOW : CARD_LINE }
}

/** What `packed` needs: the item, the page's width and the rows its tiles may take. */
type PackInput = {
  plan: Plan
  surface: Surface
  facts: Facts
  question: string | null
  room: number
  budget: number
  scope: number
  pick: (scope: number) => void
  glossary: ((terms: F['terms']) => RenderElement) | null
  newProps: boolean
  /** The questions the page answers in text already: the why line answers why. */
  given: readonly Question[]
  cap: Cap
}

/**
 * The page's tiles (#102), shared by the queue's item page and the deck's
 * Decision page: the packed page, each tile drawn in its frame, and how many
 * rows a page row takes.
 */
function packed(el: ComposedElements, input: PackInput) {
  const { Box, Text } = el
  const facts = input.facts as F
  const base: Kit = {
    el,
    v: views(el, input.newProps),
    facts,
    question: input.question ?? '',
    room: input.room,
    scope: input.scope,
    scoped: false,
    lead: undefined,
    pick: input.pick,
    glossary: input.glossary,
    costShown: false,
    wide: true,
  }
  const at = (size: TileSize, k: Kit = base): Kit => ({ ...k, room: tileRoom(input.room, size), wide: size === 'wide' })
  // A picture that would cut a label short ("nam…") misleads at this width, so the tile tries its other size (the design review, 2026-10-23).
  const measure = (id: string, size: TileSize): number | null => {
    const k = at(size)
    if (!drawsWhole([id], { facts, question: base.question, room: k.room })) return null
    const head = TECHNIQUES.find(one => one.id === id)?.head === undefined ? 0 : 1
    return contentRows(id, k) + head + TILE_FRAME_ROWS
  }
  const pg = page(input.plan, input.surface, measure, input.budget, input.given, input.cap)
  const tiles = pg.rows.flat()
  const costShown = tiles.some(one => one.view === 'tiles') && (facts.figures ?? []).some(one => one.unit === '$')
  const kit: Kit = { ...base, scoped: tiles.some(one => one.view === 'what-if'), lead: tiles.find(one => one.group === 'primary')?.view, costShown }

  /** `last` lets the row's last tile run to the page's edge, so rows share one right edge (the design review, 2026-10-24). */
  const tile = (one: Tile | { view: string; size: TileSize }, last = false) => {
    const k = at(one.size, kit)
    const drawn = DRAW[one.view]?.(k)
    if (drawn === null || drawn === undefined) return null
    const head = TECHNIQUES.find(t => t.id === one.view)?.head
    // A picture's frame is as wide as the picture, never a stretch of empty frame beside it (the owner, 2026-10-24).
    const picture = PICTURES[one.view] === undefined ? undefined : pictureOf(one.view, k)
    const width = picture === undefined ? (one.size === 'half' ? '50%' : '100%') : Math.ceil((picture.width + TILE_INSET_PX) / CELL_PT)
    return (
      <Box
        key={`tile-${one.view}`}
        flexDirection="column"
        flexShrink={1}
        width={width}
        {...(last ? { flexGrow: 1 } : {})}
        borderStyle="round"
        {...frameOf(one.view, facts)}
        backgroundColor={FILL}
        paddingX={1}
      >
        {head === undefined ? null : (
          <Box key="head">
            <Text dimColor {...(input.newProps ? { size: 'caption' as const } : {})}>
              {head}
            </Text>
          </Box>
        )}
        {drawn}
      </Box>
    )
  }
  const height = (row: readonly Tile[]) => Math.max(...row.map(one => measure(one.view, one.size) ?? 0))
  return { pg, tile, height }
}

/**
 * The composed card (#105): the question, then at most two pictures (the plan's
 * best tiles, then the item's images), then the row that opens the prose. The
 * four questions reserve nothing here: two pictures go to the two that score best.
 */
export function composedCard(
  el: ComposedElements,
  input: ComposedInput,
  on: ComposedPresses,
  glossary: ((terms: F['terms']) => RenderElement) | null,
): RenderElement {
  const { Box, Text, Button, Markdown } = el
  const p = drawable(input.plan)
  const images = input.images ?? null
  const cap = { ...CARD_CAP, tiles: Math.max(0, CARD_CAP.tiles - (images?.count ?? 0)) }
  const { pg, tile } = packed(el, { plan: p, surface: input.surface, facts: input.facts, question: input.question, room: input.room, budget: Infinity, scope: input.scope, pick: on.scope, glossary, newProps: input.newProps, given: QUESTIONS, cap })

  return (
    <Box key="composed" flexDirection="column" gap={1}>
      {/* The question being ruled on wraps whole (the owner, 2026-10-23), written as the recommendation, so Yes takes it (#105). */}
      {input.question === null ? null : (
        // A Text keeps no key in the drawn tree, so a Box carries it.
        <Box key="question">
          <Text bold wrap="wrap">
            {input.question}
          </Text>
        </Box>
      )}
      {input.proseOpen ? (
        <Box key="prose" flexDirection="column">
          <Markdown text={input.prose === '' ? '_(no prose)_' : input.prose} />
        </Box>
      ) : (
        [
          ...pg.rows.map((row, i) => (
            <Box key={`row-${i}`} flexDirection="row" columnGap={1} alignItems="flex-start">
              {row.map((one, j) => tile(one, j === row.length - 1))}
            </Box>
          )),
          images?.node ?? null,
        ]
      )}
      <Box flexDirection="row" columnGap={1} alignItems="center">
        {/* Named for what a press shows: the item's full text, or the pictures again (the design review, 2026-10-23). */}
        {/* A glyph for what a press shows: 📄 the item's full text, 🖼️ the pictures again; 📖 stays the Reader's (the owner, 2026-10-29). */}
        <Button key="prose-toggle" label={input.proseOpen ? '🖼️' : '📄'} onPress={on.prose} />
        {input.proseOpen ? null : (input.beside ?? null)}
        {/* Which plan drew the page, kept in the tree for the tests and the card lab and never drawn:
            on hover it read as noise beside the controls (the owner, 2026-10-29). */}
        <Box display="none">
          <Text dimColor>{explainPage(p, pg)}</Text>
        </Box>
      </Box>
    </Box>
  )
}

/** The views a deck leaves out: the what-if's picker holds per-item state the deck keeps none of, and the glossary needs a Client. */

/** About how many of the deck's 19pt rows a native view takes (docs/palette.md); an Svg's own height says it for a picture. */
function nativeRows(id: string, facts: F): number {
  if (id === 'ledger') return facts.comparison.rows.length * 2 + 2
  if (id === 'table') return facts.comparison.rows.length + 2
  if (id === 'sources') return facts.sources.claims.length * 2 + 1
  return 4
}

export type DeckInput = { plan: Plan; surface: Surface; facts: Facts; question: string; room: number; newProps: boolean; picks?: readonly string[] }
export type DeckPicture = { id: string; rows: number; node: RenderElement }

/**
 * A deck decision's pictures (#100, #102): the context page's tile rows, each a
 * block of its own so the deck's pages carry as many as fit and the rest move
 * to the next page; the answers are left to the deck's own options. Empty when
 * no tile scores, so the deck reads as text.
 */
export function deckPictures(el: ComposedElements, input: DeckInput): DeckPicture[] {
  const p = drawable(input.plan)
  const onDeck = p.views.filter(one => !NOT_ON_DECK.has(one.view))
  // The fork's picks draw, best first, and the plan's best fill a slot a pick cannot (#109).
  const plan = { ...p, views: deckViews(input.picks, onDeck.map(one => one.view)).flatMap(id => onDeck.filter(one => one.view === id)) }
  const { pg, tile, height } = packed(el, { plan, surface: input.surface, facts: input.facts, question: input.question, room: input.room, budget: Infinity, scope: -1, pick: () => undefined, glossary: null, newProps: input.newProps, given: ['why'], cap: { tiles: MAX_TILES, text: MAX_TEXT_TILES } })
  return pg.rows.map((row, i) => ({
    id: row.map(one => one.view).join('+'),
    rows: height(row),
    node: (
      <el.Box key={`deck-row-${i}`} flexDirection="row" columnGap={1} alignItems="flex-start" flexShrink={0}>
        {row.map((one, j) => tile(one, j === row.length - 1))}
      </el.Box>
    ),
  }))
}
