// Moves one request between human-queue.md and the Human Queue artifact's database.
//
//   export: human-queue.md -> one JSON file per document, plus the ArtifactData
//           batch writes (at most 50 each) that create them.
//   import: the documents an ArtifactData read saved with `out_dir` -> the
//           Ruling, Status, Completed and Note lines in human-queue.md.
//
// Run with Node 22.6+:
//   node --experimental-strip-types scripts/artifact-sync.mts export <queue.md> <request> --source <label> --out <dir>
//   node --experimental-strip-types scripts/artifact-sync.mts import <queue.md> <request> --source <label> --from <dir>
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { complete, findItem, findRequest, localDate, parse, setNote, setRuling } from '../panes/human-queue/queue.ts'
import type { Request } from '../panes/human-queue/queue.ts'

export const BATCH_LIMIT = 50

type Write = { op: 'set'; collection: string; doc_id: string; file_path: string }

/** A request's document id: the source and the request number, in the store's path alphabet. */
export function requestDocId(source: string, id: string): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_.~:@+-]+/g, '-').replace(/^-+|-+$/g, '') || 'queue'
  return `${safe(source)}--${safe(id)}`
}

export function itemDocId(index: number): string {
  return `i${String(index).padStart(4, '0')}`
}

export function requestDoc(request: Request, source: string, now: number): Record<string, unknown> {
  return {
    id: request.id,
    title: request.title,
    body: request.body,
    source,
    opened: request.opened,
    status: request.isOpen ? 'open' : 'done',
    completed: request.completed,
    note: request.note,
    itemCount: request.items.length,
    createdAt: now,
  }
}

export function exportRequest(text: string, id: string, source: string, out: string, now = Date.now()) {
  const request = findRequest(parse(text), id)
  if (request === undefined) throw new Error(`No request ${id} in the queue file.`)
  // The artifact rules yes or no; a pair's A, Same and B are ruled in the pane (#125).
  const pair = request.items.find(item => item.kind === 'pair')
  if (pair !== undefined) throw new Error(`Request ${id} holds a pair item (${pair.heading}), which the artifact cannot rule: hand it over through the review tool.`)
  const rid = requestDocId(source, request.id)
  const dir = resolve(out)
  mkdirSync(join(dir, 'items'), { recursive: true })

  const writes: Write[] = []
  const requestFile = join(dir, 'request.json')
  writeFileSync(requestFile, JSON.stringify(requestDoc(request, source, now), null, 2))
  writes.push({ op: 'set', collection: 'requests', doc_id: rid, file_path: requestFile })
  for (const item of request.items) {
    const file = join(dir, 'items', `${itemDocId(item.index)}.json`)
    const doc = { index: item.index, heading: item.heading, body: item.body, verdict: item.verdict, comment: item.comment }
    writeFileSync(file, JSON.stringify(doc, null, 2))
    writes.push({ op: 'set', collection: `requests/${rid}/items`, doc_id: itemDocId(item.index), file_path: file })
  }

  const batches: Write[][] = []
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) batches.push(writes.slice(i, i + BATCH_LIMIT))
  return { rid, batches }
}

/** A saved document's body, whether the file holds the body or wraps it with id and version. */
function body(file: string): Record<string, unknown> {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  const inner = raw.data
  return inner !== null && typeof inner === 'object' && !Array.isArray(inner) ? (inner as Record<string, unknown>) : raw
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const verdict = (v: unknown): 'yes' | 'no' | null => (v === 'yes' || v === 'no' ? v : null)

/**
 * Finds the saved request document and its items under `from`, where an
 * ArtifactData read with out_dir lays `<collection path>/<doc_id>.json`.
 */
export function readSaved(from: string, rid: string) {
  const dir = resolve(from)
  const requestFile = [join(dir, 'requests', `${rid}.json`), join(dir, `${rid}.json`)].find(existsSync)
  const itemsDir = [join(dir, 'requests', rid, 'items'), join(dir, 'items')].find(existsSync)
  const request = requestFile === undefined ? null : body(requestFile)
  const items = itemsDir === undefined
    ? []
    : readdirSync(itemsDir).filter(n => n.endsWith('.json')).sort().map(n => body(join(itemsDir, n)))
  return { request, items }
}

/** Writes the rulings, and the submit when the person submitted, into the queue text. */
export function importRulings(
  queue: string,
  id: string,
  saved: { request: Record<string, unknown> | null; items: Record<string, unknown>[] },
  today = localDate(Date.now()),
): { text: string; changed: number; submitted: boolean } {
  let next = queue
  let changed = 0
  const request = findRequest(parse(next), id)
  if (request === undefined) throw new Error(`No request ${id} in the queue file.`)

  for (const doc of saved.items) {
    const index = typeof doc.index === 'number' ? doc.index : Number.NaN
    const heading = typeof doc.heading === 'string' ? doc.heading : undefined
    const here = findItem(findRequest(parse(next), id)!, index, heading)
    if (here === undefined) throw new Error(`Item ${heading ?? index} of request ${id} is not in the queue file.`)
    const ruling = { verdict: verdict(doc.verdict), comment: text(doc.comment) }
    if (ruling.verdict === here.verdict && ruling.comment === here.comment) continue
    next = setRuling(next, id, here.index, ruling, here.heading)
    changed++
  }

  const note = text(saved.request?.note)
  if (note !== request.note && note !== null) {
    next = setNote(next, id, note)
    changed++
  }
  const submitted = saved.request?.status === 'done'
  if (submitted && findRequest(parse(next), id)!.isOpen) {
    next = complete(next, id, text(saved.request?.completed) ?? today)
    changed++
  }
  return { text: next, changed, submitted }
}

function flag(args: string[], name: string): string {
  const at = args.indexOf(`--${name}`)
  const value = at === -1 ? undefined : args[at + 1]
  if (value === undefined) throw new Error(`Missing --${name}.`)
  return value
}

function main(argv: string[]) {
  const [command, file, id, ...rest] = argv
  if ((command !== 'export' && command !== 'import') || file === undefined || id === undefined) {
    console.error('usage: artifact-sync.mts export|import <human-queue.md> <request> --source <label> (--out|--from) <dir>')
    process.exit(2)
  }
  const source = flag(rest, 'source')
  const queue = readFileSync(file, 'utf8')
  if (command === 'export') {
    const { rid, batches } = exportRequest(queue, id, source, flag(rest, 'out'))
    console.log(JSON.stringify({ rid, batches }, null, 2))
    return
  }
  const rid = requestDocId(source, id)
  const saved = readSaved(flag(rest, 'from'), rid)
  if (saved.request === null && saved.items.length === 0) throw new Error(`Nothing saved for ${rid} under the --from directory.`)
  const result = importRulings(queue, id, saved)
  if (result.text !== queue) writeFileSync(file, result.text)
  console.log(JSON.stringify({ rid, changed: result.changed, submitted: result.submitted }))
}

// Compared as real paths: a URL escapes a space, and node runs a symlinked script from its target.
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error((error as Error).message)
    process.exit(1)
  }
}
