// What a Decision pane argument rests on, checked against the session (issue 173, spec 171's "Sources are checked"):
// a file and lines the session opened, a run's output, or the owner's words, so the agent cannot cite a source that
// does not hold. Prior art: `hooks/evidence.ts`, deleted in 1d964f3. All pure; every IO is passed in.
import type { SessionMessage, ToolUseSummary } from 'claude-code'

export type RestKind = 'read' | 'run' | 'ruling' | 'estimate' | 'assumption'

/** What an argument rests on, as the agent wrote it. */
export type Rests = { kind: RestKind; ref?: string; excerpt?: string }

/** A source that holds, with where it was found; or why it does not, in words the agent can act on. */
export type SourceCheck =
  | { ok: true; kind: 'read'; path: string; lines: { from: number; to: number } }
  | { ok: true; kind: 'run'; tool: string }
  | { ok: true; kind: 'ruling' }
  | { ok: true; kind: 'estimate' | 'assumption' }
  | { ok: false; reason: string }

export type ReadFile = (path: string) => Promise<string | null>

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/** A path as compared: no `./` in front, no doubled or trailing slashes. */
const normal = (path: string) => path.trim().replace(/\/{2,}/g, '/').replace(/^(\.\/)+/, '').replace(/\/$/, '')

/** Whether two paths name one file: equal, or one ends with the other at a folder boundary. */
function samePath(a: string, b: string): boolean {
  const [x, y] = [normal(a), normal(b)]
  if (x === '' || y === '') return false
  const [long, short] = x.length >= y.length ? [x, y] : [y, x]
  return long === short || long.endsWith(`/${short}`)
}

/** The words of a command or an output that could be paths. */
const words = (text: string) => text.split(/[\s:'"`|;&<>()=,]+/).filter(Boolean)

const text = (v: unknown) => (typeof v === 'string' ? v : '')

/** Every tool use of the session, and every result's text paired with the use it answers, when the session holds it. */
function callsOf(messages: readonly SessionMessage[]) {
  const uses = messages.flatMap(message => message.toolUses)
  const byId = new Map(uses.map(use => [use.tool_use_id, use]))
  const results = new Map<string, { text: string; use: ToolUseSummary | undefined }>()
  for (const use of uses) if (use.text !== undefined) results.set(use.tool_use_id, { text: use.text, use })
  for (const message of messages) {
    for (const result of message.toolResults ?? []) results.set(result.tool_use_id, { text: result.text, use: byId.get(result.tool_use_id) })
  }
  // A refused `decide` call's reply is the tool's words, not a source.
  return { uses, results: [...results.values()].filter(one => !one.use?.tool.endsWith('__decide')) }
}

/** The path a tool use opened that names `path`, as the use wrote it, or null. */
function opened(use: ToolUseSummary, path: string, output: string | undefined): string | null {
  const named = (candidates: string[]) => candidates.find(one => samePath(one, path)) ?? null
  if (FILE_TOOLS.has(use.tool)) return named([text(use.input.file_path), text(use.input.notebook_path)])
  if (use.tool === 'Grep' || use.tool === 'Glob') return named([text(use.input.path), ...words(output ?? '')])
  if (use.tool === 'Bash') return named(words(text(use.input.command)))
  return null
}

/**
 * The path, as the session wrote it, of the first tool call that wrote, read or named `path` (a Read, an Edit, a
 * Write, a Grep or Glob that listed it, a Bash command naming it), or null when none did.
 */
export function openedIn(messages: readonly SessionMessage[], path: string): string | null {
  const { uses, results } = callsOf(messages)
  const outputs = new Map(results.flatMap(one => (one.use === undefined ? [] : [[one.use.tool_use_id, one.text] as const])))
  return uses.map(use => opened(use, path, outputs.get(use.tool_use_id))).find(one => one !== null) ?? null
}

/** `path:N` or `path:N-M`, or null. */
function lineRef(ref: string): { path: string; from: number; to: number } | null {
  const hit = /^(.+?):(\d+)(?:-(\d+))?$/.exec(ref.trim())
  if (hit === null) return null
  const from = Number(hit[2])
  const to = hit[3] === undefined ? from : Number(hit[3])
  return from >= 1 && to >= from ? { path: hit[1]!, from, to } : null
}

async function checkRead(ref: string | undefined, excerpt: string, messages: readonly SessionMessage[], read: ReadFile): Promise<SourceCheck> {
  const at = lineRef(ref ?? '')
  if (at === null) return { ok: false, reason: 'a read source needs ref as a file and its lines, "path:12" or "path:12-18"' }
  const path = openedIn(messages, at.path)
  if (path === null) return { ok: false, reason: `no tool call in this session opened ${at.path}: Read it (or Grep or Edit it) before citing it` }
  // Read the fuller of the two spellings, so a relative ref reaches the absolute file the session opened.
  const file = normal(path).length >= normal(at.path).length ? path : at.path
  const body = await read(file).catch(() => null)
  if (body === null) return { ok: false, reason: `${at.path} cannot be read now` }
  const lines = body.split('\n')
  if (at.to > lines.length) return { ok: false, reason: `${at.path} has ${lines.length} lines, so lines ${at.from}-${at.to} are out of range` }
  if (!squash(lines.slice(at.from - 1, at.to).join('\n')).includes(excerpt)) {
    return { ok: false, reason: `the excerpt is not in lines ${at.from}-${at.to} of ${at.path} as it reads now: quote those lines, or cite the lines that hold it` }
  }
  return { ok: true, kind: 'read', path: file, lines: { from: at.from, to: at.to } }
}

function checkRun(ref: string | undefined, excerpt: string, messages: readonly SessionMessage[]): SourceCheck {
  const holding = callsOf(messages).results.filter(one => squash(one.text).includes(excerpt))
  if (holding.length === 0) return { ok: false, reason: 'the excerpt is in no tool result of this session: quote the output as it printed' }
  const wanted = ref === undefined ? '' : squash(ref).toLowerCase()
  const named = wanted === '' ? holding.find(one => one.use !== undefined) ?? holding[0]! : holding.find(one => one.use !== undefined &&
    (squash(text(one.use.input.command)).toLowerCase().includes(wanted) || one.use.tool.toLowerCase().includes(wanted)))
  if (named === undefined) {
    return { ok: false, reason: `the excerpt is in a tool result, but not one from a call whose command or tool names "${ref}": name the command that printed it` }
  }
  return { ok: true, kind: 'run', tool: named.use?.tool ?? 'unknown' }
}

function checkRuling(excerpt: string, messages: readonly SessionMessage[]): SourceCheck {
  const said = messages.some(message => message.role === 'user' && squash(message.text).includes(excerpt))
  const ruled = callsOf(messages).results.some(one => one.text.includes('## Rulings') && squash(one.text).includes(excerpt))
  return said || ruled ? { ok: true, kind: 'ruling' }
    : { ok: false, reason: 'the owner said nothing like the excerpt in this session, nor in a "## Rulings" comment it read: quote the owner\'s own words' }
}

/** Whether an argument's source holds against this session's messages and the files as `read` returns them now. */
export async function checkSource(rests: Rests, messages: readonly SessionMessage[], read: ReadFile): Promise<SourceCheck> {
  if (rests.kind === 'estimate' || rests.kind === 'assumption') return { ok: true, kind: rests.kind }
  const excerpt = squash(rests.excerpt ?? '')
  if (excerpt === '') return { ok: false, reason: `a ${rests.kind} source needs an excerpt: the words it rests on, quoted` }
  switch (rests.kind) {
    case 'read': return checkRead(rests.ref, excerpt, messages, read)
    case 'run': return checkRun(rests.ref, excerpt, messages)
    case 'ruling': return checkRuling(excerpt, messages)
  }
}
