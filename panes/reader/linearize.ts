// Linearize: a reply's structured layout to the ordered stream the pacing
// engine reads one word at a time. It preserves and formats; it never
// summarizes. Every word of the reply and its tool output survives in order,
// except inline markup characters and URL paths (see `inline`). Pure
// deterministic parsing with no imports beyond the stream type, so node runs it
// as well as the mod.
//
// Cue vocabulary (kind 'cue'), kept short and fixed:
//   Heading | Subheading           before a heading's text (levels 1-2, 3-6)
//   Break                          a horizontal rule
//   Quote | End quote              around a block quote's content
//   Item N | Bullet N              before a list item; N is the dotted path of
//                                  positions through the enclosing items
//                                  ("Item 2", then "Bullet 2.1"); an ordered
//                                  item keeps its source number. A task item
//                                  appends "done" or "to do".
//   End list | End sublist         after a top-level list, after a nested one
//   Code | Code <lang> | End code  around fenced or indented code
//   Table | End table              around a table's rows
//   Tool <name> | End tool         around a tool call's output (an MCP tool is
//                                  named by its last segment)
import type { Run } from './stream.ts'

export type ReplyPart =
  | { kind: 'text'; text: string } // one assistant text block, markdown
  | { kind: 'tool'; name: string; output: string } // one tool call's result text, between text blocks

export function linearize(parts: ReplyPart[]): Run[] {
  const out: Run[] = []
  for (const part of parts) {
    if (part?.kind === 'text') {
      const lines = splitLines(String(part.text ?? ''))
      blocks(lines, { path: [], depth: 0, defs: definitions(lines) }, out)
    } else if (part?.kind === 'tool') toolRuns(String(part.name ?? ''), String(part.output ?? ''), out)
  }
  return out
}

/** How many containers (quotes and list items) nest before the rest is read as plain text. */
const MAX_DEPTH = 32

/** Where we are: the item numbers above, the container depth, and the reference labels this text defines. */
type Scope = { path: number[]; depth: number; defs: ReadonlySet<string> }

const normLabel = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase()

/** The labels of `[label]: url` definition lines, so `[text][label]` is a link only when its label exists. */
function definitions(lines: string[]): Set<string> {
  const defs = new Set<string>()
  for (const line of lines) {
    const m = /^ {0,3}\[([^\]^][^\]]*)\]:/.exec(line)
    if (m) defs.add(normLabel(m[1] as string))
  }
  return defs
}

const cue = (text: string): Run => ({ kind: 'cue', text })

function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/)
}

// Tool output. Verbatim except that blank lines around it carry no words and go.
function toolRuns(name: string, output: string, out: Run[]): void {
  const body = output.replace(/\r\n/g, '\n').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '')
  // An MCP tool is mcp__<server>__<tool>; the tool is what the reader needs.
  const tool = (/^mcp__.+__(.+)$/.exec(name.trim()) ?? [])[1] ?? name
  out.push(cue(`Tool ${tool.trim().replace(/\s+/g, ' ') || 'tool'}`))
  if (body !== '') out.push({ kind: 'code', text: body })
  out.push(cue('End tool'))
}

// ---------- line helpers ----------

/** Columns of leading whitespace; a tab runs to the next multiple of 4. */
function indentOf(line: string): number {
  let col = 0
  for (const ch of line) {
    if (ch === ' ') col++
    else if (ch === '\t') col += 4 - (col % 4)
    else break
  }
  return col
}

/** The line with up to `n` columns of leading whitespace removed. */
function stripIndent(line: string, n: number): string {
  let col = 0
  let i = 0
  while (i < line.length && col < n) {
    const ch = line[i]
    if (ch === ' ') {
      col++
      i++
    } else if (ch === '\t') {
      const width = 4 - (col % 4)
      if (col + width > n) return ' '.repeat(col + width - n) + line.slice(i + 1)
      col += width
      i++
    } else break
  }
  return line.slice(i)
}

const isBlank = (line: string): boolean => line.trim() === ''

const FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*(.*)$/
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const QUOTE = /^ {0,3}>[ \t]?/
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/
const ITEM = /^( {0,3})([-+*]|\d{1,9}[.)])(?:([ \t]+)(.*))?$/

type Fence = { indent: number; char: string; length: number; lang: string }

function openFence(line: string): Fence | null {
  const m = FENCE.exec(line)
  if (!m) return null
  const marker = m[2] as string
  const info = (m[3] as string).trim()
  if (marker[0] === '`' && info.includes('`')) return null
  const word = info.split(/\s+/)[0] ?? ''
  const lang = word.replace(/^\{\.?|\}$/g, '').replace(/^\./, '')
  return {
    indent: (m[1] as string).length,
    char: marker[0] as string,
    length: marker.length,
    lang: /^[\w+#.:/-]+$/.test(lang) ? lang : '',
  }
}

/** A line that begins a new block, and so ends a lazy continuation. */
function startsBlock(line: string): boolean {
  return openFence(line) !== null || ATX.test(line) || HR.test(line) || QUOTE.test(line) || ITEM.test(line)
}

/** A line that may interrupt a paragraph (CommonMark: only `1.` starts an interrupting ordered list). */
function interrupts(lines: string[], i: number): boolean {
  const line = lines[i] as string
  if (openFence(line) !== null || ATX.test(line) || HR.test(line) || QUOTE.test(line) || isTableStart(lines, i)) return true
  const item = ITEM.exec(line)
  if (!item || (item[4] ?? '').trim() === '') return false
  const marker = item[2] as string
  return /^[-+*]$/.test(marker) || parseInt(marker, 10) === 1
}

// ---------- blocks ----------

function blocks(lines: string[], scope: Scope, out: Run[]): void {
  if (scope.depth >= MAX_DEPTH) return plain(lines, scope, out)
  let i = 0
  while (i < lines.length) {
    const line = lines[i] as string
    if (isBlank(line)) {
      i++
      continue
    }
    const fence = openFence(line)
    if (fence) {
      i = fencedCode(lines, i, fence, out)
      continue
    }
    if (indentOf(line) >= 4) {
      i = indentedCode(lines, i, out)
      continue
    }
    const atx = ATX.exec(line)
    if (atx) {
      heading((atx[1] as string).length, (atx[2] ?? '').replace(/[ \t]+#+$/, '').replace(/^#+$/, ''), scope, out)
      i++
      continue
    }
    if (HR.test(line)) {
      out.push(cue('Break'))
      i++
      continue
    }
    if (QUOTE.test(line)) {
      i = blockQuote(lines, i, scope, out)
      continue
    }
    if (isTableStart(lines, i)) {
      i = table(lines, i, scope, out)
      continue
    }
    if (ITEM.test(line)) {
      i = list(lines, i, scope, out)
      continue
    }
    i = paragraph(lines, i, scope, out)
  }
}

/** Past the depth cap nothing is parsed: each blank-separated chunk is a paragraph, markers and all. */
function plain(lines: string[], scope: Scope, out: Run[]): void {
  let chunk: string[] = []
  const flush = () => {
    const text = inline(chunk.join(' '), scope.defs)
    if (text !== '') out.push({ kind: 'prose', text })
    chunk = []
  }
  for (const line of lines) {
    if (isBlank(line)) flush()
    else chunk.push(line)
  }
  flush()
}

function heading(level: number, raw: string, scope: Scope, out: Run[]): void {
  const text = inline(raw, scope.defs)
  if (text === '') return
  out.push(cue(level <= 2 ? 'Heading' : 'Subheading'), { kind: 'prose', text })
}

function paragraph(lines: string[], start: number, scope: Scope, out: Run[]): number {
  const buf = [lines[start] as string]
  let j = start + 1
  while (j < lines.length) {
    const line = lines[j] as string
    if (isBlank(line)) break
    const setext = SETEXT.exec(line)
    if (setext) {
      heading((setext[1] as string)[0] === '=' ? 1 : 2, buf.join(' '), scope, out)
      return j + 1
    }
    if (interrupts(lines, j)) break
    buf.push(line)
    j++
  }
  const text = inline(buf.join(' '), scope.defs)
  if (text !== '') out.push({ kind: 'prose', text })
  return j
}

function codeBlock(lang: string, code: string[], out: Run[]): void {
  out.push(cue(lang === '' ? 'Code' : `Code ${lang}`))
  let from = 0
  let to = code.length
  while (from < to && isBlank(code[from] as string)) from++
  while (to > from && isBlank(code[to - 1] as string)) to--
  if (to > from) out.push({ kind: 'code', text: code.slice(from, to).join('\n') })
  out.push(cue('End code'))
}

// An unclosed fence runs to the end of its container, as CommonMark has it.
function fencedCode(lines: string[], start: number, fence: Fence, out: Run[]): number {
  const code: string[] = []
  let j = start + 1
  while (j < lines.length) {
    const line = lines[j] as string
    const close = FENCE.exec(line)
    if (close) {
      const marker = close[2] as string
      if (marker[0] === fence.char && marker.length >= fence.length && (close[3] as string).trim() === '') {
        j++
        break
      }
    }
    code.push(stripSpaces(line, fence.indent))
    j++
  }
  codeBlock(fence.lang, code, out)
  return j
}

/** Remove up to `n` leading spaces only: a fence's code keeps its tabs. */
function stripSpaces(line: string, n: number): string {
  let i = 0
  while (i < n && line[i] === ' ') i++
  return line.slice(i)
}

function indentedCode(lines: string[], start: number, out: Run[]): number {
  let j = start
  let last = start
  while (j < lines.length && (isBlank(lines[j] as string) || indentOf(lines[j] as string) >= 4)) {
    if (!isBlank(lines[j] as string)) last = j
    j++
  }
  const code = lines.slice(start, last + 1).map(line => stripIndent(line, 4))
  codeBlock('', code, out)
  return last + 1
}

function blockQuote(lines: string[], start: number, scope: Scope, out: Run[]): number {
  const inner: string[] = []
  let j = start
  while (j < lines.length) {
    const line = lines[j] as string
    if (QUOTE.test(line)) inner.push(line.replace(QUOTE, ''))
    else if (!isBlank(line) && !isBlank(lines[j - 1] as string) && !startsBlock(line)) inner.push(line)
    else break
    j++
  }
  const runs: Run[] = []
  blocks(inner, { ...scope, depth: scope.depth + 1 }, runs)
  if (runs.length > 0) out.push(cue('Quote'), ...runs, cue('End quote'))
  return j
}

// ---------- lists ----------

function list(lines: string[], start: number, scope: Scope, out: Run[]): number {
  const { path } = scope
  const firstMarker = (ITEM.exec(lines[start] as string) as RegExpExecArray)[2] as string
  const ordered = /^\d/.test(firstMarker)
  let number = ordered ? parseInt(firstMarker, 10) : 1
  let i = start
  for (;;) {
    const m = ITEM.exec(lines[i] as string) as RegExpExecArray
    const markerIndent = (m[1] as string).length
    const marker = m[2] as string
    const content = m[4] ?? ''
    const spaces = (m[3] ?? '').length
    const contentIndent = markerIndent + marker.length + (content.trim() === '' || spaces > 4 ? 1 : spaces)
    // Looser than CommonMark on purpose: a model nests under "1. " with two spaces.
    const threshold = Math.min(contentIndent, markerIndent + 2)

    const body = [content]
    let j = i + 1
    while (j < lines.length) {
      const line = lines[j] as string
      if (isBlank(line)) {
        let k = j
        while (k < lines.length && isBlank(lines[k] as string)) k++
        if (k < lines.length && indentOf(lines[k] as string) >= threshold) {
          while (j < k) {
            body.push('')
            j++
          }
          continue
        }
        break
      }
      const indent = indentOf(line)
      if (indent >= threshold) {
        body.push(stripIndent(line, Math.min(indent, contentIndent)))
      } else if (!isBlank(lines[j - 1] as string) && !startsBlock(line)) {
        body.push(line) // lazy continuation of the item's last paragraph
      } else break
      j++
    }

    let label = `${ordered ? 'Item' : 'Bullet'} ${[...path, number].join('.')}`
    const task = /^\[([ xX])\](?:[ \t]+|$)/.exec(body[0] as string)
    if (task) {
      label += task[1] === ' ' ? ' to do' : ' done'
      body[0] = (body[0] as string).slice(task[0].length)
    }
    out.push(cue(label))
    blocks(body, { ...scope, path: [...path, number], depth: scope.depth + 1 }, out)
    number++

    let k = j
    while (k < lines.length && isBlank(lines[k] as string)) k++
    const next = k < lines.length ? ITEM.exec(lines[k] as string) : null
    if (next && /^\d/.test(next[2] as string) === ordered && !HR.test(lines[k] as string)) {
      i = k
      continue
    }
    i = j
    break
  }
  out.push(cue(path.length === 0 ? 'End list' : 'End sublist'))
  return i
}

// ---------- tables ----------

const DELIMITER = /^:?-+:?$/

/** Split a pipe row into trimmed cells; `\|` is a pipe in the cell, not a separator. */
function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cell = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string
    const next = s[i + 1]
    if (ch === '\\' && next === '|') {
      cell += '|'
      i++
    } else if (ch === '\\' && next === '\\') {
      cell += '\\\\'
      i++
    } else if (ch === '|') {
      cells.push(cell.trim())
      cell = ''
    } else cell += ch
  }
  cells.push(cell.trim())
  return cells
}

function isTableStart(lines: string[], i: number): boolean {
  const head = lines[i] as string
  const rule = lines[i + 1]
  if (rule === undefined || isBlank(head) || indentOf(head) >= 4) return false
  if (!head.includes('|') && !rule.includes('|')) return false
  const marks = splitRow(rule)
  return marks.every(mark => DELIMITER.test(mark)) && marks.length === splitRow(head).length
}

function table(lines: string[], start: number, scope: Scope, out: Run[]): number {
  const headers = splitRow(lines[start] as string).map(cell => inline(cell, scope.defs))
  out.push(cue('Table'))
  let j = start + 2
  let rows = 0
  while (j < lines.length) {
    const line = lines[j] as string
    if (isBlank(line) || startsBlock(line)) break
    const pairs: string[] = []
    splitRow(line).forEach((raw, col) => {
      const value = inline(raw, scope.defs)
      if (value === '') return
      const header = headers[col] ?? `Column ${col + 1}`
      pairs.push(header === '' ? value : `${header}: ${value}`)
    })
    if (pairs.length > 0) {
      out.push({ kind: 'prose', text: pairs.join('; ') })
      rows++
    }
    j++
  }
  // A table with no words in its rows still owes the reader its headers.
  if (rows === 0) {
    const text = headers.filter(header => header !== '').join('; ')
    if (text !== '') out.push({ kind: 'prose', text })
  }
  out.push(cue('End table'))
  return j
}

// ---------- inline markup ----------

const DEST = String.raw`(?:[^()\s<>]|\([^()\s]*\))*`
const IMAGE = new RegExp(String.raw`!\[([^\]]*)\]\(\s*<?(${DEST})>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)`, 'g')
const LINK = new RegExp(
  String.raw`\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\(\s*<?(${DEST})>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)`,
  'g',
)
const REF_LINK = /\[((?:[^\[\]]|\[[^\[\]]*\])+)\]\[([^\]]*)\]/g

/**
 * A bare URL becomes its host, the last path segment when it is a number or
 * short (a number keeps the segment before it, so a pull request reads
 * "pull 3"), and the word link: the cue that a link was there, without a path
 * that is unreadable one word at a time. Trailing punctuation stays after it.
 */
function bareUrl(url: string): string {
  let open = 0
  let close = 0
  let openSq = 0
  let closeSq = 0
  for (const ch of url) {
    if (ch === '(') open++
    else if (ch === ')') close++
    else if (ch === '[') openSq++
    else if (ch === ']') closeSq++
  }
  // One pass from the end: punctuation and unbalanced closers are not part of the URL.
  let end = url.length
  while (end > 0) {
    const last = url[end - 1] as string
    if (/[.,;:!?'"*_~]/.test(last)) end--
    else if (last === ')' && close > open) {
      close--
      end--
    } else if (last === ']' && closeSq > openSq) {
      closeSq--
      end--
    } else break
  }
  const rest = url.slice(0, end).replace(/^[a-z]+:\/\//i, '')
  const authority = rest.split(/[/?#]/, 1)[0] as string
  const host = authority.replace(/^.*@/, '')
  const segments = (rest.slice(authority.length).split(/[?#]/, 1)[0] as string).split('/').filter(segment => segment !== '')
  const last = segments[segments.length - 1] ?? ''
  const before = segments[segments.length - 2] ?? ''
  const path =
    /^\d+$/.test(last) ? (before !== '' && before.length <= 12 ? [before, last] : [last]) : last !== '' && last.length <= 12 ? [last] : []
  return [host, ...path, 'link'].filter(word => word !== '').join(' ') + url.slice(end)
}

/**
 * A line of markdown as plain words. Emphasis markers, code backticks and link
 * syntax go. A link keeps its text and drops its destination; `[text][label]`
 * is a link only when `defs` has the label, so `matrix[i][j]` stays literal. A
 * bare URL or autolink becomes "host [segment] link" (see `bareUrl`). An image
 * becomes "image: alt". Text inside a code span is untouched.
 */
function inline(raw: string, defs: ReadonlySet<string> = new Set()): string {
  const stash: string[] = []
  const hold = (text: string): string => `\uE000${stash.push(text) - 1}\uE001`
  let s = raw.replace(/[\uE000\uE001]/g, '')

  s = s.replace(/(?<![`\\])(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (_, __, code: string) => {
    const flat = code.replace(/\s*\n\s*/g, ' ')
    return hold(/^ .* $/.test(flat) && flat.trim() !== '' ? flat.slice(1, -1) : flat)
  })
  s = s.replace(/\\([!-/:-@[-`{-~])/g, (_, ch: string) => hold(ch))
  s = s.replace(IMAGE, (_, alt: string) => (alt.trim() === '' ? 'image' : `image: ${alt.trim()}`))
  s = s.replace(LINK, (_, text: string, url: string) =>
    /^https?:\/\/\S+$/i.test(text.trim()) || text.trim() === '' ? bareUrl(text.trim() || url) : text,
  )
  s = s.replace(REF_LINK, (whole, text: string, ref: string) =>
    defs.has(normLabel(ref === '' ? text : ref)) ? text : whole,
  )
  s = s.replace(/<(https?:\/\/[^\s<>]+)>/gi, (_, url: string) => bareUrl(url))
  s = s.replace(/<([^\s<>@]+@[^\s<>]+)>/g, '$1')
  s = s.replace(/https?:\/\/[^\s<>]+/gi, bareUrl)
  s = s.replace(/<br\s*\/?>/gi, ' ')

  s = s.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '$1')
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '$1')
  s = s.replace(/(?<![\w*])\*(?=[^\s*])([^*]*?[^\s*])\*(?![\w*])/g, '$1')
  s = s.replace(/(?<!\w)__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1')
  s = s.replace(/(?<![\w_])_(?=[^\s_])([^_]*?[^\s_])_(?![\w_])/g, '$1')
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')

  return s
    .replace(/\uE000(\d+)\uE001/g, (_, n: string) => stash[Number(n)] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}
