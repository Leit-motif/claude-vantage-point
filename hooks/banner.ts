// The session banner's reads (issue 119): which repository an edited file lives in, that
// repository's ADRs and the bindings its history makes, each read once and kept. Never takes
// `$`: register.tsx hands it local git and file reads (`bannerIO($)`). No GitHub call.
import { adrKey, bind, governing, LOG_ARGS, parseAdr, parseLog, relativeTo } from '../panes/banner/decisions.ts'
import type { Adr, Bindings } from '../panes/banner/decisions.ts'
import type { Governing } from '../panes/banner/picture.ts'

export type BannerIO = {
  /** `git -C dir ...args`'s output, or null when it failed. */
  git: (dir: string, args: readonly string[]) => Promise<string | null>
  /** The file names in a directory, or null when there is none. */
  list: (dir: string) => Promise<string[] | null>
  read: (path: string) => Promise<string>
  now: () => Promise<number>
  /** The folders inside the repository at `root` its conventions keep ADRs in (issue 146). */
  adrDirs: (root: string) => Promise<readonly string[]>
}

/** How long a repository's ADRs and bindings stand before they are read again. */
export const REFRESH_MS = 10 * 60_000

type Repo = { at: number; adrs: Map<number, Adr>; bindings: Bindings }

// Module variables: a reload reads them again, and the session's edits live in its state.
const roots = new Map<string, Promise<string | null>>()
const repos = new Map<string, Promise<Repo>>()

function rootOf(io: BannerIO, dir: string): Promise<string | null> {
  const held = roots.get(dir)
  if (held !== undefined) return held
  const found = io.git(dir, ['rev-parse', '--show-toplevel']).then(out => {
    const root = out?.trim() ?? ''
    return root.startsWith('/') ? root : null
  }, () => null)
  roots.set(dir, found)
  return found
}

async function readRepo(io: BannerIO, root: string, now: number): Promise<Repo> {
  const adrs = new Map<number, Adr>()
  const dirs = await io.adrDirs(root)
  for (const dir of dirs) {
    const names = await io.list(`${root}/${dir}`).catch(() => null)
    for (const name of names ?? []) {
      if (adrKey(name) === null) continue
      const adr = parseAdr(name, await io.read(`${root}/${dir}/${name}`).catch(() => ''))
      if (adr !== null) adrs.set(adr.n, adr)
    }
  }
  const log = adrs.size === 0 ? null : await io.git(root, LOG_ARGS).catch(() => null)
  return { at: now, adrs, bindings: bind(parseLog(log ?? ''), [...adrs.values()], dirs) }
}

async function repoAt(io: BannerIO, root: string): Promise<Repo> {
  const now = await io.now()
  const held = repos.get(root)
  if (held !== undefined) {
    const repo = await held
    if (now - repo.at < REFRESH_MS) return repo
  }
  const reading = readRepo(io, root, now)
  repos.set(root, reading)
  // A failed read is not kept, so the next edit tries again.
  reading.catch(() => repos.delete(root))
  return reading
}

/** The ADR the file at absolute `path` answers to, or null outside a repository or where nothing binds it. */
export async function governingOf(io: BannerIO, path: string): Promise<Governing | null> {
  const root = await rootOf(io, path.slice(0, path.lastIndexOf('/')) || '/')
  if (root === null) return null
  const relative = relativeTo(root, path)
  if (relative === null) return null
  const repo = await repoAt(io, root)
  const n = governing(repo.bindings, relative)
  const adr = n === null ? undefined : repo.adrs.get(n)
  return adr === undefined ? null : { n: adr.n, key: adr.key, slug: adr.slug, title: adr.title, accepted: adr.accepted }
}
