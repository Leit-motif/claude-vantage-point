// Whether an argument's picture fits the height it states (issue 175, spec 171), pure: the page a
// headless browser lays the wrapped picture out in, and what the browser printed read back.
// hooks/overflow.ts runs the browser; the card lab runs the same page in its tests.
//
// The page holds the picture exactly as the pane draws it, plus one script of ours that runs once
// the page has loaded and writes how far down the picture's content reaches. The picture itself can
// hold no script (picture.ts refuses one), and the page's policy loads nothing from anywhere.
import { DESIGN_WIDTH, picture } from './picture.ts'
import type { PictureSpec } from './picture.ts'

/**
 * What the layout found. Every measured status carries `smallest`, the smallest text drawn, in CSS pixels at the
 * design width (null when the picture draws no text), for the small-label floor (spec 176).
 */
export type Overflow =
  | { status: 'fits'; smallest: number | null }
  | { status: 'overflows'; by: number; smallest: number | null }
  | { status: 'underfills'; by: number; content: number; smallest: number | null }
  | { status: 'unchecked'; why: string }

/** The smallest text a picture may draw, in CSS pixels at the design width: the pane's own captions are 11 (spec 176). */
export const MIN_TEXT_PX = 12

/** How far past its stated height a picture's content may reach before it overflows: under a pixel is rounding. */
const SLACK = 0.5

/** How far short of its stated height a picture's content may end: past this the pane draws a blank under it (the design review, 2026-11-14). */
const UNDERFILL = 8

/** A page's nonce: only these characters, so it is safe inside an attribute and a policy. */
const NONCE = /^[A-Za-z0-9]{8,64}$/

/**
 * The page that lays `spec` out at `paneWidth` and reports its content's height, or the reasons the
 * picture is refused. `nonce` names the report and the one script the page's policy lets run.
 */
export function measuringPage(spec: PictureSpec, paneWidth: number, nonce: string): { page: string; width: number; height: number } | { refused: string[] } {
  if (!NONCE.test(nonce)) throw new Error(`a measuring page's nonce is 8 to 64 letters and digits, not ${JSON.stringify(nonce)}`)
  const drawn = picture(spec, paneWidth)
  if ('refused' in drawn) return drawn
  // The content's reach is the lowest edge of anything drawn under the foreignObject, in the
  // picture's own units: a child's collapsed top margin moves the wrapper down, and scrollHeight misses it.
  // The smallest text is the font size of each drawn element holding text of its own: HTML's computed size is
  // already in the picture's units, and an svg's text is scaled by its own viewBox, so it goes through its screen
  // transform and back by the picture's scale.
  const script =
    `addEventListener('load',()=>{` +
    `const fo=document.querySelector('#m-${nonce} foreignObject');const box=fo.getBoundingClientRect();const scale=box.width/${DESIGN_WIDTH};` +
    `let reach=0,small=null;for(const e of fo.querySelectorAll('*')){const r=e.getBoundingClientRect();if(!(r.width>0||r.height>0))continue;reach=Math.max(reach,r.bottom-box.top);` +
    `if(![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()!==''))continue;let px=parseFloat(getComputedStyle(e).fontSize);` +
    `if(e instanceof SVGGraphicsElement){const m=e.getScreenCTM();if(m)px=px*Math.hypot(m.a,m.b)/scale}if(small===null||px<small)small=px}` +
    `const out=document.createElement('pre');out.setAttribute('data-measure','${nonce}');` +
    `out.textContent=JSON.stringify({content:Math.round(reach/scale*100)/100,smallest:small===null?null:Math.round(small*100)/100});document.body.append(out)})`
  const page =
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'">` +
    `<style>html,body{margin:0;background:#1f1f1e}</style></head>` +
    `<body><div id="m-${nonce}">${drawn.source}</div><script nonce="${nonce}">${script}</script></body></html>`
  return { page, width: drawn.width, height: drawn.height }
}

/** What the browser's printed DOM says of a picture stated `height` tall, laid out on the page named `nonce`. */
export function readMeasure(dom: string, nonce: string, height: number): Overflow {
  const found = new RegExp(`<pre data-measure="${nonce}">([^<]*)</pre>`).exec(dom)?.[1]
  if (found === undefined) return { status: 'unchecked', why: 'the browser printed no measure: the page did not run' }
  let printed: { content?: unknown; smallest?: unknown }
  try {
    printed = JSON.parse(found.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')) as typeof printed
  } catch {
    return { status: 'unchecked', why: 'the browser printed a measure that is not JSON' }
  }
  const { content } = printed ?? {}
  if (typeof content !== 'number' || !Number.isFinite(content) || content < 0) return { status: 'unchecked', why: 'the browser printed a measure with no height' }
  const given = printed?.smallest
  const smallest = given === null ? null : typeof given === 'number' && Number.isFinite(given) && given > 0 ? given : undefined
  if (smallest === undefined) return { status: 'unchecked', why: 'the browser printed a measure with no text size' }
  if (content > height + SLACK) return { status: 'overflows', by: Math.ceil(content - height), smallest }
  if (content < height - UNDERFILL) return { status: 'underfills', by: Math.floor(height - content), content: Math.ceil(content), smallest }
  return { status: 'fits', smallest }
}
