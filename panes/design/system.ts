// The Vantage Point design system (spec 181): one source for every picture Vantage Point draws.
// The agent composes each picture freely (bottom-up) out of a small shared vocabulary (the tokens
// and classes below, injected into every picture), and a few structural counts after Franconeri and
// the owner's salience ladder repair it toward a picture read at a glance (top-down). Pure.
import { CARD_LINE, DIM_TEXT, FILL, INACTIVE, PANE, PICTURE_LINE, QUIET, REST_LINE, SIGNAL_BLUE, SIGNAL_RED, TEXT } from '../../hooks/signal.ts'
import type { Tag } from '../visuals/picture.ts'

/**
 * The colours a picture may name, each as `var(--name)`: the desktop's neutrals and two signals, from the band's
 * signal module so colour has one source. The recommendation's green and the warning's amber are not here: the
 * pane keeps them for the recommendation and a warning.
 */
export const TOKENS = {
  text: TEXT,
  label: INACTIVE,
  dim: DIM_TEXT,
  quiet: QUIET,
  line: PICTURE_LINE,
  rest: REST_LINE,
  rule: CARD_LINE,
  fill: FILL,
  ground: PANE,
  accent: SIGNAL_BLUE,
  bad: SIGNAL_RED,
} as const

export type Token = keyof typeof TOKENS

/** Each class of the vocabulary with its one job, as the decide tool's brief names them. */
export const CLASSES = {
  label: 'a dim 12px label beside a mark or value',
  value: 'a figure, 15px, tabular digits',
  caption: 'a quiet 12px note under the picture',
  row: 'a horizontal flex row, items centred',
  col: 'a vertical flex column',
  grid: 'two columns, label then mark, rows aligned',
  'gap-1': '4px between children',
  'gap-2': '8px between children',
  'gap-3': '16px between children',
  grow: 'takes the row\'s remaining width (a track beside its label)',
  card: 'a framed box on the raised fill',
  bar: 'a filled length: a div with an inline width, or an svg rect',
  track: 'the full length a bar is measured against',
  dot: 'a 10px point: an event, an item, a case',
  node: 'a framed step or thing in a structure: a div, or an svg rect',
  edge: 'a link between nodes: an svg line or path, or a div drawn as a rule',
  head: 'an arrowhead: an svg path inside a marker',
  tick: 'a scale mark or threshold line',
  chip: 'a small rounded tag: a state or a kind',
  ring: 'a circle around the one thing to look at',
  highlight: 'the one figure the claim rests on, in the accent (at most one per picture)',
  dim: 'what is context, not the point',
} as const

export type ClassName = keyof typeof CLASSES

const MARK_CLASSES = new Set<string>(['bar', 'track', 'dot', 'node', 'edge', 'head', 'tick', 'chip', 'ring'])
const LAYOUT_CLASSES = new Set<string>(['row', 'col', 'grid', 'card'])
const SHAPES = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path'])

/** The most marks a picture may draw: past this it is a table drawn as dots, not a glance. */
export const MAX_MARKS = 48
/** The most lines a picture may draw as series: past this the eye cannot follow one (Franconeri: about four at a glance). */
export const MAX_SERIES = 4

/** CSS's named colours, so a picture cannot paint `green` past the token check. */
const NAMED_COLOURS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue ' +
  'chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta ' +
  'darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink ' +
  'deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey ' +
  'honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
  'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime ' +
  'limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen ' +
  'mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
  'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue ' +
  'saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle ' +
  'tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '))

const vars = Object.entries(TOKENS).map(([name, hex]) => `--${name}:${hex}`).join(';')

/**
 * The stylesheet every picture draws with, put first inside its root (`.vp`). The tokens are custom
 * properties there; each class styles an HTML element and an SVG shape alike, so a nested `<svg>` and an
 * HTML layout read the same.
 */
export const STYLESHEET = [
  `.vp{${vars};font:13px/1.45 -apple-system,system-ui,sans-serif;color:var(--text)}`,
  '.vp *{box-sizing:border-box;margin:0}',
  // Inherited, not set on text: a text's own fill or font-size attribute must still win over the default.
  '.vp svg{overflow:visible;display:block;fill:var(--dim);font-size:12px}',
  '.label{color:var(--dim);fill:var(--dim);font-size:12px}',
  '.value{color:var(--text);fill:var(--text);font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}',
  '.caption{color:var(--quiet);fill:var(--quiet);font-size:12px}',
  '.row{display:flex;flex-direction:row;align-items:center}',
  '.col{display:flex;flex-direction:column}',
  '.grid{display:grid;grid-template-columns:max-content 1fr;align-items:center;column-gap:10px}',
  '.gap-1{gap:4px}.gap-2{gap:8px}.gap-3{gap:16px}',
  '.grow{flex:1;min-width:0}',
  '.card{border:1px solid var(--rule);background:var(--fill);border-radius:8px;padding:8px 10px}',
  'div.bar,span.bar{display:block;height:10px;border-radius:2px;background:var(--line)}',
  'div.track,span.track{display:block;height:10px;border-radius:2px;background:var(--rule);overflow:hidden}',
  'div.track>.bar{height:100%}',
  'rect.bar,path.bar{fill:var(--line)}rect.track{fill:var(--rule)}',
  'div.dot,span.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--line);flex:none}',
  'circle.dot{fill:var(--line)}',
  'div.node,span.node{border:1px solid var(--line);border-radius:6px;padding:3px 8px;background:var(--fill)}',
  'rect.node,circle.node{fill:var(--fill);stroke:var(--line);stroke-width:1}',
  'line.edge,path.edge,polyline.edge{stroke:var(--line);stroke-width:1.5;fill:none}',
  'div.edge,span.edge{flex:1;min-width:12px;border-top:1.5px solid var(--line)}',
  '.head{fill:var(--line);stroke:none}',
  'line.tick,path.tick{stroke:var(--quiet);stroke-width:1}',
  'div.tick,span.tick{border-left:1px dashed var(--quiet);align-self:stretch}',
  '.chip{display:inline-block;border:1px solid var(--rest);border-radius:10px;padding:0 8px;font-size:12px;color:var(--label);white-space:nowrap}',
  '.ring{fill:none;stroke:var(--accent);stroke-width:2}',
  'div.ring,span.ring{border:2px solid var(--accent);border-radius:999px;padding:2px 6px}',
  '.highlight{color:var(--text);font-weight:600}',
  'div.bar.highlight,span.bar.highlight,div.dot.highlight,span.dot.highlight{background:var(--accent)}',
  'rect.bar.highlight,path.bar.highlight,circle.dot.highlight,.head.highlight{fill:var(--accent)}',
  'div.node.highlight,span.node.highlight,div.edge.highlight,div.tick.highlight{border-color:var(--accent)}',
  'rect.node.highlight,circle.node.highlight,line.edge.highlight,path.edge.highlight,polyline.edge.highlight,line.tick.highlight{stroke:var(--accent)}',
  'text.highlight{fill:var(--text);font-weight:600}',
  '.chip.highlight{border-color:var(--accent);color:var(--text)}',
  '.dim{opacity:.45}',
].join('')

const classesOf = (tag: Tag): string[] => (tag.attrs.class ?? '').split(/\s+/).filter(one => one !== '')

/** The class names a fragment's own style sheets define, so a picture may add a class of its own. */
const ownClasses = (sheets: readonly string[]): Set<string> => new Set(sheets.flatMap(sheet => [...sheet.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map(found => found[1]!)))

const COLOUR_ATTRS = new Set(['fill', 'stroke', 'color', 'stop-color', 'flood-color', 'lighting-color'])
const KEYWORDS = new Set(['none', 'transparent', 'currentcolor', 'inherit'])
const TOKEN_VAR = new RegExp(`^var\\(--(${Object.keys(TOKENS).join('|')})\\)$`)
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/
const COLOUR_PROPS = /(?:^|;)\s*((?:background-)?color|background|fill|stroke|border(?:-[a-z]+)*-color|border(?:-(?:top|right|bottom|left))?|outline|stop-color)\s*:\s*([^;]+)/gi

/** Why one colour value is not a token, or null when it is one. */
function colourWrong(value: string): string | null {
  const v = value.trim()
  // A paint server inside the picture (a gradient) is drawn from stops, which are checked as colours themselves.
  if (KEYWORDS.has(v.toLowerCase()) || TOKEN_VAR.test(v) || /^url\(#[\w-]+\)$/.test(v)) return null
  if (LITERAL.test(v)) return `\`${v}\``
  const word = v.toLowerCase().split(/[\s,]+/).find(one => NAMED_COLOURS.has(one))
  if (word !== undefined) return `\`${word}\``
  // A border or background shorthand may hold widths and styles beside its colour: only a var() or a literal is a colour there.
  const named = v.match(/var\(--([\w-]+)\)/g)?.find(one => !TOKEN_VAR.test(one))
  return named === undefined ? null : `\`${named}\``
}

const TOKEN_LIST = Object.keys(TOKENS).map(name => `var(--${name})`).join(', ')

/**
 * What the design system's rules find wrong with a fragment the picture module already read, each naming its
 * rule, its count and the repair. Empty when the picture keeps them. Never "drop": every rule says how to mend.
 */
export function designChecks(tags: readonly Tag[], sheets: readonly string[]): string[] {
  const reasons: string[] = []
  const own = ownClasses(sheets)
  const marks = tags.filter(tag => SHAPES.has(tag.name) || classesOf(tag).some(one => MARK_CLASSES.has(one)))
  if (marks.length === 0) {
    reasons.push('it draws no mark, so it is text, not a picture: draw the fact as marks (bar, track, dot, node, edge, tick, chip, ring, or an svg shape) with the words as their labels')
  } else if (marks.length > MAX_MARKS) {
    reasons.push(`it draws ${marks.length} marks, over ${MAX_MARKS}: group or count them, and draw only the ones the claim compares`)
  }
  const lines = tags.filter(tag => tag.name === 'polyline')
  if (lines.length > MAX_SERIES) {
    reasons.push(`it draws ${lines.length} lines, over ${MAX_SERIES}: keep the series the claim compares and dim or drop the rest, or pass the table as sparks`)
  }
  const highlighted = tags.filter(tag => classesOf(tag).includes('highlight'))
  if (highlighted.length > 1) {
    reasons.push(`it has ${highlighted.length} highlights (${highlighted.map(tag => `<${tag.name}>`).join(', ')}): keep \`highlight\` on the one figure the claim rests on, and dim or leave plain the rest`)
  }
  const unknown = [...new Set(tags.flatMap(classesOf).filter(one => !(one in CLASSES) && !own.has(one) && one !== 'vp'))]
  if (unknown.length > 0) {
    reasons.push(`class ${unknown.map(one => `\`${one}\``).join(', ')} is not in the vocabulary (${Object.keys(CLASSES).join(', ')}): use one of those, or define it in the picture's own <style>`)
  }
  const colours = new Set<string>()
  for (const tag of tags) {
    for (const [attr, value] of Object.entries(tag.attrs)) {
      if (COLOUR_ATTRS.has(attr.toLowerCase())) {
        const wrong = colourWrong(value)
        if (wrong !== null) colours.add(wrong)
      } else if (attr.toLowerCase() === 'style') {
        for (const found of value.matchAll(COLOUR_PROPS)) {
          const wrong = colourWrong(found[2]!)
          if (wrong !== null) colours.add(wrong)
        }
      }
    }
  }
  for (const sheet of sheets) {
    for (const found of sheet.matchAll(new RegExp(LITERAL.source, 'g'))) colours.add(`\`${found[0]}\``)
    for (const found of sheet.matchAll(/:\s*([^;}]+)/g)) {
      const word = found[1]!.toLowerCase().split(/[\s,]+/).find(one => NAMED_COLOURS.has(one))
      if (word !== undefined) colours.add(`\`${word}\``)
    }
  }
  if (colours.size > 0) {
    reasons.push(`it names ${[...colours].join(', ')}, a colour outside the tokens: write a class, or one of ${TOKEN_LIST}`)
  }
  return reasons
}

/**
 * Whether a picture's layout is vouched for without a browser: it is laid out by the vocabulary's layout
 * classes, or it is svg drawings of fixed height that together fit the height stated. Anything else is free-form
 * layout the counts cannot vouch for, so the headless check runs on it (spec 181).
 */
export function layoutVouched(tags: readonly Tag[], height: number): boolean {
  // Positioned or fixed-size boxes escape the layout classes' flow, whatever else the picture uses.
  if (tags.some(tag => /(?:^|;)\s*(?:position|top|bottom|height|max-height|min-height|transform)\s*:/i.test(tag.attrs.style ?? '') && tag.name !== 'svg')) return false
  const top = tags.filter(tag => tag.depth === 0 && tag.name !== 'style')
  if (top.length === 0) return false
  const fixed = (tag: Tag) => tag.name === 'svg' && Number.isFinite(Number(tag.attrs.height)) && Number(tag.attrs.height) > 0
  // Every top-level element is laid out by the vocabulary, or is an svg of fixed height; the svgs alone must fit.
  if (!top.every(tag => fixed(tag) || classesOf(tag).some(one => LAYOUT_CLASSES.has(one)))) return false
  return top.filter(fixed).reduce((sum, tag) => sum + Number(tag.attrs.height), 0) <= height
}
