// Which decision each file answers to (issue 119, ADR 0046). An ADR names the issues it was
// ruled on; a commit names its issue, or cites an ADR outright; so each file a commit touched
// binds to those ADRs, once per commit. Pure: register.tsx runs git and reads the files.

import { slashed } from '../host.ts'

/**
 * One ADR: its number, the number and the words its file name writes (`0037`, `two picture card`),
 * its title, whether it is Accepted or superseded (neither: Proposed), and the issues it was ruled on.
 */
export type Adr = { n: number; key: string; slug: string; title: string; accepted: boolean; superseded: boolean; issues: number[] }

/** One commit as `LOG_ARGS` prints it: its message, and the files it touched. */
export type Commit = { message: string; files: string[] }

/** Each repository-relative path, and how many commits bound it to each ADR, by number. */
export type Bindings = Map<string, Map<number, number>>

/** The history a repository's bindings are read from: a record separator before each message, a unit separator after it, then its files. */
export const LOG_ARGS = ['log', '--no-merges', '-n', '3000', '--format=%x1e%B%x1f', '--name-only'] as const

/** An ADR's number as its file name gives it: `0026-obsidian-graph.md`, `ADR-018-floating.md`. */
export function adrKey(fileName: string): string | null {
  return /^(?:ADR[-_ ]?)?(\d+)[-_ .].*\.md$/i.exec(fileName)?.[1] ?? null
}

/** An ADR's name in words as its file name gives it: `0037-two-picture-card.md` is `two picture card`. */
export const adrSlug = (fileName: string) =>
  fileName.replace(/^(?:ADR[-_ ]?)?\d+[-_ .]/i, '').replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim()

const lineValue = (text: string, name: RegExp) => new RegExp(`^[*_\\s]*(?:${name.source})[*_\\s]*:[*_\\s]*(.*)$`, 'im').exec(text)?.[1]?.trim() ?? null

/**
 * An ADR's file read: its `# ` title, its `Status:` line, and the issues on its `Ruled:` (or `Issue:`) line.
 * An ADR with no status is a decision made, as Matt Pocock's skills write one: Status is optional there (#113).
 */
export function parseAdr(fileName: string, text: string): Adr | null {
  const key = adrKey(fileName)
  if (key === null) return null
  const heading = /^#\s+(.+)$/m.exec(text)?.[1]?.trim()
  // Interlace's titles lead with their own number: "ADR-001 — V1 scope".
  const title = (heading ?? fileName).replace(/^(?:ADR|Decision)[-_ ]?\d+\s*[:.\-–—]?\s*/i, '').trim()
  const status = lineValue(text, /status/) ?? ''
  const ruled = lineValue(text, /ruled|issues?/) ?? ''
  const issues = [...new Set([...ruled.matchAll(/#(\d+)/g)].map(m => Number(m[1])))]
  return { n: Number(key), key, slug: adrSlug(fileName), title, accepted: status === '' || /^accepted/i.test(status), superseded: /^superseded/i.test(status), issues }
}

/** The issues a commit message names: `issue 68`, `issues 68 and 70`, `#68`, never another repository's `owner/name#68`. */
export function namedIssues(message: string): number[] {
  const listed = [...message.matchAll(/\bissues?\s+(\d+(?:(?:\s*,\s*|\s+and\s+)\d+)*)/gi)].flatMap(m => (m[1] as string).match(/\d+/g) ?? [])
  const hashed = [...message.matchAll(/(?<![\w/-])#(\d+)\b/g)].map(m => m[1] as string)
  return [...new Set([...listed, ...hashed].map(Number))]
}

/** The ADRs a commit message cites outright: `ADR-018`, `ADR 0033`, `decision 18`. */
export function citedAdrs(message: string): number[] {
  return [...new Set([...message.matchAll(/\b(?:ADR|decision)[-_ ]?(\d{1,4})\b/gi)].map(m => Number(m[1])))]
}

export function parseLog(text: string): Commit[] {
  return text
    .split('\x1e')
    .filter(record => record.includes('\x1f'))
    .map(record => {
      const [message = '', rest = ''] = record.split('\x1f')
      return { message, files: rest.split('\n').map(line => line.trim()).filter(line => line !== '') }
    })
}

/** Every file the history binds, to each ADR in force, counted once a commit. A superseded ADR, and an ADR file itself (under one of `adrDirs`), binds nothing. */
export function bind(commits: readonly Commit[], adrs: readonly Adr[], adrDirs: readonly string[]): Bindings {
  const isAdrFile = (path: string) => adrDirs.some(dir => path.startsWith(`${dir}/`))
  const inForce = adrs.filter(adr => !adr.superseded)
  const byIssue = new Map<number, number[]>()
  for (const adr of inForce) for (const issue of adr.issues) byIssue.set(issue, [...(byIssue.get(issue) ?? []), adr.n])
  const known = new Set(inForce.map(adr => adr.n))
  const bindings: Bindings = new Map()
  for (const commit of commits) {
    const bound = new Set([...namedIssues(commit.message).flatMap(issue => byIssue.get(issue) ?? []), ...citedAdrs(commit.message).filter(n => known.has(n))])
    if (bound.size === 0) continue
    for (const file of commit.files) {
      if (isAdrFile(file)) continue
      const counts = bindings.get(file) ?? new Map<number, number>()
      for (const n of bound) counts.set(n, (counts.get(n) ?? 0) + 1)
      bindings.set(file, counts)
    }
  }
  return bindings
}

/** The ADR a file answers to most strongly: the most commits, the lower number on a tie; null when none binds it. */
export function governing(bindings: Bindings, path: string): number | null {
  let best: [number, number] | null = null
  for (const [n, count] of bindings.get(path) ?? []) if (best === null || count > best[1] || (count === best[1] && n < best[0])) best = [n, count]
  return best?.[0] ?? null
}

/** `abs` relative to `root`, or null when it lies outside it. */
export function relativeTo(root: string, abs: string): string | null {
  // git answers `C:/x` on Windows where a tool names `C:\x\y`, so both compare with `/`s (issue 152).
  const slashedRoot = slashed(root)
  const base = slashedRoot.endsWith('/') ? slashedRoot : `${slashedRoot}/`
  const path = slashed(abs)
  return path.startsWith(base) ? path.slice(base.length) : null
}
