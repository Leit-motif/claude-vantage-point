// The tickets an agent's reply mentions, and what the band shows of each: finding `#n` and
// `owner/repo#n` in reply text (code, fences, URLs and step or colour numbers are not tickets),
// and turning `gh issue view`'s answer into one detail line and an outline of up to five points.
// Pure: nothing here reads the network. The gh call is issues.ts's; drawing is register.tsx's.
// Ported from the ticket-lens mod, which this replaces in the band.

import type { HumanQueueTicketCard } from '../../types'

/** A ticket as the band draws it: its title, one detail line, and an outline drawn from its body. */
export type TicketCard = HumanQueueTicketCard

/** One ticket a reply names. `repo` is null for a bare `#n`, which the caller resolves to the session's repository. */
export type Mention = { repo: string | null; number: number }

const TITLE_MAX = 90
const POINT_MAX = 110
const POINTS_MAX = 5
const LABELS_SHOWN = 3

// Code, links and URLs are not mentions: `#12` in a code span, a fence, or `…/pull/12#issuecomment`
// stays as written. Fences are cut before inline spans so a backtick inside a fence cannot pair
// with one outside it.
const FENCES = /(```|~~~)[\s\S]*?(?:\1|$)/g
const INLINE_CODE = /`[^`\n]*`/g
const URLS = /\b(?:https?|file):\/\/\S+/g

// A GitHub issue or pull request link names its ticket exactly: `[#12](https://github.com/o/r/issues/12)`
// and a bare `https://github.com/o/r/issues/12` both become `o/r#12` before other URLs are cut.
const GITHUB_LINK = /\[[^\]\n]*\]\(\s*https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(?:issues|pull)\/(\d+)[^)]*\)/g
const GITHUB_URL = /https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(?:issues|pull)\/(\d+)\b\S*/g

// Numbered things that are not tickets: `step #2`, `finding #3`, `option #1`, a colour `#333`.
const NOT_A_TICKET = /\b(?:steps?|options?|findings?|items?|points?|rounds?|phases?|choices?|questions?|attempts?|no\.|number)\s*$/i
const COLOUR_WORD = /\bcolou?rs?\b[^#.,;\n]{0,12}$/i

// `#12`, or `owner/repo#12`. The lookbehind keeps `abc#12`, `&#12;` and `path/#12` out; the
// lookahead keeps `#12ab` (a hex colour) and `#12-x` out. GitHub owners are at most 39 characters.
const REFERENCE =
  /(?<![\w&#/\\.-])(?:([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}))?#(\d{1,7})(?![\w-])/g

/** The tickets a block of reply text mentions, first mention first, each once. */
export function mentionsOf(text: string): Mention[] {
  const prose = text
    .replace(FENCES, ' ')
    .replace(INLINE_CODE, ' ')
    .replace(GITHUB_LINK, ' $1#$2 ')
    .replace(GITHUB_URL, ' $1#$2 ')
    .replace(URLS, ' ')
  const seen = new Set<string>()
  const found: Mention[] = []
  for (const match of prose.matchAll(REFERENCE)) {
    const number = Number(match[2])
    if (number === 0) continue
    const repo = match[1] ?? null
    const before = prose.slice(Math.max(0, match.index - 40), match.index)
    if (repo === null && NOT_A_TICKET.test(before)) continue
    if (repo === null && /^(?:\d{3}|\d{6})$/.test(match[2]!) && COLOUR_WORD.test(before)) continue
    const id = `${repo?.toLowerCase() ?? ''}#${number}`
    if (seen.has(id)) continue
    seen.add(id)
    found.push({ repo, number })
  }
  return found
}

// An issue's title, labels and body are anyone's text. Before any of it reaches the screen keep
// only what a person can see: drop terminal escape sequences, then every control, format,
// unassigned, private-use and surrogate character and the letters that render blank; fold
// whitespace; cap the length by code point. Text carrying Unicode tag characters is dropped whole.
const ESCAPE_SEQUENCES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g
const TAG_CHARACTERS = /[\u{E0000}-\u{E007F}]/u
const UNSEEN_CHARACTERS = /[\p{Cc}\p{Cf}\p{Cn}\p{Co}\p{Cs}\p{Variation_Selector}ᅟᅠㅤﾠ]/gu
const COMBINING_RUN = /(\p{M}{3})\p{M}+/gu

/** Visible text only, folded to one line and capped at `max` code points (the cap is an ellipsis). */
export function clean(text: unknown, max: number): string {
  if (typeof text !== 'string' || TAG_CHARACTERS.test(text)) return ''
  const safe = text
    .replace(ESCAPE_SEQUENCES, '')
    .replace(/\s+/g, ' ')
    .replace(UNSEEN_CHARACTERS, '')
    .replace(COMBINING_RUN, '$1')
    .replace(/ {2,}/g, ' ')
    .trim()
  const points = [...safe]
  return points.length > max ? `${points.slice(0, max - 1).join('')}…` : safe
}

// The body as an outline of up to five points, drawn from its own structure: the first line of
// prose, then each section heading with its first item (`Proof — node --test passes`), then more
// top-level bullets and paragraphs in body order. Each point is one sentence, markdown marks
// stripped. Comments, rules, tables, fences, nested bullets, and the `Part of` / `Blocked by`
// lines this repository's tickets open with are not points.
const SKIPPED_LINE = /^(?:---|\*\*\*|___|\||part of\b|blocked by\b)/i
const FENCE_LINE = /^(?:```|~~~)/
const HEADING = /^#{1,6}\s+(.*)$/
const BOLD_LEAD = /^\*\*([^*]+?)[.:]?\*\*[.:]?\s+/
const SENTENCE_END = /(?<=[.!?])\s+(?=[A-Z`(\[*"])/

// Markdown marks off, code spans kept whole: `XDG_STATE_HOME` and `scripts/*.test.mjs` keep their
// underscores and stars. The spans sit behind NUL-delimited placeholders while emphasis goes.
function plain(text: string): string {
  const spans: string[] = []
  return text
    .replace(/`([^`]*)`/g, (_, code: string) => `\0${spans.push(code) - 1}\0`)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_\s][^*_]*?)[*_](?![\w*])/g, '$1$2')
    .replace(/\0(\d+)\0/g, (_, at: string) => spans[Number(at)]!)
}

function firstSentence(line: string): string {
  let text = line.replace(/^(?:[-*+]|\d+[.)]|>)\s+/, '')
  let lead = ''
  const bold = text.match(BOLD_LEAD)
  if (bold) {
    lead = `${plain(bold[1]!).trim()} — `
    text = text.slice(bold[0].length)
  }
  return clean(lead + plain(text.split(SENTENCE_END)[0]!), POINT_MAX)
}

type Item = { heading: string; sentence: string; opens: boolean }

function outlineOf(body: string): string[] {
  const items: Item[] = []
  let heading = ''
  let fenced = false
  for (const raw of body.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)) {
    const line = raw.trim()
    if (FENCE_LINE.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced || line === '' || /^\s{2,}/.test(raw) || SKIPPED_LINE.test(line)) continue
    const head = line.match(HEADING)
    if (head) {
      heading = clean(plain(head[1]!), 40)
      continue
    }
    const sentence = firstSentence(line)
    if (sentence === '') continue
    const opens = heading !== '' && !items.some(item => item.heading === heading)
    items.push({ heading, sentence, opens })
  }
  if (items.length === 0) return []
  // The first item stands alone: it is the gist, and its heading ("Problem", "What") adds nothing.
  const chosen = new Set([0])
  items.forEach((item, at) => {
    if (item.opens && chosen.size < POINTS_MAX) chosen.add(at)
  })
  items.forEach((_, at) => {
    if (chosen.size < POINTS_MAX) chosen.add(at)
  })
  return [...chosen]
    .sort((a, b) => a - b)
    .map(at => {
      const { heading: lead, sentence, opens } = items[at]!
      return at > 0 && opens ? clean(`${lead} — ${sentence}`, POINT_MAX) : sentence
    })
}

const PARENT = /^\s*part of\s+((?:[\w.-]+\/[\w.-]+)?#\d+)/im

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null

/**
 * The card for one ticket from `gh issue view --json title,state,labels,body`, or null when the
 * output is not an issue. An unreadable body gives an empty outline, not a refusal.
 */
export function cardOf(stdout: string): TicketCard | null {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return null
  }
  const issue = object(raw)
  if (issue === null) return null
  const title = clean(issue.title, TITLE_MAX)
  if (title === '') return null
  const body = typeof issue.body === 'string' ? issue.body : ''
  const state = issue.state === 'CLOSED' ? 'closed' : issue.state === 'OPEN' ? 'open' : clean(String(issue.state ?? ''), 12).toLowerCase()
  const parent = body.match(PARENT)?.[1]
  const labels = (Array.isArray(issue.labels) ? issue.labels : [])
    .map(label => clean(object(label)?.name, 40))
    .filter(name => name !== '')
    .slice(0, LABELS_SHOWN)
  const detail = [state, parent ? `part of ${parent}` : '', ...labels].filter(part => part !== '').join(' · ')
  return { title, detail, points: outlineOf(body) }
}
