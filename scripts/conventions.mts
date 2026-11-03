// The set-conventions skill's two steps that must not be done by eye (issue 155):
// reading what Vantage Point resolves for a repository now, field by field and
// from which layer, and writing the fields the person ruled yes into one
// conventions file, checked by the same parser the plugin reads it with.
//
//   read:  prints { conventions, from, problems, files } as JSON. `from` names the
//          layer each field came from: repo, triage, person or default.
//   write: merges the fields in a JSON file into the repository's or the person's
//          conventions file, keeping every other key, and refuses a field that
//          does not pass or does not read back as written.
//
// Run with Node 22.6+, from anywhere:
//   node --experimental-strip-types scripts/conventions.mts read [--repo <dir>]
//   node --experimental-strip-types scripts/conventions.mts write repo|person --fields <file.json> [--repo <dir>]
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { conventionsOf, parseLayer, ROLES, triageLayer, type Layer } from '../panes/human-queue/conventions.ts'

/** The three files a repository's conventions are read from. */
export function paths(repo: string): { repo: string; triage: string; person: string } {
  return {
    repo: join(repo, '.claude', 'vantage-point.json'),
    triage: join(repo, 'docs', 'agents', 'triage-labels.md'),
    person: join(homedir(), '.claude', 'vantage-point.json'),
  }
}

const readOrNull = (path: string): string | null => (existsSync(path) ? readFileSync(path, 'utf8') : null)

export type Origin = 'repo' | 'triage' | 'person' | 'default'

/** What Vantage Point reads for `repo` now, and the layer each field (each role on its own) came from. */
export function read(repo: string) {
  const files = paths(repo)
  const repoFile = readOrNull(files.repo)
  const triageFile = readOrNull(files.triage)
  const personFile = readOrNull(files.person)
  const { conventions, problems } = conventionsOf({ repoFile, triageFile, personFile })
  const layers: [Origin, Layer][] = [
    ['repo', repoFile === null ? {} : parseLayer(repoFile).layer],
    ['triage', triageFile === null ? {} : triageLayer(triageFile)],
    ['person', personFile === null ? {} : parseLayer(personFile).layer],
  ]
  const origin = (pick: (layer: Layer) => unknown): Origin => layers.find(([, layer]) => pick(layer) !== undefined)?.[0] ?? 'default'
  const from = {
    ...Object.fromEntries(ROLES.map(role => [`roles.${role}`, origin(layer => layer.roles?.[role])])),
    labels: origin(layer => layer.labels),
    'branches.ticket': origin(layer => layer.branches?.ticket),
    'branches.spec': origin(layer => layer.branches?.spec),
    adrDirs: origin(layer => layer.adrDirs),
    parent: origin(layer => layer.parent),
    tracker: origin(layer => layer.tracker),
    afterRulings: origin(layer => layer.afterRulings),
  }
  return {
    conventions,
    from,
    problems,
    files: { repo: repoFile === null ? null : files.repo, triage: triageFile === null ? null : files.triage, person: personFile === null ? null : files.person },
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * `existing` with `fields` written over it: a top-level field is replaced whole,
 * except `roles` and `branches`, whose keys are each a field of their own. Every
 * other key of the file stays as it was. Throws, naming each field, when one does
 * not pass the plugin's parser or does not read back as written.
 */
export function merged(existing: string | null, fields: Record<string, unknown>): string {
  let base: Record<string, unknown> = {}
  if (existing !== null) {
    const raw: unknown = JSON.parse(existing)
    if (!isRecord(raw)) throw new Error('the file there is not a JSON object; fix or move it first')
    base = raw
  }
  const out: Record<string, unknown> = { ...base, version: 1 }
  for (const [field, value] of Object.entries(fields)) {
    out[field] = (field === 'roles' || field === 'branches') && isRecord(value) && isRecord(base[field]) ? { ...base[field], ...value } : value
  }
  const text = `${JSON.stringify(out, null, 2)}\n`
  const { layer, problems } = parseLayer(text)
  const touched = (field: string) => Object.keys(fields).some(one => field === one || field.startsWith(`${one}.`))
  const failed = problems.filter(one => touched(one.field) || one.field === 'file')
  if (failed.length > 0) throw new Error(failed.map(one => `${one.field}: ${one.reason}`).join('; '))
  // An empty `roles` or `branches` passes and sets nothing, which is not what was ruled.
  const astray = Object.keys(fields).filter(field => (layer as Record<string, unknown>)[field] === undefined)
  if (astray.length > 0) throw new Error(`${astray.join(', ')} would set nothing`)
  return text
}

function main(argv: string[]): void {
  const [command, ...rest] = argv
  const flag = (name: string) => {
    const at = rest.indexOf(name)
    return at === -1 ? undefined : rest[at + 1]
  }
  const repo = resolve(flag('--repo') ?? process.cwd())
  if (command === 'read') {
    process.stdout.write(`${JSON.stringify(read(repo), null, 2)}\n`)
    return
  }
  if (command === 'write' && (rest[0] === 'repo' || rest[0] === 'person') && flag('--fields') !== undefined) {
    const target = paths(repo)[rest[0]]
    const fields: unknown = JSON.parse(readFileSync(flag('--fields')!, 'utf8'))
    if (!isRecord(fields) || Object.keys(fields).length === 0) throw new Error('--fields holds a JSON object of at least one field')
    const text = merged(readOrNull(target), fields)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, text)
    process.stdout.write(`wrote ${Object.keys(fields).join(', ')} to ${target}\n`)
    return
  }
  process.stderr.write('usage: conventions.mts read [--repo <dir>] | write repo|person --fields <file.json> [--repo <dir>]\n')
  process.exit(2)
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
