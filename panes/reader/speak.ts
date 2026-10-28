// Speak: the linearizer's faithful runs as words a person reads in one look
// (#49). The linearizer keeps every word of the reply; this pass is where the
// Reader gives some up so that what plays is prose. Pure, so node runs it.
//
// - A commit hash goes. Brackets go; their words stay, unless nothing is left.
// - A file path reads as its file name, without `:line` numbers; an
//   `owner/repo#N` reference as `repo#N`.
// - A word is never divided: an identifier such as vantage-point@my-app
//   is one string and plays as one beat (the owner's ruling, 2026-10-17).
// - Layout is drawn, never spoken: no bullet, heading, table or quote cue
//   plays. Each run carries its place instead (the section, a heading's own
//   words, the item, quote or table row), which the picture draws above the
//   word (#112), so a list still reads as a list.
// - A code block or tool output stays whole, without its cues: forms.ts
//   shows it as one frame.
import type { Place, Run } from './stream.ts'

export function speak(runs: readonly Run[]): Run[] {
  const out: Run[] = []
  const counts = itemCounts(runs)
  let section: string | undefined
  let isHeading = false
  let quotes = 0
  /** The open list items, outermost first, each as its mark. */
  let items: string[] = []
  let table: { row: number; rows: number } | null = null
  runs.forEach((run, i) => {
    if (run.kind === 'cue') {
      const item = ITEM.exec(run.text)
      if (run.text === 'Heading' || run.text === 'Subheading') {
        isHeading = true
        items = []
      } else if (run.text === 'Quote') quotes += 1
      else if (run.text === 'End quote') quotes = Math.max(0, quotes - 1)
      else if (run.text === 'End list') items = []
      // A nested list's end hands what follows back to the item it sits in.
      else if (run.text === 'End sublist') items = items.slice(0, -1)
      else if (run.text === 'Table') table = { row: 0, rows: tableRows(runs, i) }
      else if (run.text === 'End table') table = null
      else if (item) {
        const depth = item[2]!.split('.').length
        const count = counts.get(i)!
        // One grammar at every depth: where the item falls and of how many, a bullet's mark telling it from a numbered one (the design review, #112).
        const at = count.total === 1 ? count.path.join('.') : `${count.path.join('.')} of ${count.total}`
        const task = item[3] === undefined ? '' : ` · ${item[3].trim()}`
        items = [...items.slice(0, depth - 1), `${item[1] === 'Bullet' ? '• ' : ''}${at}${task}`]
      }
      return
    }
    if (table !== null && run.kind === 'prose') table.row += 1
    const row = table === null ? '' : table.rows === 1 ? 'row 1' : `row ${table.row} of ${table.rows}`
    const marks = [quotes > 0 ? 'quote' : '', items.at(-1) ?? '', row].filter(mark => mark !== '')
    const heading = isHeading && run.kind === 'prose'
    const place: Place = {
      ...(section === undefined || heading ? {} : { section }),
      ...(heading ? { heading: true as const } : {}),
      ...(marks.length === 0 ? {} : { mark: marks.join(' · ') }),
    }
    const placed = (text: string): Run => ({ kind: run.kind, text, ...(Object.keys(place).length === 0 ? {} : { place }) })
    if (run.kind === 'code') {
      out.push(placed(run.text))
      return
    }
    const text = prose(run.text)
    if (heading) {
      isHeading = false
      if (text !== '') section = text
    }
    if (text !== '') out.push(placed(text))
  })
  return out
}

const ITEM = /^(Item|Bullet) ([\d.]+)( done| to do)?$/

/**
 * Each list item's cue index, mapped to its position among its siblings at
 * every depth (`[2, 1]` for the first item under the second) and how many
 * siblings its own list holds. Positions, not the source's numbers, so
 * "of N" always counts from 1.
 */
function itemCounts(runs: readonly Run[]): Map<number, { path: number[]; total: number }> {
  const counts = new Map<number, { path: number[]; total: number }>()
  /** The open lists, outermost first: the position of the item last seen there, and every item's cue index. */
  let open: { at: number; items: number[] }[] = []
  const close = (depth: number) => {
    for (const list of open.slice(depth)) for (const i of list.items) counts.get(i)!.total = list.items.length
    open = open.slice(0, depth)
  }
  runs.forEach((run, i) => {
    if (run.kind !== 'cue') return
    const item = ITEM.exec(run.text)
    if (item) {
      const depth = item[2]!.split('.').length
      close(depth)
      while (open.length < depth) open.push({ at: 0, items: [] })
      const list = open[depth - 1]!
      list.at += 1
      list.items.push(i)
      counts.set(i, { path: open.map(one => one.at), total: 0 })
    } else if (run.text === 'End list') close(0)
    else if (run.text === 'End sublist') close(open.length - 1)
  })
  close(0)
  return counts
}

/** How many rows of prose the table whose cue is at `start` reads. */
function tableRows(runs: readonly Run[], start: number): number {
  let rows = 0
  for (let i = start + 1; i < runs.length && !(runs[i]!.kind === 'cue' && runs[i]!.text === 'End table'); i++) if (runs[i]!.kind === 'prose') rows += 1
  return rows
}

const HASH = /^[0-9a-f]{7,40}$/
const isHash = (core: string) => HASH.test(core) && /\d/.test(core) && /[a-f]/.test(core)

/** A run of prose with its brackets opened and each word made readable. */
function prose(text: string): string {
  // Innermost brackets first: a bracket left with no words goes with its contents.
  let s = text
  for (let guard = 0; guard < 8 && /\([^()]*\)/.test(s); guard++) {
    s = s.replace(/\(([^()]*)\)/g, (_, inner: string) => {
      const kept = inner.split(/\s+/).map(readable).filter(w => /[\p{L}\p{N}]/u.test(w)).join(' ')
      return kept === '' ? '\uE002' : kept
    })
  }
  const spoken = s
    .split(/\s+/)
    .map(readable)
    .filter(w => w !== '')
    .join(' ')
  // A dropped bracket hands the punctuation after it to the word before it.
  return spoken.replace(/ ?\uE002/g, '').replace(/ +([,.;:!?])/g, '$1').trim()
}

/** One word as the eye takes it, or '' when nothing of it is worth a beat. */
function readable(word: string): string {
  if (word === '\uE002' || word === '') return word
  const lead = /^["'“‘]*/.exec(word)![0]
  const tail = /[.,;:!?"'”’]*$/.exec(word.slice(lead.length))![0]
  let core = word.slice(lead.length, word.length - tail.length)
  if (core === '') return word
  if (isHash(core)) return '\uE002' + tail
  const ref = /^(?:[\w.-]+\/)?([\w.-]+)(#\d+)$/.exec(core)
  if (ref) core = `${ref[1]}${ref[2]}`
  else if (/\//.test(core) && /(^[~.]{0,2}\/|\.\w{1,6}(:\d+(-\d+)?)?$)/.test(core)) {
    core = (core.replace(/:\d+(-\d+)?$/, '').split('/').filter(Boolean).at(-1) ?? core)
  } else if (/^[\w.-]+\.[a-z]\w{0,5}:\d+(-\d+)?$/i.test(core)) core = core.replace(/:\d+(-\d+)?$/, '')
  return lead + core + tail
}
