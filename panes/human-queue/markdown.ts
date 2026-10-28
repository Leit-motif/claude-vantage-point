// An item's Markdown as blocks of styled runs, for the native card's body (issue
// 79). The desktop refuses its own Markdown element inside a Client, and the body
// must stay a Client so a click on it gives the pane the keyboard, so the body
// draws these with Box and Text instead: paragraphs and headings of runs, list
// items with their nesting, and fenced blocks as their own lines. Pure.

export type Run = { text: string; bold?: true; italic?: true; code?: true }

export type Block =
  | { kind: 'para'; depth: number; runs: Run[] }
  | { kind: 'heading'; depth: number; runs: Run[] }
  /** `marker` is `•` for a bullet, or the item's own number with its `.`. */
  | { kind: 'item'; depth: number; marker: string; runs: Run[] }
  | { kind: 'code'; depth: number; lang: string; lines: string[] }

type Style = Omit<Run, 'text'>

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^`\s]*)/
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const HEADING = /^\s*#{1,6}\s+(.*?)\s*#*\s*$/

const indentOf = (line: string) => (/^\s*/.exec(line)?.[0] ?? '').replace(/\t/g, '    ').length

/** The blocks `markdown` draws as, its list nesting kept as each block's `depth`. */
export function blocks(markdown: string): Block[] {
  const out: Block[] = []
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  // The open list items, outermost first: where each one's marker and text start.
  const open: { marker: number; content: number }[] = []
  // The paragraph or item a next line of text runs on in, until a blank line.
  let prose: { block: Extract<Block, { runs: Run[] }>; source: string } | null = null
  const depthAt = (column: number) => {
    while (open.length > 0 && open[open.length - 1]!.content > column) open.pop()
    return open.length
  }
  const close = () => {
    if (prose !== null) prose.block.runs = runs(prose.source)
    prose = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.trim() === '') {
      close()
      continue
    }
    const fence = FENCE.exec(line)
    if (fence !== null) {
      close()
      const at = indentOf(line)
      const mark = fence[2]!
      const body: string[] = []
      for (i++; i < lines.length; i++) {
        const next = lines[i]!
        if (next.trim().startsWith(mark[0]!.repeat(mark.length)) && next.trim().replace(/[`~]/g, '') === '') break
        body.push(next.slice(Math.min(at, indentOf(next))))
      }
      out.push({ kind: 'code', depth: depthAt(at), lang: fence[3] ?? '', lines: body })
      continue
    }
    const item = ITEM.exec(line)
    if (item !== null) {
      close()
      const marker = indentOf(line)
      const depth = depthAt(marker)
      open.push({ marker, content: marker + item[2]!.length + 1 })
      const block: Block = { kind: 'item', depth, marker: /\d/.test(item[2]!) ? item[2]!.replace(')', '.') : '•', runs: [] }
      out.push(block)
      prose = { block, source: item[3]! }
      continue
    }
    const heading = HEADING.exec(line)
    if (heading !== null) {
      close()
      out.push({ kind: 'heading', depth: depthAt(indentOf(line)), runs: runs(heading[1]!) })
      continue
    }
    if (prose !== null) {
      prose.source += ` ${line.trim()}`
      continue
    }
    const block: Block = { kind: 'para', depth: depthAt(indentOf(line)), runs: [] }
    out.push(block)
    prose = { block, source: line.trim() }
  }
  close()
  return out
}

/** One line of Markdown as styled runs: bold, italic and inline code, a link as its text, a backslash escape as its character. */
export function runs(text: string): Run[] {
  const out: Run[] = []
  inline(text, {}, out)
  return out
}

function push(out: Run[], text: string, style: Style) {
  if (text === '') return
  const last = out[out.length - 1]
  if (last !== undefined && last.bold === style.bold && last.italic === style.italic && last.code === style.code) last.text += text
  else out.push({ text, ...style })
}

const wordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c)

function inline(text: string, style: Style, out: Run[]) {
  let plain = ''
  const flush = () => {
    push(out, plain, style)
    plain = ''
  }
  for (let i = 0; i < text.length; ) {
    const c = text[i]!
    if (c === '\\' && i + 1 < text.length && /[!-/:-@[-`{-~]/.test(text[i + 1]!)) {
      plain += text[i + 1]
      i += 2
      continue
    }
    if (c === '`') {
      const ticks = /^`+/.exec(text.slice(i))![0]
      const end = text.indexOf(ticks, i + ticks.length)
      // The closing run is exactly as long as the opening one.
      if (end !== -1 && text[end + ticks.length] !== '`') {
        flush()
        let code = text.slice(i + ticks.length, end)
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ')) code = code.slice(1, -1)
        push(out, code, { ...style, code: true })
        i = end + ticks.length
        continue
      }
      plain += ticks
      i += ticks.length
      continue
    }
    if (c === '[') {
      const link = /^\[([^\]]+)\]\([^)\s]*\)/.exec(text.slice(i))
      if (link !== null) {
        flush()
        inline(link[1]!, style, out)
        i += link[0].length
        continue
      }
    }
    if (c === '*' || c === '_') {
      const double = text[i + 1] === c
      const mark = double ? c + c : c
      const after = text[i + mark.length]
      // An opener is followed by text, and an underscore inside a word is a letter.
      const opens = after !== undefined && !/\s/.test(after) && after !== c && !(c === '_' && wordChar(text[i - 1]))
      const end = opens ? closing(text, i + mark.length, mark) : -1
      if (end !== -1) {
        flush()
        inline(text.slice(i + mark.length, end), double ? { ...style, bold: true } : { ...style, italic: true }, out)
        i = end + mark.length
        continue
      }
      plain += mark
      i += mark.length
      continue
    }
    plain += c
    i++
  }
  flush()
}

/** Where `mark` closes an emphasis opened before `from`, skipping inline code; -1 when it never does. */
function closing(text: string, from: number, mark: string): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '`') {
      const ticks = /^`+/.exec(text.slice(i))![0]
      const end = text.indexOf(ticks, i + ticks.length)
      if (end !== -1) i = end + ticks.length - 1
      continue
    }
    if (text.startsWith(mark, i) && !/\s/.test(text[i - 1] ?? ' ') && text[i + mark.length] !== mark[0] && !(mark[0] === '_' && wordChar(text[i + mark.length]))) {
      return i
    }
  }
  return -1
}
