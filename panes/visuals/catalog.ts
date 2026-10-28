// The visual alphabet: every technique a Vantage Point pane can draw a decision
// with, as data a decision model reads. The mock album (`/vantage-point album`)
// shows each one tried on a real ask; this file says what each is for, when it
// fits, what it overlaps with and what it combines with, so a model can propose
// and choose compositions rather than follow one fixed rule per shape. Pure.
//
// `fits` is the question a judgment model asks of an item to see whether the
// technique applies, phrased so a high probability means use it (the Noul form
// of docs/research/2026-10-17-jev-extractive-gist.md). `prior` is the bias before
// any item is seen: the owner's preferences and the design reviews, to be tuned
// against the owner's rulings. `reads` and `meaning` tie a technique to an
// item's facts (panes/visuals/facts.ts): the one fact kind it draws, and the
// check that it would not mislead on those facts.

import type { FactKind, Facts } from './facts.ts'

/** Where a technique sits on a card. A deck's card holds the question, one lead, at most one support, and the answers; an item's page (#102) packs any number of leads and supports as tiles. */
export type Slot =
  /** The one picture the ruling turns on. */
  | 'lead'
  /** A second element that adds what the lead cannot. */
  | 'support'
  /** What each answer sets off: every item card has exactly one. */
  | 'answers'
  /** A layer under everything else, not an element: it costs no slot. */
  | 'base'
  /** Above the items: the request as a whole. */
  | 'request'

/** How strong a cue it is (GLOSSARY.md, salience cue): one step at a time, motion the strongest. */
export type Salience = 1 | 2 | 3

export type Technique = {
  id: string
  name: string
  /** The elements of docs/palette.md that draw it. */
  elements: readonly ('Box' | 'Text' | 'Button' | 'Select' | 'Svg' | 'Link' | 'Markdown' | 'Client')[]
  /** The one thing only it does, in a sentence. */
  job: string
  /** The question asked of an item to see whether it fits; a high probability means use it. */
  fits: string
  /** The fact kind it draws, or null for one no item card is composed from (a base layer, a request-level or album-only picture). */
  reads: FactKind | null
  /** Why it would mislead on these facts, or null when it would not: its `avoid` made executable. Called only when the facts hold its kind. */
  meaning: (facts: Facts) => string | null
  slot: Slot
  /** 1: type and structure; 2: a picture with colour or shape; 3: motion. */
  salience: Salience
  interactive: boolean
  /** About how many pane rows it takes at a narrow pane's width. */
  rows: number
  /** The bias before any item is seen, 0 to 1. */
  prior: number
  /** Techniques that can carry the same facts, each with what tells the two apart. Symmetric; never on one card. */
  overlaps: readonly { with: string; differs: string }[]
  /** Techniques it combines well with on one card or request. */
  pairs: readonly string[]
  /** Where it draws. A phone draws no Client, Select or Input (docs/palette.md). */
  surfaces: readonly ('desktop' | 'phone')[]
  /** When not to use it, even where it fits. */
  avoid: string
  /** The album page that shows it (`/vantage-point album <page>`). */
  page: string
  /** The dim label over its tile on a page (#102); none where the tile says what it is. */
  head?: string
  /** The widths its tile takes on a page, the one it prefers first: half the page or all of it. Absent: wide only. */
  sizes?: readonly TileSize[]
}

/** A tile's width on a page: half the page, beside another, or the whole of it. */
export type TileSize = 'half' | 'wide'
export const sizesOf = (one: Technique): readonly TileSize[] => one.sizes ?? ['wide']

const BOTH = ['desktop', 'phone'] as const
const ok = () => null

/** A flow whose moves or never-pair name a box it does not have would draw a line to nowhere. */
function flowRefusal(facts: Facts): string | null {
  const { nodes, moves, never } = facts.flow!
  for (const end of [...moves, ...(never ? [never] : [])])
    for (const name of [end.from, end.to]) if (!nodes.includes(name)) return `${name} is not one of the flow's boxes`
  return null
}

/** A comparison draws one value per option on every row. */
function comparisonRefusal(facts: Facts): string | null {
  const { options, rows } = facts.comparison!
  const short = rows.find(row => row.values.length !== options.length)
  return short ? `${short.label} has ${short.values.length} values for ${options.length} options` : null
}
const DESKTOP = ['desktop'] as const

export const TECHNIQUES: readonly Technique[] = [
  {
    id: 'answers',
    name: 'Answer rows',
    elements: ['Box', 'Text'],
    job: 'Says in one line each what yes and what no set off, with the recommended answer the only green.',
    fits: 'Does the item ask for a yes or a no?',
    reads: 'answers',
    meaning: ok,
    slot: 'answers',
    salience: 1,
    interactive: false,
    rows: 2,
    prior: 1,
    overlaps: [{ with: 'outcomes', differs: 'one line per answer, where the columns list several consequences each' }],
    pairs: ['threshold', 'flow-live', 'diff-bars', 'tiles'],
    surfaces: BOTH,
    avoid: 'Never left out of an item card.',
    page: 'threshold',
  },
  {
    id: 'outcomes',
    name: 'Yes / No columns',
    elements: ['Box', 'Text'],
    job: 'Sets two or more consequences of each answer side by side.',
    fits: 'Does each answer set off two or more separate consequences?',
    reads: 'answers',
    meaning: f => (f.answers!.yes.length >= 2 && f.answers!.no.length >= 2 ? null : 'an answer carries one consequence: the answer rows say it in two lines'),
    slot: 'answers',
    salience: 1,
    interactive: false,
    rows: 5,
    prior: 0.6,
    overlaps: [
      { with: 'answers', differs: 'several consequences per answer, where the rows hold one line each' },
      { with: 'tree', differs: 'consequences listed, where the tree shows where each answer leads next' },
    ],
    pairs: ['tiles', 'blocks'],
    surfaces: BOTH,
    avoid: 'When each answer has one consequence: the answer rows say it in two lines.',
    page: 'outcomes',
  },
  {
    id: 'tiles',
    name: 'Stat tiles',
    elements: ['Box', 'Text'],
    job: 'Raises the separate figures a ruling turns on to title size.',
    fits: 'Does the ruling turn on a few separate figures, such as a cost, a count or an effect?',
    reads: 'figures',
    meaning: f => (new Set(f.figures!.map(x => x.label)).size === f.figures!.length ? null : 'two figures share a label'),
    slot: 'lead',
    salience: 1,
    interactive: false,
    rows: 3,
    prior: 0.7,
    overlaps: [{ with: 'blocks', differs: 'separate figures, where the blocks show one count changing state' }],
    pairs: ['answers', 'outcomes'],
    surfaces: BOTH,
    avoid: 'With more than three figures, or figures that only make sense compared: compare them in a picture instead.',
    page: 'tiles',
    head: 'Figures',
    sizes: ['half', 'wide'],
  },
  {
    id: 'blocks',
    name: 'Progress blocks',
    elements: ['Svg'],
    job: 'Shows a small count of things moving from one state to another.',
    fits: 'Does a yes move a small number of things from one state to another?',
    reads: 'counts',
    meaning: f => (f.counts!.after === undefined ? 'no count after a yes' : f.counts!.total > 8 ? `${f.counts!.total} things: blocks read as individuals up to 8` : null),
    slot: 'lead',
    salience: 2,
    interactive: false,
    rows: 4,
    prior: 0.5,
    overlaps: [{ with: 'tiles', differs: 'one count changing state, where the tiles hold separate figures' }],
    pairs: ['answers'],
    surfaces: BOTH,
    avoid: 'For more than eight things, or a change that is not a state (a cost, a rate).',
    page: 'blocks',
    head: 'Cases',
    sizes: ['wide', 'half'],
  },
  {
    id: 'units',
    name: 'Unit chart',
    elements: ['Svg'],
    job: 'Shows individual cases, a few lit out of many, against the number a target needs.',
    fits: 'Does the item count a few cases out of many against a number they must reach?',
    reads: 'counts',
    meaning: f => (f.counts!.target === undefined ? 'no target to reach' : f.counts!.total > 60 ? `${f.counts!.total} cases: squares read as individuals up to about 60` : f.counts!.now > f.counts!.total ? 'more now than the total' : null),
    slot: 'lead',
    salience: 2,
    interactive: false,
    rows: 5,
    prior: 0.5,
    overlaps: [
      { with: 'threshold', differs: 'countable cases, where the bars compare values to a line' },
      { with: 'sankey', differs: 'a few cases out of many, where the flow splits a total into readable parts' },
    ],
    pairs: ['answers'],
    surfaces: BOTH,
    avoid: 'Past about 60 cases: the squares stop reading as individuals.',
    page: 'units',
    head: 'Cases',
    sizes: ['wide', 'half'],
  },
  {
    id: 'threshold',
    name: 'Bars and a threshold',
    elements: ['Svg'],
    job: 'Shows which values clear a line and which fall short.',
    fits: 'Does the item compare values against a line the result must clear?',
    reads: 'threshold',
    meaning: f => (f.threshold!.values.length < 2 ? 'one value: say it in the question' : f.threshold!.values.some(x => x.value < 0) ? 'a bar starts at zero, so no value may be negative' : null),
    slot: 'lead',
    salience: 2,
    interactive: false,
    rows: 5,
    prior: 0.9,
    overlaps: [{ with: 'units', differs: 'values against a line, where the unit chart counts cases' }],
    pairs: ['answers', 'what-if'],
    surfaces: BOTH,
    avoid: 'With one value: say it in the question.',
    page: 'threshold',
    head: 'Against the line',
    sizes: ['wide', 'half'],
  },
  {
    id: 'what-if',
    name: 'What-if picker',
    elements: ['Select', 'Svg'],
    job: 'Re-scopes the lead picture by a sub-option an answer hides.',
    fits: 'Does an answer hide sub-options that change what the picture shows?',
    reads: 'threshold',
    meaning: f => (f.threshold!.values.length < 2 ? 'one scope: nothing to pick between' : (f.answers?.yes.length ?? 0) < 2 ? 'the yes hides no sub-option to scope the picture by' : null),
    slot: 'support',
    salience: 1,
    interactive: true,
    rows: 2,
    prior: 0.3,
    overlaps: [],
    pairs: ['threshold'],
    surfaces: DESKTOP,
    avoid: 'When no answer hides a sub-option: a picker over one scope is noise.',
    page: 'what-if',
  },
  {
    id: 'tree',
    name: 'Decision tree',
    elements: ['Svg'],
    job: 'Shows where each answer leads next, and what each end costs.',
    fits: 'Does each answer lead to a different second outcome with its own cost?',
    reads: 'answers',
    meaning: f => ([...f.answers!.yes, ...f.answers!.no].every(x => x.then !== undefined) ? null : 'an answer has no next step: the answer rows say it'),
    slot: 'lead',
    salience: 2,
    interactive: false,
    rows: 8,
    prior: 0.5,
    overlaps: [{ with: 'outcomes', differs: 'where each answer leads next, where the columns list consequences' }],
    pairs: [],
    surfaces: BOTH,
    avoid: 'When the outcomes are one step: the answer rows say it. Its root must be the card’s own question, never its inverse.',
    page: 'tree',
    head: 'What follows',
  },
  {
    id: 'sankey',
    name: 'Flow by width',
    elements: ['Svg'],
    job: 'Splits a total into parts whose widths read at a glance.',
    fits: 'Does the ruling turn on how a total splits into parts?',
    reads: 'parts',
    meaning: f => {
      const { total, parts } = f.parts!
      const sum = parts.reduce((a, x) => a + x.value, 0)
      if (Math.abs(sum - total) > total / 100) return `the parts add to ${sum}, not ${total}`
      const thin = parts.find(x => x.value < total / 10)
      return thin ? `${thin.label} is under a tenth of the total: its band is too thin to read` : null
    },
    slot: 'lead',
    salience: 2,
    interactive: false,
    rows: 6,
    prior: 0.15,
    overlaps: [{ with: 'units', differs: 'readable shares of a total, where the unit chart lights a few cases' }],
    pairs: ['answers'],
    surfaces: BOTH,
    avoid: 'When a part is under a tenth of the total: its band is too thin to read (the album, item 2).',
    page: 'sankey',
    head: 'Where it goes',
  },
  {
    id: 'flow-live',
    name: 'Animated flow',
    elements: ['Svg'],
    job: 'Shows what moves where, live, and what it never reaches, with each box defined on hover.',
    fits: 'Does the item describe something moving between parts, and something it never touches?',
    reads: 'flow',
    meaning: f => flowRefusal(f) ?? (f.flow!.never === undefined ? 'names nothing it never reaches' : null),
    slot: 'lead',
    salience: 3,
    interactive: true,
    rows: 6,
    prior: 0.9,
    overlaps: [
      { with: 'flow', differs: 'moving, where the drawn flow is still' },
      { with: 'sequence', differs: 'what goes where, where the sequence orders messages in time' },
      { with: 'glossary', differs: 'defines the boxes of a picture, where the glossary defines names in prose' },
    ],
    pairs: ['answers'],
    surfaces: DESKTOP,
    avoid: 'When something else on the card already moves: motion is the strongest cue and a card gets one (the owner, 2026-10-23).',
    page: 'animated',
    head: 'How it moves',
  },
  {
    id: 'flow',
    name: 'Flowchart, drawn',
    elements: ['Svg'],
    job: 'The still form of the animated flow: what goes where, and what it never touches.',
    fits: 'Does the item describe something moving between parts, and something it never touches?',
    reads: 'flow',
    meaning: flowRefusal,
    slot: 'lead',
    salience: 2,
    interactive: false,
    rows: 6,
    prior: 0.5,
    overlaps: [
      { with: 'flow-live', differs: 'still, where the animated flow moves' },
      { with: 'mermaid-flow', differs: 'laid out for the pane by hand, where Mermaid lays out a larger graph by itself' },
    ],
    pairs: ['answers', 'timeline'],
    surfaces: BOTH,
    avoid: 'On the desktop when nothing else moves: the animated flow says the same and is the more salient.',
    page: 'flow',
    head: 'How it moves',
  },
  {
    id: 'mermaid-flow',
    name: 'Flowchart, Mermaid',
    elements: ['Svg'],
    job: 'Lays out a larger process with branches by itself, rendered when the ask is filed.',
    fits: 'Does the item describe a process of more than five steps or with several branches?',
    reads: null,
    meaning: ok,
    slot: 'lead',
    salience: 2,
    interactive: false,
    rows: 9,
    prior: 0.2,
    overlaps: [{ with: 'flow', differs: 'a larger graph laid out by Mermaid, where the drawn flow fits five nodes to the pane' }],
    pairs: ['answers'],
    surfaces: BOTH,
    avoid: 'In a narrow pane: its layout is fixed ahead of time, so it shrinks, type and all.',
    page: 'mermaid-flow',
  },
  {
    id: 'sequence',
    name: 'Sequence, Mermaid',
    elements: ['Svg'],
    job: 'Orders the messages between parts in time.',
    fits: 'Does the order of messages between parts decide the ruling?',
    reads: 'flow',
    meaning: f => flowRefusal(f) ?? (f.flow!.nodes.length < 3 ? 'two parts: the flow says it' : f.flow!.moves.every(x => x.label !== undefined) ? null : 'a move has no label to order by'),
    slot: 'lead',
    salience: 2,
    interactive: false,
    rows: 8,
    prior: 0.15,
    overlaps: [
      { with: 'flow-live', differs: 'messages ordered in time, where the flow shows what goes where' },
      { with: 'timeline', differs: 'messages between parts, where the timeline is one thing’s steps' },
    ],
    pairs: ['answers'],
    surfaces: BOTH,
    avoid: 'In a narrow pane: four actors shrink past reading.',
    page: 'sequence',
  },
  {
    id: 'timeline',
    name: 'Timeline',
    elements: ['Svg'],
    job: 'Shows one thing’s steps in time, where it ends by itself, and what waits on it.',
    fits: 'Does a yes start something that runs for a while and then ends or hands over by itself?',
    reads: 'steps',
    meaning: f => (f.steps!.length < 3 || f.steps!.length > 5 ? `${f.steps!.length} steps: a timeline reads 3 to 5` : null),
    slot: 'support',
    salience: 2,
    interactive: false,
    rows: 4,
    prior: 0.6,
    overlaps: [{ with: 'sequence', differs: 'one thing’s steps, where the sequence orders messages between parts' }],
    pairs: ['flow', 'answers'],
    surfaces: BOTH,
    avoid: 'For a change that happens once and stays.',
    page: 'timeline',
    head: 'When',
  },
  {
    id: 'diff-bars',
    name: 'Difference bars',
    elements: ['Svg'],
    job: 'Shows how much better or worse one option is than another on each measure, on one scale, with both values printed.',
    fits: 'Does the item compare options on measures of the same kind?',
    reads: 'comparison',
    meaning: f =>
      f.comparison!.options.length !== 2
        ? 'more than two options: use the ledger'
        : // A change is a share of the first value: a row said in words, or from zero, has none to draw.
          f.comparison!.rows.every(row => row.cells !== undefined || row.values[0] === 0)
          ? 'no row has a share to draw: every row is in words or starts at zero'
          : comparisonRefusal(f),
    slot: 'lead',
    salience: 2,
    interactive: false,
    rows: 6,
    prior: 0.8,
    overlaps: [
      { with: 'table', differs: 'magnitude at a glance, where the table gives exact values to read' },
      { with: 'ledger', differs: 'numeric measures on one scale, where the ledger mixes kinds and names options as actions' },
    ],
    pairs: ['answers'],
    surfaces: BOTH,
    avoid: 'With more than two options: use the ledger.',
    page: 'dumbbell',
    head: 'Where they differ',
  },
  {
    id: 'ledger',
    name: 'Ledger of actions',
    elements: ['Box', 'Text'],
    job: 'Compares options named as things to do on shared rows of any kind, every row filled (visual-brief’s comparison).',
    fits: 'Does the item choose between courses of action measured on the same rows, some not numbers?',
    reads: 'comparison',
    meaning: comparisonRefusal,
    slot: 'lead',
    salience: 1,
    interactive: false,
    rows: 6,
    prior: 0.7,
    overlaps: [
      { with: 'diff-bars', differs: 'mixed kinds and options as actions, where the bars put numbers on one scale' },
      { with: 'table', differs: 'rows in the reader’s words and the better cell lit, where the table is raw values' },
    ],
    pairs: ['answers'],
    surfaces: BOTH,
    avoid: 'When a cell would be empty: a ledger is drawn only when every row is filled.',
    page: 'ledger',
    head: 'Side by side',
  },
  {
    id: 'table',
    name: 'Table',
    elements: ['Markdown'],
    job: 'Gives exact values for a reader who must read them.',
    fits: 'Does the ruling depend on exact values rather than which is larger?',
    reads: 'comparison',
    meaning: comparisonRefusal,
    slot: 'support',
    salience: 1,
    interactive: false,
    rows: 6,
    prior: 0.3,
    overlaps: [
      { with: 'diff-bars', differs: 'exact values, where the bars show magnitude' },
      { with: 'ledger', differs: 'raw values, where the ledger names actions and lights the better cell' },
    ],
    pairs: ['answers'],
    surfaces: BOTH,
    avoid: 'As a lead: a table must be read, which is what the card is escaping.',
    page: 'table',
    head: 'Side by side',
  },
  {
    id: 'sources',
    name: 'Numbered sources',
    elements: ['Markdown', 'Link'],
    job: 'Ties each figure to where it came from, by number.',
    fits: 'Does the item rest on figures measured somewhere the person may want to check?',
    reads: 'sources',
    meaning: f => {
      const named = new Set(f.sources!.sources.map(x => x.label))
      const loose = f.sources!.claims.find(x => !named.has(x.source))
      if (loose) return `“${loose.text}” cites ${loose.source}, which is not listed`
      // Its claims would say the comparison's figures a second time (the design review, 2026-10-23); a comparison
      // said wholly in words, as a deck's is, shows no figures, so its sources stand beside it.
      const figured = (f.comparison?.rows ?? []).some(row => row.cells === undefined)
      return figured ? 'the comparison already shows these figures: their sources stay in the prose' : null
    },
    slot: 'support',
    salience: 1,
    interactive: true,
    rows: 3,
    prior: 0.4,
    overlaps: [],
    pairs: ['answers'],
    surfaces: BOTH,
    avoid: 'For figures the item computed itself, or beside a comparison that already shows them.',
    page: 'sources',
    head: 'Sources',
    sizes: ['half', 'wide'],
  },
  {
    id: 'glossary',
    name: 'Tap a term',
    elements: ['Client'],
    job: 'Defines the names the card must use, on a press, so the card carries no definitions.',
    fits: 'Does the item name things a person returning cold might not know?',
    reads: 'terms',
    meaning: f => (f.terms!.length < 2 || f.terms!.length > 5 ? `${f.terms!.length} terms: a glossary reads 2 to 5` : null),
    slot: 'support',
    salience: 1,
    interactive: true,
    rows: 2,
    prior: 0.4,
    overlaps: [
      { with: 'flow-live', differs: 'names in prose, where the animated flow defines the boxes of its picture' },
      { with: 'reveal', differs: 'definitions of names, where the reveal hides a detail' },
    ],
    pairs: ['diff-bars', 'ledger', 'answers'],
    surfaces: DESKTOP,
    avoid: 'For a term the ruling cannot be made without: say it on the card.',
    page: 'glossary',
    sizes: ['wide'],
  },
  {
    id: 'reveal',
    name: 'Hover reveal',
    elements: ['Box', 'Text'],
    job: 'Keeps a detail the ruling does not need out of sight until the pointer asks for it.',
    fits: 'Does the item carry a detail that explains but does not change the answer?',
    reads: 'terms',
    meaning: f => (f.terms!.length !== 1 ? 'more than one detail: the glossary holds them' : null),
    slot: 'support',
    salience: 1,
    interactive: true,
    rows: 1,
    prior: 0.3,
    overlaps: [{ with: 'glossary', differs: 'a hidden detail, where the glossary defines names' }],
    pairs: ['answers'],
    surfaces: DESKTOP,
    avoid: 'For a caveat that could change the answer: that stays on the card (the design review, 2026-10-23).',
    page: 'reveal',
  },
  {
    id: 'type',
    name: 'Type ladder',
    elements: ['Text'],
    job: 'Ranks the card’s words by size, weight, dimness and strike, one step at a time.',
    fits: 'Does the card hold any text?',
    reads: null,
    meaning: ok,
    slot: 'base',
    salience: 1,
    interactive: false,
    rows: 0,
    prior: 1,
    overlaps: [],
    pairs: [],
    surfaces: BOTH,
    avoid: 'Alone: hierarchy over prose is still prose.',
    page: 'type',
  },
  {
    id: 'bitmap',
    name: 'The thing itself',
    elements: ['Svg'],
    job: 'Shows a shot of what is being ruled on, when it is something to look at.',
    fits: 'Is the item about how something looks?',
    reads: null,
    meaning: ok,
    slot: 'lead',
    salience: 2,
    interactive: false,
    rows: 10,
    prior: 0.8,
    overlaps: [],
    pairs: ['answers'],
    surfaces: BOTH,
    avoid: 'For a shot of prose: draw the facts instead (the album, page 1).',
    page: 'before',
  },
  {
    id: 'cost',
    name: 'Cost scale',
    elements: ['Svg'],
    job: 'Puts every spend in a request on one log scale against a floor and a cap.',
    fits: 'Do two or more items in the request spend money?',
    reads: null,
    meaning: ok,
    slot: 'request',
    salience: 2,
    interactive: false,
    rows: 6,
    prior: 0.6,
    overlaps: [],
    pairs: ['floor', 'graph'],
    surfaces: BOTH,
    avoid: 'With one spend: put it in its item’s answer rows.',
    page: 'cost',
  },
  {
    id: 'graph',
    name: 'Local graph',
    elements: ['Svg'],
    job: 'Shows how the items connect to the work they rule on, every link named, seven nodes at most.',
    fits: 'Do three or more items in the request rule on parts of the same piece of work?',
    reads: null,
    meaning: ok,
    slot: 'request',
    salience: 2,
    interactive: false,
    rows: 9,
    prior: 0.5,
    overlaps: [],
    pairs: ['cost'],
    surfaces: BOTH,
    avoid: 'For unrelated items: a graph of islands says nothing.',
    page: 'graph',
  },
  {
    id: 'floor',
    name: 'Under the floor',
    elements: ['Box', 'Text', 'Button'],
    job: 'Turns spends too small to ask about into receipt lines with an undo, instead of cards.',
    fits: 'Does the item spend less than the floor and change nothing the person uses?',
    reads: null,
    meaning: ok,
    slot: 'request',
    salience: 1,
    interactive: true,
    rows: 3,
    prior: 0.9,
    overlaps: [],
    pairs: ['cost'],
    surfaces: BOTH,
    avoid: 'Until the owner rules on the floor: it changes when an agent may act without asking.',
    page: 'floor',
  },
  // The decision's context (#102): tiles a page packs around the ask, each answering a question the person has before ruling.
  {
    id: 'evidence',
    name: 'Evidence and its trust',
    elements: ['Box', 'Text'],
    job: 'Lists what the ruling rests on, each source marked by how far to trust it and the answer it points to.',
    fits: 'Does the ruling rest on sources the person would weigh differently: checked, measured, reported or guessed?',
    reads: 'evidence',
    meaning: ok,
    slot: 'support',
    salience: 1,
    interactive: false,
    rows: 6,
    prior: 0.5,
    overlaps: [{ with: 'weight', differs: 'what each source says, where the bars show how much of each there is' }],
    pairs: ['gotchas', 'impact', 'tradeoffs'],
    surfaces: BOTH,
    avoid: 'With one source: say it in the why line.',
    page: 'context',
    head: 'Evidence',
    sizes: ['half', 'wide'],
  },
  {
    id: 'weight',
    name: 'Evidence by weight',
    elements: ['Svg'],
    job: 'Draws each source as a bar as long as how much of it there is, solid where a person checked it and hollow where not, so a large unchecked pile reads apart from a small checked one.',
    fits: 'Do the sources differ in size, so that how much of each there is matters beside what it says?',
    reads: 'evidence',
    meaning: facts => {
      const sources = facts.evidence!
      if (sources.length < 2) return 'one source has nothing to weigh against'
      const light = sources.find(one => one.weight === undefined)
      return light ? `${light.label} has no weight` : null
    },
    slot: 'support',
    salience: 2,
    interactive: false,
    rows: 5,
    prior: 0.85,
    overlaps: [{ with: 'evidence', differs: 'how much of each source there is, where the list says what each says' }],
    pairs: ['gotchas', 'impact'],
    surfaces: BOTH,
    avoid: 'When the sources are of one size: the bars say nothing the list does not.',
    page: 'context',
    head: 'Evidence',
    sizes: ['half', 'wide'],
  },
  {
    id: 'impact',
    name: 'What each answer changes',
    elements: ['Box', 'Text'],
    job: 'Sets what each answer changes side by side, each change marked by how far it reaches and how it is undone.',
    fits: 'Do the answers change different things, or reach differently far?',
    reads: 'impact',
    meaning: ok,
    slot: 'support',
    salience: 2,
    interactive: false,
    rows: 6,
    prior: 0.5,
    overlaps: [{ with: 'reach', differs: 'each change in words, where the rails show how far each reaches' }],
    pairs: ['evidence', 'gotchas', 'touches'],
    surfaces: BOTH,
    avoid: 'When neither answer changes anything outside the item.',
    page: 'context',
    head: 'What changes',
    sizes: ['wide', 'half'],
  },
  {
    id: 'tradeoffs',
    name: 'For and against',
    elements: ['Box', 'Text'],
    job: 'Lists the case for and against the recommended answer, each line marked plus or minus.',
    fits: 'Does the recommended answer carry costs the person should weigh against its gains?',
    reads: 'tradeoffs',
    meaning: ok,
    slot: 'support',
    salience: 1,
    interactive: false,
    rows: 5,
    prior: 0.5,
    overlaps: [{ with: 'balance', differs: 'a plain list, where the balance shows which side holds more' }],
    pairs: ['evidence', 'impact', 'gotchas'],
    surfaces: BOTH,
    avoid: 'When every line is on one side: say it in the why line.',
    page: 'context',
    head: 'For and against',
    sizes: ['half', 'wide'],
  },
  {
    id: 'gotchas',
    name: 'Watch out',
    elements: ['Box', 'Text'],
    job: 'Holds what could go wrong or mislead even on the recommended answer, framed in amber so it reads before anything calm.',
    fits: 'Is there a catch the person could miss that bears on the ruling?',
    reads: 'gotchas',
    meaning: ok,
    slot: 'support',
    salience: 2,
    interactive: false,
    rows: 4,
    prior: 0.5,
    overlaps: [],
    pairs: ['evidence', 'impact', 'tradeoffs'],
    surfaces: BOTH,
    avoid: 'For a catch that is already the question: the page would say it twice.',
    page: 'context',
    head: 'Watch out',
    sizes: ['half', 'wide'],
  },
  {
    id: 'precedent',
    name: 'Ruled before',
    elements: ['Box', 'Text'],
    job: 'Lists the person’s earlier rulings on asks like this one, and what came of each.',
    fits: 'Has the person ruled on asks like this before, in a way that bears on this one?',
    reads: 'precedent',
    meaning: ok,
    slot: 'support',
    salience: 1,
    interactive: false,
    rows: 4,
    prior: 0.5,
    overlaps: [{ with: 'rulings', differs: 'a plain list, where the line sets the rulings in time' }],
    pairs: ['evidence', 'tradeoffs'],
    surfaces: BOTH,
    avoid: 'For an earlier ruling that does not bear on this one.',
    page: 'context',
    head: 'Ruled before',
    sizes: ['half', 'wide'],
  },
  {
    id: 'touches',
    name: 'What a yes touches',
    elements: ['Box', 'Text'],
    job: 'Names each system, file or person a yes changes, and how.',
    fits: 'Does a yes change things beyond the item itself that the person would want named?',
    reads: 'touches',
    meaning: ok,
    slot: 'support',
    salience: 1,
    interactive: false,
    rows: 4,
    prior: 0.4,
    overlaps: [{ with: 'map', differs: 'a plain list, where the map draws each thing out from the decision' }],
    pairs: ['impact', 'gotchas'],
    surfaces: BOTH,
    avoid: 'When a yes touches only the item itself.',
    page: 'context',
    head: 'Touches',
    sizes: ['half', 'wide'],
  },
  {
    id: 'reach',
    name: 'How far each answer reaches',
    elements: ['Svg'],
    job: 'Draws each change an answer makes as a rail as long as its reach, a dot for nothing and the whole lane for everything, with its undo beneath.',
    fits: 'Do the answers differ in how far their changes reach?',
    reads: 'impact',
    meaning: f => {
      // Bars of one length say nothing the words do not (the design review, 2026-10-24).
      const reaches = new Set([...f.impact!.yes, ...f.impact!.no].map(one => one.reach))
      return reaches.size < 2 ? 'every change reaches as far: the bars would all match' : null
    },
    slot: 'support',
    salience: 2,
    interactive: false,
    rows: 7,
    prior: 0.85,
    overlaps: [{ with: 'impact', differs: 'how far each change reaches, where the list says each in words' }],
    pairs: ['weight', 'gotchas', 'map'],
    surfaces: BOTH,
    avoid: 'When every change reaches as far as every other: the rails say nothing.',
    page: 'context',
    head: 'What changes',
    sizes: ['half', 'wide'],
  },
  {
    id: 'balance',
    name: 'For and against, on a balance',
    elements: ['Svg'],
    job: 'Hangs the case for and the case against from a beam that tips toward the side holding more.',
    fits: 'Does the recommended answer carry costs the person should weigh against its gains, side by side?',
    reads: 'tradeoffs',
    // A level beam says only what the list says, in more room: EXP-023's one line for and one against (#103).
    meaning: f => (f.tradeoffs!.pros.length === f.tradeoffs!.cons.length ? 'as many lines for as against: the beam hangs level and says nothing the list does not' : null),
    slot: 'support',
    salience: 2,
    interactive: false,
    rows: 7,
    prior: 0.5,
    overlaps: [{ with: 'tradeoffs', differs: 'which side holds more, where the list only names each line' }],
    pairs: ['weight', 'reach', 'gotchas'],
    surfaces: BOTH,
    avoid: 'When every line is on one side: there is nothing to weigh.',
    page: 'context',
    head: 'For and against',
    sizes: ['wide'],
  },
  {
    id: 'map',
    name: 'What a yes touches, as a map',
    elements: ['Svg'],
    job: 'Draws the decision at the centre and a line out to each thing a yes changes, each with how it changes.',
    fits: 'Does a yes reach things beyond the item that the person would want to see spread out?',
    reads: 'touches',
    meaning: facts => (facts.touches!.length > 6 ? `${facts.touches!.length} things: a map past six reads as a list` : null),
    slot: 'support',
    salience: 2,
    interactive: false,
    rows: 6,
    prior: 0.7,
    overlaps: [{ with: 'touches', differs: 'each thing drawn out from the decision, where the list names them in turn' }],
    pairs: ['reach', 'gotchas'],
    surfaces: BOTH,
    avoid: 'When a yes touches one thing: name it in the answer.',
    page: 'context',
    head: 'Touches',
    sizes: ['half', 'wide'],
  },
  {
    id: 'rulings',
    name: 'Ruled before, in time',
    elements: ['Svg'],
    job: 'Sets the person’s earlier rulings on asks like this one on a line in time, a filled dot for yes and a hollow one for no.',
    fits: 'Has the person ruled on asks like this before, so that the order or the pattern of those rulings bears on this one?',
    reads: 'precedent',
    meaning: ok,
    slot: 'support',
    salience: 2,
    interactive: false,
    rows: 5,
    prior: 0.65,
    overlaps: [{ with: 'precedent', differs: 'the rulings in time, where the list names each' }],
    pairs: ['weight', 'balance'],
    surfaces: BOTH,
    avoid: 'For one earlier ruling: the list says it.',
    page: 'context',
    head: 'Ruled before',
    sizes: ['half', 'wide'],
  },
]

/** A card's composition: the techniques drawn on one item card, by id. */
export type Composition = readonly string[]

const byId = new Map(TECHNIQUES.map(one => [one.id, one]))

/**
 * Why a composition may not be drawn on a card, or an empty list when it may.
 * These are the hard rules; everything else is a model's choice. One lead, at
 * most one support, exactly one set of answers, no two techniques that overlap,
 * at most one moving thing, and nothing the surface cannot draw.
 */
export function refusals(card: Composition, surface: 'desktop' | 'phone' = 'desktop'): string[] {
  const out: string[] = []
  const used = card.map(id => byId.get(id))
  card.forEach((id, i) => {
    if (used[i] === undefined) out.push(`${id} is not in the catalog`)
  })
  const known = used.filter((one): one is Technique => one !== undefined)
  const count = (slot: Slot) => known.filter(one => one.slot === slot).length
  if (count('lead') !== 1) out.push(`a card has one lead, not ${count('lead')}`)
  if (count('support') > 1) out.push(`a card has at most one support, not ${count('support')}`)
  if (count('answers') !== 1) out.push(`a card has one set of answers, not ${count('answers')}`)
  if (count('request') > 0) out.push('a request-level technique sits above the items, not on a card')
  if (known.filter(one => one.salience === 3).length > 1) out.push('a card moves one thing at most')
  for (const a of known) {
    for (const o of a.overlaps) if (card.includes(o.with) && a.id < o.with) out.push(`${a.id} and ${o.with} overlap: ${o.differs}`)
    if (!a.surfaces.includes(surface)) out.push(`${a.id} does not draw on the ${surface}`)
  }
  return out
}

/** Every card the catalog allows on a surface: what a proposer enumerates for a model to choose among. */
export function admissible(surface: 'desktop' | 'phone' = 'desktop'): Composition[] {
  const pick = (slot: Slot) => TECHNIQUES.filter(one => one.slot === slot).map(one => one.id)
  const out: Composition[] = []
  for (const lead of pick('lead'))
    for (const answers of pick('answers'))
      for (const support of [null, ...pick('support')]) {
        const card = support === null ? [lead, answers] : [lead, support, answers]
        if (refusals(card, surface).length === 0) out.push(card)
      }
  return out
}

/**
 * Why a page of tiles (#102) breaks the catalog's rules: a page takes any number
 * of tiles, but still one set of answers, nothing request-level, one moving
 * thing at most, and no two tiles that carry the same facts. Empty when it
 * holds. A card's one lead and one support are a card's rule, not a page's.
 */
export function pageRefusals(page: Composition, surface: 'desktop' | 'phone' = 'desktop'): string[] {
  return refusals(page, surface).filter(why => !/^a card has (one lead|at most one support)/.test(why))
}
