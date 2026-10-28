// The facts a decision rests on (#110): each argument of the call is one claim
// and the tool output it came from, drawn as data under it, so the deck shows
// what the agent looked at rather than the reply said again (the owner,
// 2026-10-27: "I want to see those same facts, but visualized"). The fork names
// the call by a piece of its input and writes the fact's cells; the code finds
// that call in the session and keeps a cell only when its text, or a number
// only when its value, is in the call's output. All pure; never takes `$`.
import type { HumanQueueArgument, HumanQueueFact } from '../types'

/** The most arguments a deck draws: one picture each, and a card carries two (#105). */
export const MAX_ARGUMENTS = 2
/** The most rows a table or bars fact keeps. */
export const MAX_ROWS = 30
/** The fewest rows a table or bars fact needs to be worth a picture. */
export const MIN_ROWS = 2
/** The most lines an excerpt or a pressed chip shows. */
export const EXCERPT_LINES = 12

/** One of the session's tool calls, as the deck reads it: its tool, its input and the output it printed. */
export type Call = { tool: string; input: Record<string, unknown>; text: string }

/** An argument as the fork wrote it, before its call is found and its fact checked. */
export type ArgumentDraft = { claim: string; call: string; fact: HumanQueueFact | null }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const texts = (v: unknown): string[] | null => (Array.isArray(v) && v.every(isText) ? v.map(one => one.trim()) : null)

/** A fact as the fork wrote it, or null when its shape is broken. */
export function factOf(raw: unknown): HumanQueueFact | null {
  if (!isObject(raw)) return null
  if (raw.shape === 'table') {
    const columns = texts(raw.columns)
    const rows = Array.isArray(raw.rows) ? raw.rows.map(texts) : null
    if (columns === null || rows === null || rows.some(row => row === null || row.length !== columns.length)) return null
    return { shape: 'table', columns, rows: rows as string[][] }
  }
  if (raw.shape === 'bars') {
    const series = texts(raw.series)
    if (series === null || series.length < 1 || series.length > 2 || !Array.isArray(raw.rows)) return null
    const rows = raw.rows.map(row => (isObject(row) && isText(row.label) && Array.isArray(row.values) && row.values.length === series.length &&
      row.values.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0) ? { label: row.label.trim(), values: row.values as number[] } : null))
    if (rows.some(row => row === null)) return null
    return { shape: 'bars', series, rows: rows as { label: string; values: number[] }[], ...(isText(raw.unit) ? { unit: raw.unit.trim() } : {}) }
  }
  if (raw.shape === 'terms') {
    if (!Array.isArray(raw.terms)) return null
    const terms = raw.terms.map(one => (isObject(one) && isText(one.term) && isText(one.meaning) ? { term: one.term.trim(), meaning: one.meaning.trim() } : null))
    return terms.some(one => one === null) ? null : { shape: 'terms', terms: terms as { term: string; meaning: string }[] }
  }
  if (raw.shape === 'lines' && isText(raw.lines)) return { shape: 'lines', lines: raw.lines.replace(/\s+$/, '') }
  return null
}

/** The fork's arguments, at most `MAX_ARGUMENTS`; one with a broken fact keeps its claim. */
export function argumentsOf(raw: unknown): ArgumentDraft[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(one => (isObject(one) && isText(one.claim)
    ? [{ claim: one.claim.trim(), call: isText(one.call) ? one.call.trim() : '', fact: factOf(one.fact) }]
    : [])).slice(0, MAX_ARGUMENTS)
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** Every number a line prints, thousands separators dropped. */
const numbersIn = (text: string) => new Set((text.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? []).map(one => Number(one.replace(/,/g, ''))))

/** A cell that is a number, with its unit's marks: `15`, `$0.12`, `7.3%`, `1,204`. */
const numberOf = (cell: string) => (/^-?\$?\d[\d,]*(\.\d+)?%?$/.test(cell.trim()) ? Number(cell.trim().replace(/[$,%]/g, '')) : null)

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Whether a line holds a cell: a number by its value among the line's numbers, so `1` is never found inside `15`;
 * words as whole words, so `rule` is never found inside `rulings`.
 */
export function lineHolds(line: string, cell: string): boolean {
  return cellEnd(squash(line), cell, 0) !== -1
}

/** Where a cell ends on a line, found at or after `from`, or -1: the step that keeps a row's cells in their order. */
function cellEnd(line: string, cell: string, from: number): number {
  const value = numberOf(cell)
  const pattern = value !== null ? /-?\d[\d,]*(?:\.\d+)?/g : new RegExp(`(?<=^|[^\\p{L}\\p{N}])${escape(squash(cell))}(?=$|[^\\p{L}\\p{N}])`, 'gu')
  if (value === null && squash(cell) === '') return -1
  pattern.lastIndex = from
  for (let hit = pattern.exec(line); hit !== null; hit = pattern.exec(line)) {
    if (value === null || Number(hit[0].replace(/,/g, '')) === value) return hit.index + hit[0].length
  }
  return -1
}

/** Whether a line holds every cell of a row, left to right, so a row never passes with two columns swapped. */
export function lineHoldsRow(line: string, cells: readonly string[]): boolean {
  const said = squash(line)
  let at = 0
  for (const cell of cells) {
    at = cellEnd(said, cell, at)
    if (at === -1) return false
  }
  return true
}

/** The fewest lines a term and its meaning may sit across: a definition that wraps once in the output. */
const TERM_LINES = 3

/**
 * The fact less what its output does not hold, or null when too little is left to draw. A row is kept only when
 * every one of its cells sits on one line of the output, so no row is built from cells of different lines; a term
 * only when its meaning follows within `TERM_LINES` lines (#110's design review).
 */
export function checkFact(fact: HumanQueueFact, output: string): HumanQueueFact | null {
  const lines = output.split('\n')
  const onOneLine = (cells: readonly string[]) => lines.some(line => lineHoldsRow(line, cells))
  const enough = <T,>(rows: T[]) => (rows.length >= MIN_ROWS ? rows.slice(0, MAX_ROWS) : null)
  if (fact.shape === 'table') {
    // A column's name is the fork's label for it; its cells are checked.
    const rows = enough(fact.rows.filter(onOneLine))
    return rows === null ? null : { ...fact, rows }
  }
  if (fact.shape === 'bars') {
    const rows = enough(fact.rows.filter(row => onOneLine([row.label, ...row.values.map(String)])))
    return rows === null ? null : { ...fact, rows }
  }
  if (fact.shape === 'terms') {
    const near = (term: string, meaning: string) => lines.some((line, i) => lineHolds(line, term) &&
      squash(lines.slice(i, i + TERM_LINES).join(' ')).includes(squash(meaning)))
    const terms = fact.terms.filter(one => near(one.term, one.meaning))
    return terms.length === 0 ? null : { ...fact, terms }
  }
  const said = squash(output)
  const kept = fact.lines.split('\n').filter(line => line.trim() !== '').slice(0, EXCERPT_LINES)
  return kept.length > 0 && kept.every(line => said.includes(squash(line))) ? { shape: 'lines', lines: kept.join('\n') } : null
}

/** The strings that name a fact's rows, to find where in its output it sits: a row's first cell, not a bare number. */
const cellsOf = (fact: HumanQueueFact): string[] =>
  fact.shape === 'table' ? fact.rows.map(row => row[0]!) : fact.shape === 'bars' ? fact.rows.map(row => row.label)
    : fact.shape === 'terms' ? fact.terms.map(one => one.term) : fact.lines.split('\n')

/** The lines of the output a pressed chip shows: from the first that holds a drawn cell, `EXCERPT_LINES` of them. */
export function excerpt(fact: HumanQueueFact, output: string): string {
  const lines = output.replace(/\s+$/, '').split('\n')
  const cells = cellsOf(fact).map(squash).filter(Boolean)
  // From the first line that holds a whole drawn row, as locate() finds it in a file, so a bare `0.4` elsewhere never
  // starts it (#110's fifth design review); a fact with no rows starts at its first cell.
  const rows: string[][] = fact.shape === 'table' ? fact.rows : fact.shape === 'bars' ? fact.rows.map(row => [row.label, ...row.values.map(String)]) : []
  const whole = lines.findIndex(line => rows.some(row => lineHoldsRow(line, row)))
  const first = whole !== -1 ? whole : Math.max(0, lines.findIndex(line => cells.some(cell => squash(line).includes(cell))))
  return lines.slice(first, first + EXCERPT_LINES).join('\n')
}

/**
 * A line's number where the output prints one, and its text: `90:` from grep, `751-` for grep's context lines,
 * `page.ts:90:` from grep over files, `  90\t` from Read. Null for a line that prints none.
 */
export function numberedLine(line: string): { file?: string; number: string; text: string } | null {
  const hit = /^\s*(?:([^\s:]+?)[:-])?(\d+)[:\t-]\s?(.*)$/.exec(line)
  if (hit === null) return null
  return { ...(hit[1] === undefined ? {} : { file: hit[1].split('/').pop()! }), number: hit[2]!, text: hit[3]! }
}

/**
 * Whether a run of lines numbers its lines: every one parses, and one at least prints a match's `:` or Read's tab,
 * since grep prints a `-` context line only beside a match; so a date like `2026-10-27` is never line 10 of a file.
 */
export function isNumbered(text: string): boolean {
  const lines = text.split('\n').filter(line => line.trim() !== '')
  return lines.length > 0 && lines.every(line => numberedLine(line) !== null) && lines.some(line => /^\s*(?:[^\s:]+?[:-])?\d+[:\t]/.test(line))
}

/** The files a call names: its path argument, else the words of its command that look like files, as written. */
export function filesOf(call: Call): string[] {
  const path = [call.input.file_path, call.input.path].find(isText)
  if (path !== undefined) return [path]
  const words = isText(call.input.command) ? call.input.command.split(/[\s|;&<>()]+/) : []
  return [...new Set(words.filter(word => /^[\w./~-]+\.\w{1,5}$/.test(word)))]
}

/**
 * How the chip names a call, as a source chip names a file (#108): the file and the first line the fact sits on,
 * `page.ts:90`, where the output numbers its lines; the file a Read opened; else the program that printed it. Never
 * a file the drawn cells did not come from, nor the call's description (#110's design reviews).
 */
export function callName(call: Call, shown = '', piece = ''): string | undefined {
  const numbered = isNumbered(shown) ? numberedLine(shown.split('\n').find(line => line.trim() !== '') ?? '') : null
  const path = [call.input.file_path, call.input.path].find(isText)
  // Numbered output with no file before its numbers came from the one file its command names, as `grep -n x a.ts` prints.
  const named = filesOf(call)
  const file = numbered?.file ?? path?.split('/').pop() ?? (numbered !== null && named.length === 1 ? named[0]!.split('/').pop() : undefined)
  if (file !== undefined) return numbered === null ? file : `${file}:${numbered.number}`
  if (!isText(call.input.command)) return call.tool.replace(/^mcp__[^_]+__/, '')
  // A compound command is named by the one part that holds the fork's piece of it, its program and the file it reads;
  // a part the piece does not single out names nothing, as a source that fails loses its chip (#110's fifth review).
  const parts = call.input.command.split(/;|&&|\|\|/).map(part => part.trim()).filter(Boolean)
  const held = parts.length === 1 ? parts : parts.filter(part => piece !== '' && squash(part).includes(squash(piece)))
  if (held.length !== 1) return undefined
  const program = held[0]!.split(/\s+/)[0]!.split('/').pop()!
  const read = filesOf({ ...call, input: { command: held[0] } })[0]?.split('/').pop()
  return read === undefined || parts.length === 1 ? program : `${program} ${read}`
}

/**
 * The 1-based first line of a file that holds a drawn row whole, the earliest over every row, or null: where a chip
 * may say the fact came from, so its line and its excerpt cover every row it draws (#110's fourth design review).
 */
export function locate(fact: HumanQueueFact, text: string): number | null {
  const lines = text.split('\n')
  const rows: string[][] = fact.shape === 'table' ? fact.rows : fact.shape === 'bars' ? fact.rows.map(row => [row.label, ...row.values.map(String)])
    : fact.shape === 'terms' ? fact.terms.map(one => [one.term]) : []
  const at = fact.shape === 'lines'
    ? lines.findIndex(line => squash(line).includes(squash(fact.lines.split('\n')[0]!)))
    : lines.findIndex(line => rows.some(row => lineHoldsRow(line, row)))
  return at === -1 ? null : at + 1
}

/**
 * The arguments with their facts checked: each fact against the newest call whose input holds the fork's piece of
 * it and whose output holds the fact, then against any call's output. A fact no call holds is dropped and its
 * claim stays, as a source that fails loses its chip and keeps its sentence (#108). A call whose output numbers no
 * lines is traced to the file it read, through `read`, when a file it names holds the fact's first row on a line.
 */
export async function checkArguments(drafts: readonly ArgumentDraft[], calls: readonly Call[], read: (path: string) => Promise<string | null> = async () => null): Promise<HumanQueueArgument[]> {
  const newest = [...calls].reverse().filter(call => call.text.trim() !== '')
  return Promise.all(drafts.map(async draft => {
    if (draft.fact === null) return { claim: draft.claim }
    const piece = squash(draft.call)
    const named = piece === '' ? [] : newest.filter(call => squash(JSON.stringify(call.input)).includes(piece))
    for (const call of [...named, ...newest.filter(call => !named.includes(call))]) {
      const fact = checkFact(draft.fact, call.text)
      if (fact === null) continue
      const lines = excerpt(fact, call.text)
      // The chip opens the output only where it shows more than the fact draws: an excerpt that is the fact says it twice.
      const adds = (shown: string) => fact.shape !== 'lines' || squash(shown) !== squash(fact.lines)
      if (!isNumbered(lines) && call.tool !== 'Read') {
        for (const path of filesOf(call)) {
          const text = await read(path).catch(() => null)
          const at = text === null ? null : locate(fact, text)
          if (text === null || at === null) continue
          const shown = text.split('\n').slice(at - 1, at - 1 + EXCERPT_LINES).join('\n')
          return { claim: draft.claim, from: `${path.split('/').pop()}:${at}`, ...(adds(shown) ? { output: shown } : {}), fact }
        }
      }
      const from = callName(call, lines, draft.call)
      return from === undefined ? { claim: draft.claim, fact } : { claim: draft.claim, from, ...(adds(lines) ? { output: lines } : {}), fact }
    }
    return { claim: draft.claim }
  }))
}
