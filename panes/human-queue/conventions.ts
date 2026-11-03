// Conventions (issue 146, spec 145 decision 1): how one repository runs its
// work, as one typed value the code reads instead of constants. The label each
// of Matt Pocock's roles goes by, further labels with the Frontier state and
// stage name each stands for, the branch forms that name a ticket and a spec,
// the ADR folders, which links name a parent, the tracker, and what a submit
// does to the waiting label.
//
// Each field comes from the first layer that sets it: the repository's
// `.claude/vantage-point.json`, its `docs/agents/triage-labels.md` (role labels
// only), the person's `~/.claude/vantage-point.json`, then the defaults, which
// are Matt's canonical labels and nothing of anyone's own setup. A repository's
// file may be a stranger's, so every file is parsed here, once, field by field:
// a field that fails falls back to the next layer, and the failure is kept for
// the tour to name. Branch forms are templates compiled here, never regular
// expressions from the file; ADR folders must lie inside the repository.
//
// A repository's labels belong to it while the label search spans every
// repository of the owner, so each session records its checkout's files in the
// plugin's store, keyed by repository, and every session resolves any recorded
// repository from them. Pure: the files and the store are register.tsx's, gh
// is issues.ts's.

/** Matt Pocock's triage roles: waiting on a person, ready for an agent, needs triage, needs info, parked. */
export const ROLES = ['waiting', 'ready', 'triage', 'info', 'parked'] as const
export type Role = (typeof ROLES)[number]

/** Each role's label in Matt's skills: the defaults, and the first cell of a triage-labels.md row. */
export const MATT_ROLES: Readonly<Record<Role, string>> = {
  waiting: 'ready-for-human',
  ready: 'ready-for-agent',
  triage: 'needs-triage',
  info: 'needs-info',
  parked: 'wontfix',
}

/** The Frontier states a label can place an issue in. */
export const LABEL_STATES = ['waiting', 'accepting', 'active', 'ready', 'blocked', 'shaping', 'parked'] as const
export type LabelState = (typeof LABEL_STATES)[number]

/** Where each role places an issue on the Frontier: Matt's meaning of his roles. */
export const ROLE_STATES: Readonly<Record<Role, LabelState>> = { waiting: 'waiting', ready: 'ready', triage: 'shaping', info: 'shaping', parked: 'parked' }

/** A further label: the Frontier state it places an issue in, and the stage the agent card names it by (null for none). */
export type LabelRule = { label: string; state: LabelState; stage: string | null }

export const PARENT_LINKS = ['native', 'part-of'] as const
/** A link that names an issue's parent: GitHub's sub-issue parent, or a `Part of #n` line. */
export type ParentLink = (typeof PARENT_LINKS)[number]

export const TRACKERS = ['github', 'gitlab', 'local'] as const
/** Where the repository's issues live; only `github` reads issues. */
export type Tracker = (typeof TRACKERS)[number]

export const AFTER_RULINGS = ['ready', 'unlabel'] as const
/** What a submit does to the waiting label: swap it for the ready label, or take it off. */
export type AfterRulings = (typeof AFTER_RULINGS)[number]

/** Branch templates: `{n}` is the issue number, `*` any run within one path segment, or anything at all as the form's last character. */
export type Branches = { ticket: readonly string[]; spec: readonly string[] }

export type Conventions = {
  roles: Readonly<Record<Role, string>>
  labels: readonly LabelRule[]
  branches: Branches
  adrDirs: readonly string[]
  parent: readonly ParentLink[]
  tracker: Tracker
  afterRulings: AfterRulings
}

/** One file's fields, each present only where the file set it and it passed. */
export type Layer = {
  roles?: Partial<Record<Role, string>>
  labels?: LabelRule[]
  branches?: Partial<Branches>
  adrDirs?: string[]
  parent?: ParentLink[]
  tracker?: Tracker
  afterRulings?: AfterRulings
}

/** A field a file set that did not pass, and why: what the tour names. */
export type Problem = { field: string; reason: string }

/** The defaults, minus `afterRulings`, which depends on whether the repository has a triage-labels.md. */
export const DEFAULTS: Omit<Conventions, 'afterRulings'> = {
  roles: MATT_ROLES,
  labels: [],
  branches: { ticket: ['*/{n}-*', '*/{n}'], spec: [] },
  adrDirs: ['docs/adr', 'docs/decisions'],
  parent: ['native', 'part-of'],
  tracker: 'github',
}

/** GitHub's longest label name. */
const LABEL_MAX = 50
/** The most of a file read: anything longer is not a conventions file. */
export const FILE_MAX = 64 * 1024

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && (values as readonly string[]).includes(value)

/** A field's check: its value, or why it failed. */
type Checked<T> = { value: T } | { reason: string }
type Check<T> = (value: unknown) => Checked<T>

const fail = (reason: string) => ({ reason })

/**
 * A label's characters: letters, digits, spaces and `. _ - : /`. A label reaches the shared
 * search, the shell commands the ask skill gives agents, and the hand-back an agent reads, so a
 * quote, backtick, `$`, bracket or control character never does (spec 145); one is refused here.
 */
const LABEL = /^[\p{L}\p{N} ._:/-]+$/u

/** A stage name: letters, digits, spaces and `. _ -`, 1 to 30 of them. */
const STAGE = /^[\p{L}\p{N} ._-]{1,30}$/u

/** How many problems a file reports at most, and the unknown key names it repeats: the conventions script prints both to the agent (spec 145). */
const PROBLEMS_MAX = 10
const keyName = (key: string): string | null => (/^[A-Za-z0-9_.-]{1,40}$/.test(key) ? key : null)

const label: Check<string> = value => {
  if (typeof value !== 'string') return fail('a label is a string')
  const name = value.trim()
  if (name === '' || name.length > LABEL_MAX) return fail(`a label has 1 to ${LABEL_MAX} characters`)
  return LABEL.test(name) ? { value: name } : fail('a label holds letters, digits, spaces and . _ - : /')
}

/** A list whose every entry passes `check`, at most `max` long; one bad entry fails the whole field. */
const listOf = <T>(max: number, what: string, check: Check<T>): Check<T[]> => value => {
  if (!Array.isArray(value) || value.length > max) return fail(`${what} is a list of at most ${max}`)
  const out: T[] = []
  for (const one of value) {
    const checked = check(one)
    if ('reason' in checked) return checked
    out.push(checked.value)
  }
  return { value: out }
}

const rule: Check<LabelRule> = value => {
  if (!isRecord(value)) return fail('each label is { label, state, stage? }')
  const name = label(value.label)
  if ('reason' in name) return name
  if (!oneOf(LABEL_STATES, value.state)) return fail(`a label's state is one of ${LABEL_STATES.join(', ')}`)
  const stage = value.stage ?? null
  // The agent card writes a stage name into the system prompt, so it holds no quote, backtick or control character (spec 145).
  if (stage !== null && (typeof stage !== 'string' || !STAGE.test(stage.trim()))) return fail("a label's stage is a name of 1 to 30 letters, digits, spaces and . _ -")
  return { value: { label: name.value, state: value.state, stage: stage === null ? null : stage.trim() } }
}

const template: Check<string> = value => {
  if (typeof value !== 'string' || value.length > 100) return fail('a branch form is a string of at most 100 characters')
  if (!/^[\w.\-/{}*]+$/.test(value)) return fail('a branch form holds letters, digits, . _ - /, * and {n}')
  if (value.split('{n}').length !== 2 || /[{}]/.test(value.replace('{n}', ''))) return fail('a branch form holds {n} once')
  return value.split('*').length > 3 ? fail('a branch form holds * at most twice') : { value }
}

const folder: Check<string> = value => {
  if (typeof value !== 'string' || value.length > 200) return fail('an ADR folder is a string of at most 200 characters')
  const segments = value.replace(/\/+$/, '').split('/')
  if (value.startsWith('~') || value.includes('\\') || segments.some(segment => segment === '' || segment === '.' || segment === '..')) return fail('an ADR folder lies inside the repository')
  return segments.every(segment => /^[\w. -]+$/.test(segment)) ? { value: segments.join('/') } : fail('an ADR folder holds letters, digits, . _ - and spaces')
}

const links: Check<ParentLink[]> = value =>
  Array.isArray(value) && value.every(one => oneOf(PARENT_LINKS, one)) && new Set(value).size === value.length
    ? { value: value as ParentLink[] }
    : fail(`parent is a list of ${PARENT_LINKS.join(', ')}, each once`)

const choice = <T extends string>(field: string, values: readonly T[]): Check<T> => value => (oneOf(values, value) ? { value } : fail(`${field} is one of ${values.join(', ')}`))

const FIELDS = ['version', 'roles', 'labels', 'branches', 'adrDirs', 'parent', 'tracker', 'afterRulings']

/**
 * A `.claude/vantage-point.json`, field by field: what passed, and what did
 * not. Text that is not a JSON object, or names a version other than 1, sets
 * nothing. A key it does not know is named and skipped.
 */
export function parseLayer(text: string): { layer: Layer; problems: Problem[] } {
  if (text.length > FILE_MAX) return { layer: {}, problems: [{ field: 'file', reason: `longer than ${FILE_MAX} characters` }] }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { layer: {}, problems: [{ field: 'file', reason: 'not JSON' }] }
  }
  if (!isRecord(raw)) return { layer: {}, problems: [{ field: 'file', reason: 'not a JSON object' }] }
  if (raw.version !== undefined && raw.version !== 1) return { layer: {}, problems: [{ field: 'version', reason: 'only version 1 is read' }] }
  const problems: Problem[] = Object.keys(raw).filter(key => !FIELDS.includes(key)).map(key => ({ field: keyName(key) ?? 'an unknown key', reason: 'not a field of version 1' }))
  const take = <T>(field: string, value: unknown, check: Check<T>): T | undefined => {
    if (value === undefined) return undefined
    const checked = check(value)
    if ('value' in checked) return checked.value
    problems.push({ field, reason: checked.reason })
    return undefined
  }
  /** An object field whose keys are each their own field. */
  const keyed = <K extends string, T>(field: string, value: unknown, keys: readonly K[], check: Check<T>): Partial<Record<K, T>> | undefined => {
    if (value === undefined) return undefined
    if (!isRecord(value)) return void problems.push({ field, reason: `${field} has ${keys.join(', ')}` })
    const out: Partial<Record<K, T>> = {}
    for (const [key, one] of Object.entries(value)) {
      if (!oneOf(keys, key)) problems.push({ field: keyName(key) === null ? field : `${field}.${key}`, reason: `${field} has ${keys.join(', ')}` })
      else {
        const passed = take(`${field}.${key}`, one, check)
        if (passed !== undefined) out[key] = passed
      }
    }
    return Object.keys(out).length === 0 ? undefined : out
  }
  const layer: Layer = {
    roles: keyed('roles', raw.roles, ROLES, label),
    labels: take('labels', raw.labels, listOf(100, 'labels', rule)),
    branches: keyed('branches', raw.branches, ['ticket', 'spec'] as const, listOf(10, 'branch forms', template)),
    adrDirs: take('adrDirs', raw.adrDirs, listOf(10, 'adrDirs', folder)),
    parent: take('parent', raw.parent, links),
    tracker: take('tracker', raw.tracker, choice('tracker', TRACKERS)),
    afterRulings: take('afterRulings', raw.afterRulings, choice('afterRulings', AFTER_RULINGS)),
  }
  return { layer: Object.fromEntries(Object.entries(layer).filter(([, value]) => value !== undefined)) as Layer, problems: problems.slice(0, PROBLEMS_MAX) }
}

/**
 * A repository's docs/agents/triage-labels.md as a layer of role labels: a
 * row's first cell names Matt's label for a role, its second the repository's.
 * A later row wins over an earlier one; a role with no row is left unset.
 */
export function triageLayer(text: string): Layer {
  const roles: Partial<Record<Role, string>> = {}
  for (const line of text.slice(0, FILE_MAX).split('\n')) {
    const [, matt = '', ours = ''] = /^\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/.exec(line) ?? []
    const role = ROLES.find(one => MATT_ROLES[one] === matt)
    const checked = label(ours)
    if (role !== undefined && 'value' in checked) roles[role] = checked.value
  }
  return Object.keys(roles).length === 0 ? {} : { roles }
}

/** The files a repository's conventions are read from; null for a file that is not there. */
export type Sources = { repoFile: string | null; triageFile: string | null; personFile: string | null }

/** A repository's conventions, and each problem with the files they came from. */
export type Resolved = { conventions: Conventions; problems: (Problem & { file: 'repo' | 'person' })[] }

/** Resolves each field from the first layer that sets it: the repository's file, its triage-labels.md, the person's file, the defaults. */
export function conventionsOf(sources: Sources): Resolved {
  const repo = sources.repoFile === null ? { layer: {}, problems: [] } : parseLayer(sources.repoFile)
  const person = sources.personFile === null ? { layer: {}, problems: [] } : parseLayer(sources.personFile)
  const layers: Layer[] = [repo.layer, sources.triageFile === null ? {} : triageLayer(sources.triageFile), person.layer]
  const first = <T>(pick: (layer: Layer) => T | undefined, fallback: T): T => {
    for (const layer of layers) {
      const value = pick(layer)
      if (value !== undefined) return value
    }
    return fallback
  }
  const conventions: Conventions = {
    roles: Object.fromEntries(ROLES.map(role => [role, first(layer => layer.roles?.[role], DEFAULTS.roles[role])])) as Record<Role, string>,
    labels: first(layer => layer.labels, DEFAULTS.labels),
    branches: { ticket: first(layer => layer.branches?.ticket, DEFAULTS.branches.ticket), spec: first(layer => layer.branches?.spec, DEFAULTS.branches.spec) },
    adrDirs: first(layer => layer.adrDirs, DEFAULTS.adrDirs),
    parent: first(layer => layer.parent, DEFAULTS.parent),
    tracker: first(layer => layer.tracker, DEFAULTS.tracker),
    afterRulings: first(layer => layer.afterRulings, sources.triageFile === null ? 'unlabel' : 'ready'),
  }
  return {
    conventions,
    problems: [...repo.problems.map(one => ({ ...one, file: 'repo' as const })), ...person.problems.map(one => ({ ...one, file: 'person' as const }))],
  }
}

/** What any repository goes by with no files of its own: the person's file, then the defaults. */
export const personConventions = (personFile: string | null): Conventions => conventionsOf({ repoFile: null, triageFile: null, personFile }).conventions

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A branch template as an anchored pattern; only `{n}` and `*` are special, and the template
 * already passed its check. A `*` stays within one path segment, so the default ticket form
 * reads `ticket/12-part/34-rest` as 12 and refuses `feature/ticket/12-name`, as the old pattern
 * did; a trailing `*` takes the rest of the name.
 */
function compile(form: string): RegExp {
  const trailing = form.endsWith('*')
  const body = trailing ? form.slice(0, -1) : form
  const parts = body.split('{n}').map(side => side.split('*').map(escape).join('[^/]*'))
  return new RegExp(`^${parts.join('(\\d+)')}${trailing ? '.*' : ''}$`)
}

/** The issue a branch names by `branches`: a spec form first, then a ticket form. Null when none matches. */
export function issueOfBranch(branch: string, branches: Branches): { kind: 'ticket' | 'spec'; number: number } | null {
  const name = branch.trim()
  if (name.length > 255) return null
  for (const kind of ['spec', 'ticket'] as const) {
    for (const form of branches[kind]) {
      const found = compile(form).exec(name)
      if (found !== null) return { kind, number: Number(found[1]) }
    }
  }
  return null
}

/** Whether `labels` carries `name`, ignoring case as GitHub does. */
export const carries = (labels: readonly string[], name: string): boolean => labels.some(one => one.toLowerCase() === name.toLowerCase())

/** The stage an issue's labels name: the one stage name its labels carry, null with none or several. */
export function stageOf(labels: readonly string[], conventions: Conventions): string | null {
  const stages = new Set(conventions.labels.filter(rule => rule.stage !== null && carries(labels, rule.label)).map(rule => rule.stage as string))
  return stages.size === 1 ? [...stages][0]! : null
}

/** Whether an issue is set aside: it carries a parked label that names no stage. */
export const isPaused = (labels: readonly string[], conventions: Conventions): boolean =>
  conventions.labels.some(rule => rule.state === 'parked' && rule.stage === null && carries(labels, rule.label))

/** One repository's record in the plugin's store: its two files as read, and when (epoch ms). */
export type RepoRecord = { repoFile: string | null; triageFile: string | null; readAt: number }

export const CONVENTIONS_PREFIX = 'conventions-'
/** The store key of a repository's record: `owner/name`, lower-cased as GitHub matches it. */
export const conventionsKey = (repo: string): string => `${CONVENTIONS_PREFIX}${repo.toLowerCase()}`

/** How long a record answers for its repository before an action reads its files again. */
export const RECORD_FRESH_FOR = 60 * 60_000
/** How long a record no session refreshed still counts in the shared search: a session open in its checkout refreshes it every hour. */
export const RECORD_KEPT_FOR = 7 * 24 * 60 * 60_000

const fileText = (value: unknown): string | null | undefined => (value === null ? null : typeof value === 'string' ? value.slice(0, FILE_MAX) : undefined)

export function recordOf(repoFile: string | null, triageFile: string | null, readAt: number): RepoRecord {
  return { repoFile: repoFile?.slice(0, FILE_MAX) ?? null, triageFile: triageFile?.slice(0, FILE_MAX) ?? null, readAt }
}

/** A stored record; null when it is missing or does not parse, which reads as nothing recorded. */
export function readRecord(value: unknown): RepoRecord | null {
  if (!isRecord(value)) return null
  const repoFile = fileText(value.repoFile)
  const triageFile = fileText(value.triageFile)
  const readAt = value.readAt
  if (repoFile === undefined || triageFile === undefined || typeof readAt !== 'number' || !Number.isFinite(readAt)) return null
  return { repoFile, triageFile, readAt }
}

export const isFresh = (record: RepoRecord, now: number): boolean => now - record.readAt < RECORD_FRESH_FOR

/** Whether two records hold the same files, whenever they were read. */
export const sameFiles = (a: RepoRecord | null, b: RepoRecord): boolean => a !== null && a.repoFile === b.repoFile && a.triageFile === b.triageFile

/** Every recorded repository's conventions, by `owner/name` lower-cased, the most recently read first, and what any other repository goes by. */
export type Known = { repos: ReadonlyMap<string, Conventions>; fallback: Conventions }

/** Resolves every record read within RECORD_KEPT_FOR of `now` against the person's file, the most recently read first. */
export function knownOf(records: ReadonlyMap<string, RepoRecord>, personFile: string | null, now: number): Known {
  const kept = [...records].filter(([, record]) => now - record.readAt < RECORD_KEPT_FOR).sort(([, a], [, b]) => b.readAt - a.readAt)
  return {
    repos: new Map(kept.map(([repo, record]) => [repo.toLowerCase(), conventionsOf({ repoFile: record.repoFile, triageFile: record.triageFile, personFile }).conventions])),
    fallback: personConventions(personFile),
  }
}

/** The conventions `repo` goes by: its record's, the person's file and the defaults where none is recorded. */
export const conventionsIn = (known: Known, repo: string): Conventions => known.repos.get(repo.toLowerCase()) ?? known.fallback
