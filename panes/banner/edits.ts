// What this session changed (issue 119): each file its agents edited, with the lines
// their edits added and removed. Pure: register.tsx reads the calls and hands them here.

/** One file this session edited: its absolute path, the lines its edits added and removed, summed, and when it was last edited. */
export type Edited = { path: string; added: number; removed: number; lastAt: number }

export type Delta = { added: number; removed: number }

/** The tools whose calls change a file's lines. */
export const EDIT_TOOLS = ['Edit', 'MultiEdit', 'Write'] as const
export type EditTool = (typeof EDIT_TOOLS)[number]

const linesOf = (text: string) => (text === '' ? [] : text.replace(/\n$/, '').split('\n'))

/**
 * The lines `after` adds to and removes from `before`: what is left of each once the lines
 * they share at the start and at the end are set aside. One changed line is one of each.
 */
export function lineDelta(before: string, after: string): Delta {
  const a = linesOf(before)
  const b = linesOf(after)
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1
  return { added: b.length - head - tail, removed: a.length - head - tail }
}

const times = (d: Delta, n: number): Delta => ({ added: d.added * n, removed: d.removed * n })
const plus = (a: Delta, b: Delta): Delta => ({ added: a.added + b.added, removed: a.removed + b.removed })
const isText = (value: unknown): value is string => typeof value === 'string'

function occurrences(text: string, part: string): number {
  if (part === '') return 1
  return Math.max(1, text.split(part).length - 1)
}

/**
 * A call's change, from its input. `before` is the file as it stood before the call, where it
 * is known: Write diffs against it (absent is empty), and an Edit that replaces every
 * occurrence counts each. Null when the input is not an edit's.
 */
export function editDelta(tool: EditTool, input: Record<string, unknown>, before: string | null): Delta | null {
  if (tool === 'Write') return isText(input.content) ? lineDelta(before ?? '', input.content) : null
  if (tool === 'Edit') {
    if (!isText(input.old_string) || !isText(input.new_string)) return null
    const once = lineDelta(input.old_string, input.new_string)
    return input.replace_all === true && before !== null ? times(once, occurrences(before, input.old_string)) : once
  }
  if (!Array.isArray(input.edits)) return null
  let sum: Delta = { added: 0, removed: 0 }
  for (const edit of input.edits as unknown[]) {
    const { old_string: old, new_string: next } = (edit ?? {}) as Record<string, unknown>
    if (!isText(old) || !isText(next)) return null
    sum = plus(sum, lineDelta(old, next))
  }
  return sum
}

/** The session's edits with one more: a file already edited keeps its place and adds the counts. */
export function recordEdit(edits: readonly Edited[], path: string, delta: Delta, at: number): Edited[] {
  const held = edits.find(one => one.path === path)
  if (held === undefined) return [...edits, { path, ...delta, lastAt: at }]
  return edits.map(one => (one === held ? { path, ...plus(one, delta), lastAt: at } : one))
}

/** The `n` files edited most recently, the latest first. */
export function recent(edits: readonly Edited[], n: number): Edited[] {
  return edits
    .map((one, i) => [one, i] as const)
    .sort(([a, i], [b, j]) => b.lastAt - a.lastAt || j - i)
    .slice(0, n)
    .map(([one]) => one)
}
