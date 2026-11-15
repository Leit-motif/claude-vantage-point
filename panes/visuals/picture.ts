// An argument's picture (issue 172, spec 171): the agent's HTML fragment, laid out by
// the desktop's browser through `foreignObject` at a fixed design size, so the Svg's
// box is exactly as tall as the picture at any pane width and nothing is measured to
// draw. Pure: the fragment in, the Svg source or every reason it is refused out.
//
// The check is a small XML tokenizer over tags, attributes and text, with an
// allowlist of passive elements: no DOM exists in the hooks. A picture takes no
// press and loads nothing, so anything that runs code or reaches outside the
// fragment is refused, each reason naming what to fix.
import { TEXT } from '../../hooks/signal.ts'

export type PictureSpec = { html: string; height: number }
export type DrawnPicture = { source: string; width: number; height: number; alt?: string }
export type RefusedPicture = { refused: string[] }

/** The width the agent lays a picture out at, in CSS pixels. */
export const DESIGN_WIDTH = 360
/** The tallest a picture may state, in CSS pixels at the design width. */
export const MAX_HEIGHT = 400
/** The longest wrapped source, under the desktop's 131,072 cap. */
export const MAX_SOURCE = 100_000

const SVG_NS = 'http://www.w3.org/2000/svg'
const XHTML_NS = 'http://www.w3.org/1999/xhtml'
const NAMESPACES = new Set([SVG_NS, XHTML_NS])

/** The passive elements a picture may hold; the decide tool names them to the agent. */
export const PASSIVE = new Set([
  'div', 'span', 'p', 'b', 'strong', 'i', 'em', 'small', 'br', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'style',
  'svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan',
  'defs', 'marker', 'linearGradient', 'radialGradient', 'stop', 'title',
])

/** Elements an agent is likely to reach for, with why each is refused. */
const NAMED: Record<string, string> = {
  script: 'runs code',
  iframe: 'embeds another page',
  object: 'embeds an outside resource',
  embed: 'embeds an outside resource',
  foreignobject: 'nests another HTML layer',
  img: 'loads an image file; draw it with svg shapes',
}

const BASE_STYLE = `font-family: -apple-system, system-ui, sans-serif; color: ${TEXT}; font-size: 14px; line-height: 1.5; margin: 0`

const ENTITY = /^&(?:amp|lt|gt|quot|apos|#([0-9]+)|#x([0-9a-fA-F]+));/
const NAME = /^[A-Za-z_][\w.:-]*/
const OUTSIDE = /(?:https?:|javascript:|vbscript:|data:|file:|blob:|\/\/)/

/** A numeric reference XML accepts: a real code point, not NUL or a surrogate. */
const validPoint = (point: number) => point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)

/** A value's text as the browser reads it: references decoded, case folded, blanks gone (a URL ignores tabs and newlines). */
function decoded(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name] ?? '')
    .replace(/[\s\u0000-\u001f]/g, '')
    .toLowerCase()
}

/** What in a value or stylesheet reaches outside the fragment, if anything. */
function outside(text: string, where: string, css: boolean): string[] {
  const reasons: string[] = []
  const found = OUTSIDE.exec(text)
  if (found) reasons.push(`${where} names an outside resource (\`${found[0]}\`): a picture loads nothing, so inline what it needs`)
  for (const call of text.matchAll(/url\(['"]?([^'")]*)/g)) {
    if (!call[1]?.startsWith('#')) reasons.push(`${where} has \`url(\` to something other than \`#id\`: point it at an element inside the picture`)
  }
  if (css && text.includes('@import')) reasons.push(`${where} has \`@import\`: put the styles inline`)
  if (css && text.includes('\\')) reasons.push(`${where} has a CSS escape (\`\\\`): write the character itself`)
  return reasons
}

type Scan = { reasons: string[]; svgAt: number[] }

/** Tokenize the fragment: every element, attribute and run of text, checked as it goes. Stops at the first malformed token. */
function scan(html: string): Scan {
  const reasons: string[] = []
  const svgAt: number[] = []
  const open: { name: string; at: number }[] = []
  const line = (at: number) => html.slice(0, at).split('\n').length
  const malformed = (what: string, at: number) => reasons.push(`not well-formed XML at line ${line(at)}: ${what}`)

  /** Checks a run of text or an attribute value for a bare `&`; false when one is found. */
  const entities = (text: string, from: number): boolean => {
    for (let i = text.indexOf('&'); i !== -1; i = text.indexOf('&', i + 1)) {
      const ref = ENTITY.exec(text.slice(i))
      const point = ref?.[1] !== undefined ? parseInt(ref[1], 10) : ref?.[2] !== undefined ? parseInt(ref[2], 16) : null
      if (!ref || (point !== null && !validPoint(point))) {
        malformed('a stray `&`; write `&amp;`, or use &lt; &gt; &quot; &apos; or a numeric reference', from + i)
        return false
      }
    }
    return true
  }

  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    const textEnd = lt === -1 ? html.length : lt
    const text = html.slice(i, textEnd)
    if (!entities(text, i)) return { reasons, svgAt }
    if (open.at(-1)?.name === 'style') reasons.push(...outside(decoded(text), `the <style> at line ${line(i)}`, true))
    if (lt === -1) break
    i = lt

    const rest = html.slice(i, i + 12)
    if (rest.startsWith('<!--')) {
      const end = html.indexOf('-->', i + 4)
      if (end === -1) return malformed('a comment that never closes', i), { reasons, svgAt }
      i = end + 3
      continue
    }
    if (/^<!doctype/i.test(rest)) return reasons.push(`a DOCTYPE at line ${line(i)}: a picture is a fragment, so drop it`), { reasons, svgAt }
    if (rest.startsWith('<!ENTITY')) return reasons.push(`an entity declaration (\`<!ENTITY\`) at line ${line(i)}: write the text itself`), { reasons, svgAt }
    if (rest.startsWith('<![CDATA[')) return reasons.push(`a CDATA section at line ${line(i)}: escape the text with &lt; and &amp; instead`), { reasons, svgAt }
    if (rest.startsWith('<!') || rest.startsWith('<?')) return malformed(`\`${rest.slice(0, 2)}\` opens a declaration a picture cannot hold`, i), { reasons, svgAt }

    if (rest.startsWith('</')) {
      const name = NAME.exec(html.slice(i + 2))?.[0]
      const close = name === undefined ? -1 : i + 2 + name.length
      const end = close === -1 ? null : /^\s*>/.exec(html.slice(close))
      if (name === undefined || !end) return malformed('a closing tag that is not `</name>`', i), { reasons, svgAt }
      const top = open.pop()
      if (!top) return malformed(`\`</${name}>\` closes nothing`, i), { reasons, svgAt }
      if (top.name !== name) return malformed(`\`</${name}>\` closes \`<${top.name}>\` from line ${line(top.at)}`, i), { reasons, svgAt }
      i = close + end[0].length
      continue
    }

    const name = NAME.exec(html.slice(i + 1))?.[0]
    if (name === undefined) return malformed('a stray `<`; write `&lt;`', i), { reasons, svgAt }
    const named = NAMED[name.toLowerCase()]
    if (named) reasons.push(`\`<${name}>\` at line ${line(i)} ${named}: a picture holds passive elements only`)
    else if (!PASSIVE.has(name)) reasons.push(`\`<${name}>\` at line ${line(i)} is not a passive element a picture may hold (${[...PASSIVE].join(', ')})`)
    const tagAt = i
    i += 1 + name.length

    const seen = new Set<string>()
    let selfClosing = false
    for (;;) {
      const blank = /^\s*/.exec(html.slice(i))?.[0] ?? ''
      i += blank.length
      if (html.startsWith('/>', i)) { selfClosing = true; i += 2; break }
      if (html.startsWith('>', i)) { i += 1; break }
      if (i >= html.length) return malformed(`\`<${name}\` never ends with \`>\``, tagAt), { reasons, svgAt }
      const attr = NAME.exec(html.slice(i))?.[0]
      if (attr === undefined || blank === '') return malformed(`\`<${name}\` holds something that is not an attribute`, i), { reasons, svgAt }
      i += attr.length
      const eq = /^\s*=\s*/.exec(html.slice(i))
      if (!eq) return malformed(`attribute \`${attr}\` has no value; write \`${attr}="…"\``, i), { reasons, svgAt }
      i += eq[0].length
      const quote = html[i]
      if (quote !== '"' && quote !== "'") return malformed(`attribute \`${attr}\` is unquoted; put its value in quotes`, i), { reasons, svgAt }
      const valueEnd = html.indexOf(quote, i + 1)
      if (valueEnd === -1) return malformed(`attribute \`${attr}\`'s quote never closes`, i), { reasons, svgAt }
      const value = html.slice(i + 1, valueEnd)
      if (value.includes('<')) return malformed(`attribute \`${attr}\` holds a \`<\`; write \`&lt;\``, i), { reasons, svgAt }
      if (!entities(value, i + 1)) return { reasons, svgAt }
      if (seen.has(attr)) return malformed(`attribute \`${attr}\` is given twice on \`<${name}>\``, i), { reasons, svgAt }
      seen.add(attr)
      i = valueEnd + 1

      const where = `attribute \`${attr}\` on \`<${name}>\` at line ${line(tagAt)}`
      const lower = attr.toLowerCase()
      const plain = decoded(value)
      if (lower.startsWith('on')) reasons.push(`${where} is an event handler: a picture runs no code, so drop it`)
      else if (lower === 'srcdoc') reasons.push(`${where} embeds another page: drop it`)
      else if (lower === 'xmlns') {
        if (!NAMESPACES.has(value)) reasons.push(`${where} names a namespace other than SVG's or XHTML's: drop it`)
      } else if (attr.includes(':')) reasons.push(`${where} is namespaced: drop the prefix (write \`href\`, not \`xlink:href\`)`)
      else if (lower === 'href' && !plain.startsWith('#')) reasons.push(`${where} points outside the picture: an href may only name \`#id\``)
      else reasons.push(...outside(plain, where, lower === 'style'))
    }
    if (name === 'svg' && !seen.has('xmlns')) svgAt.push(tagAt + 4)
    if (!selfClosing) open.push({ name, at: tagAt })
  }
  const unclosed = open.at(-1)
  if (unclosed) malformed(`\`<${unclosed.name}>\` is never closed; close it, or write \`<${unclosed.name}/>\``, unclosed.at)
  return { reasons, svgAt }
}

/**
 * The Svg the Decision pane draws for an argument's picture, at the pane's width in
 * CSS pixels, or every reason it is refused, each naming what to fix.
 */
export function picture(spec: PictureSpec, paneWidth: number): DrawnPicture | RefusedPicture {
  const reasons: string[] = []
  const { html, height } = spec
  if (!Number.isInteger(height) || height < 1 || height > MAX_HEIGHT) {
    reasons.push(`the height is ${height}: state a whole number of CSS pixels from 1 to ${MAX_HEIGHT}, at the design width of ${DESIGN_WIDTH}`)
  }
  if (html.trim() === '') return { refused: [...reasons, 'the HTML is empty: write the fragment the picture draws'] }
  const tooLong = `the wrapped picture is over ${MAX_SOURCE.toLocaleString('en-US')} characters: draw it with fewer elements`
  if (html.length > MAX_SOURCE) return { refused: [...reasons, tooLong] }

  const scanned = scan(html)
  reasons.push(...scanned.reasons)
  if (reasons.length > 0) return { refused: [...new Set(reasons)] }

  let named = ''
  let from = 0
  for (const at of scanned.svgAt) {
    named += `${html.slice(from, at)} xmlns="${SVG_NS}"`
    from = at
  }
  named += html.slice(from)

  const scaled = Math.ceil((height * paneWidth) / DESIGN_WIDTH)
  const source =
    `<svg xmlns="${SVG_NS}" width="${paneWidth}" height="${scaled}" viewBox="0 0 ${DESIGN_WIDTH} ${height}">` +
    `<foreignObject x="0" y="0" width="${DESIGN_WIDTH}" height="${height}">` +
    `<div xmlns="${XHTML_NS}" style="${BASE_STYLE}">${named}</div>` +
    `</foreignObject></svg>`
  if (source.length > MAX_SOURCE) return { refused: [tooLong] }
  return { source, width: paneWidth, height: scaled }
}
