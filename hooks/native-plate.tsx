// The queue's overview page (the plate) drawn from the desktop's own elements
// (issue #47), beside the SVG picture in screen.ts, which stays behind
// `/vantage-point picture`. It speaks the band's row grammar (issue 69): a
// headline count, the band's own total (issue 71), then the Next row, the one
// ask to act on first, lifted with the pane's only amber dot, then one group
// per repo, each a dim heading and its asks as a grey number, a title and a
// trailing age, with no cards and no pills. The Next row and every ask are each
// one click target (../panes/human-queue/plate-card.tsx) that lifts under the
// pointer, as a Caches row does, and opens that ask: the groups sort the asks,
// they never stand between the person and one of them. A group's "N more"
// opens the first ask it stands for. Never takes `$`: register.tsx hands it the
// element table, the Clients and the presses.
import type { BoxProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'
import type { PlateAsk, PlateCardProps } from '../panes/human-queue/plate-card'
import { CARD_LINE, FILL, QUIET, SIGNAL_YELLOW } from './signal'

export type PlateRepo = {
  name: string
  /** Its open asks, in order: the first is the one it opens. */
  asks: PlateAsk[]
}

export type NativePlate = {
  repos: PlateRepo[]
  /** Tickets an agent has not yet turned into decisions. */
  held: number
  /** The band's waiting total, the you pill's count, or null while it is unknown: the headline's number (issue 71). */
  waiting?: number | null
  /** The lines of text the plate has room for (the pane's `scroll.bodyRows`), and the pane's columns: the groups are fitted to them so nothing scrolls. */
  rows: number
  columns: number
}

export type PlateElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
}

/** Characters of the pane's text one cell holds, measured off the desktop (2026-10-17). */
const CHARS_PER_CELL = 1.4
/**
 * Rows the headline and the gap under it take: a `title` line is about 1.5 of
 * the pane's 19pt lines, and a gap of 1 about 11pt. It leans tall, so the pane
 * never scrolls.
 */
const HEADER_ROWS = 2.2
/** Rows a group's heading and the gap after it take, before its asks. */
const GROUP_ROWS = 2.2
/** Rows the Next row's facts line, its lift's padding and the gap after it take, besides its title. */
const NEXT_ROWS = 2.2

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

/** Rows a text takes wrapped in this many cells. It leans tall, so what the pane cannot hold is cut, never scrolled. */
export function lineRows(text: string, cells: number): number {
  return Math.max(1, Math.ceil(text.length / Math.floor(Math.max(8, cells) * CHARS_PER_CELL * 0.9)))
}

/** Rows one ask's title takes, wrapped beside its dot, number and age, so a group the pane cannot hold is cut to "N more". */
export function titleRows(title: string, columns: number, idWidth: number, ageWidth = 0): number {
  // The lift's inset and the scrollbar take four cells; the dot, number and age columns and their gaps the rest.
  return lineRows(title, columns - 4 - 2 - idWidth - 1 - (ageWidth === 0 ? 0 : ageWidth + 1))
}

/**
 * An age's colour, raised one salience step at a time (issue 69): under a week
 * it needs no eye, from a week it is white, and from two weeks it takes the
 * amber of what waits on the person.
 */
export function ageTone(age: string): string {
  const days = /^(\d+)d$/.exec(age)
  if (days !== null) return Number(days[1]) >= 7 ? 'text' : QUIET
  return /^\d+(w|mo)$/.test(age) ? SIGNAL_YELLOW : QUIET
}

/**
 * How many of each repo's asks the pane has room for, dealt a round at a time
 * (every repo's first, then every second), so no repo's list crowds out
 * another's next ask. A group cut short takes a row for its "N more"; a group
 * holding none still draws its heading, whose count says how many wait.
 */
export function fit(plate: NativePlate, idWidth: number, ageWidth = 0, reserved = 0): number[] {
  const rowsOf = (asks: PlateAsk[]) => asks.reduce((n, ask) => n + titleRows(ask.title, plate.columns, idWidth, ageWidth), 0)
  const fixed = HEADER_ROWS + reserved + plate.repos.length * GROUP_ROWS
  const shown = plate.repos.map(() => 0)
  const cut = (i: number) => ((plate.repos[i]?.asks.length ?? 0) > (shown[i] ?? 0) ? 1 : 0)
  const used = () => fixed + plate.repos.reduce((n, repo, i) => ((shown[i] ?? 0) === 0 ? n : n + rowsOf(repo.asks.slice(0, shown[i])) + cut(i)), 0)
  const open = plate.repos.map((repo, i) => repo.asks.length > (shown[i] ?? 0))
  while (open.some(Boolean)) {
    for (const [i, repo] of plate.repos.entries()) {
      if (open[i] !== true) continue
      const n = shown[i] ?? 0
      shown[i] = n + 1
      if (used() > plate.rows) {
        shown[i] = n
        open[i] = false
      } else if (n + 1 >= repo.asks.length) open[i] = false
    }
  }
  return shown
}

/** Where the Next row's ask sits: its repo and its place in that repo's asks. */
export type NextAt = { repo: number; ask: number }

/**
 * The ask to act on next (issue 71): the oldest ask the person can answer,
 * across every repo, by the day it was opened. A tie keeps the order the asks
 * came in. An ask with no date is never the oldest, so with none dated there is
 * no Next row: nothing is said that was not observed.
 */
export function pickNext<T>(repos: { asks: T[] }[], openedOf: (ask: T) => string | null | undefined): NextAt | null {
  let best: { at: NextAt; day: string } | null = null
  for (const [r, repo] of repos.entries()) {
    for (const [a, ask] of repo.asks.entries()) {
      const day = /^\d{4}-\d{2}-\d{2}/.exec(openedOf(ask) ?? '')?.[0]
      if (day !== undefined && (best === null || day < best.day)) best = { at: { repo: r, ask: a }, day }
    }
  }
  return best?.at ?? null
}

/** A repo's group on the plate: `repo-<n>`, n the repo's place among every repo, so a group the Next row empties shifts no other's key. */
export type PlateGroup = {
  key: string
  /** The repo's name, the group's heading. */
  name: string
  /** Every open ask the group holds, shown or not. */
  count: number
  /** The asks the pane has room for, in order: the first is the repo's next. */
  asks: PlateAsk[]
  /** Each shown ask's age colour (issue 69). */
  tones: string[]
  /** Asks there was no room for. */
  more: number
  /** The first ask there was no room for, the one its "N more" opens. */
  firstHidden: PlateAsk | null
  idWidth: number
  ageWidth: number
}

/** One ask's row and the key its Client answers to: `ask:<qid>`, or `more:<qid>` for a "N more" that opens that ask. */
export type PlateRow = { key: string; props: PlateCardProps }

/** A group's rows: each shown ask, its first white and the rest a step back, then its "N more". */
export function groupRows(group: PlateGroup): PlateRow[] {
  const common = { idWidth: group.idWidth, ageWidth: group.ageWidth, dot: null, quiet: QUIET }
  const rows: PlateRow[] = group.asks.map((ask, i) => ({
    key: `ask:${ask.qid}`,
    props: { ...common, ask, tone: group.tones[i] ?? QUIET, title: i === 0 ? 'white' : 'dim' },
  }))
  // "N more" only under a shown ask: a group that holds none says how many wait in its heading.
  if (group.firstHidden === null || group.asks.length === 0) return rows
  return [
    ...rows,
    { key: `more:${group.firstHidden.qid}`, props: { ...common, ask: { qid: group.firstHidden.qid, id: '', title: `${group.more} more`, age: '' }, tone: QUIET, title: 'quiet' } },
  ]
}

/** The plate laid out: the Next row, if any ask is dated, and each repo's group without it, fitted to the pane. */
export function plateLayout(plate: NativePlate): { next: PlateCardProps | null; groups: PlateGroup[] } {
  const at = pickNext(plate.repos, ask => ask.opened)
  const nextAsk = at === null ? undefined : plate.repos[at.repo]?.asks[at.ask]
  // The Next ask leaves its group, so each fact shows once; a group it empties goes.
  const rest = plate.repos
    .map((repo, i) => ({ i, repo: { ...repo, asks: repo.asks.filter((_, a) => !(at?.repo === i && at.ask === a)) } }))
    .filter(({ repo }) => repo.asks.length > 0)
  const all = plate.repos.flatMap(repo => repo.asks)
  // One column for the numbers, as wide as the widest, so every title starts on one edge.
  const idWidth = Math.max(1, ...all.map(ask => ask.id.length))
  // And one for the ages, at least as wide as the widest, so every age ends on one edge.
  const ageWidth = Math.max(0, ...all.map(ask => ask.age.length))
  const reserved = nextAsk === undefined ? 0 : NEXT_ROWS + titleRows(nextAsk.title, plate.columns, idWidth, ageWidth)
  const shown = fit({ ...plate, repos: rest.map(({ repo }) => repo) }, idWidth, ageWidth, reserved)
  const groups = rest.map(({ i, repo }, g) => {
    const asks = repo.asks.slice(0, shown[g])
    return {
      key: `repo-${i + 1}`,
      name: repo.name,
      count: repo.asks.length,
      asks,
      tones: asks.map(ask => ageTone(ask.age)),
      more: repo.asks.length - asks.length,
      firstHidden: repo.asks[asks.length] ?? null,
      idWidth,
      ageWidth,
    }
  })
  const next =
    at === null || nextAsk === undefined
      ? null
      : {
          ask: nextAsk,
          tone: ageTone(nextAsk.age),
          title: 'white' as const,
          idWidth,
          ageWidth,
          // The pane's one amber dot: a group's next ask keeps its white title alone.
          dot: SIGNAL_YELLOW,
          quiet: QUIET,
          facts: `${plate.repos[at.repo]?.name ?? ''} · next, the oldest`,
        }
  return { next, groups }
}

/** Each repo's group, its asks fitted to the pane. */
export function plateGroups(plate: NativePlate): PlateGroup[] {
  return plateLayout(plate).groups
}

/** The asks the plate draws: those an agent has distilled into decisions. */
const readyOf = (plate: NativePlate) => plate.repos.reduce((n, repo) => n + repo.asks.length, 0)

/** The headline's number: the band's waiting total, so the two agree; while the band's is unknown, the ready and held asks the plate knows of (issue 71). */
export function plateTotal(plate: NativePlate): number {
  return plate.waiting ?? readyOf(plate) + plate.held
}

/** The headline's qualifiers: how many of the waiting asks are ready and where, and how many are held back. */
export function plateQualifiers(plate: NativePlate): string {
  return ['waiting', `${readyOf(plate)} ready in ${plural(plate.repos.length, 'repo')}`, plate.held === 0 ? '' : `${plate.held} held`].filter(Boolean).join(' · ')
}

export function nativePlate(
  el: PlateElements,
  plate: NativePlate,
  /** The Client for the Next row (key `next`) or one of a group's rows (`ask:<qid>`, `more:<qid>`). */
  client: (key: string, props: PlateCardProps) => RenderElement,
  /** Lines that say what happened to an answer, under the headline. */
  notices: RenderElement | null,
  /** Whether the engine takes Text's `size` and `weight` (2.1.299); an older one refuses the whole pane over one. */
  newProps: boolean,
): RenderElement {
  const { Box, Text } = el
  const total = plateTotal(plate)
  const { next, groups } = plateLayout(plate)

  return (
    // It may shrink to the pane, so the groups' clip holds if the fit misjudges: nothing scrolls.
    <Box key="plate" flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden" gap={1}>
      {/* The headline: the total, raised by size alone, with what qualifies it stepping back beside it. */}
      <Box key="count" flexDirection="row" alignItems="flex-end" columnGap={1} paddingX={1} flexShrink={0}>
        {newProps ? (
          <Text size="title" tabular>
            {String(total)}
          </Text>
        ) : (
          <Text bold>{String(total)}</Text>
        )}
        <Text color={QUIET}>{plateQualifiers(plate)}</Text>
      </Box>

      {notices === null ? null : (
        <Box key="notices" paddingX={1} flexShrink={0}>
          {notices}
        </Box>
      )}

      {next === null ? null : (
        // The one ask to act on first, lifted at rest by the composer's fill and raised a step more
        // under the pointer, as a Caches row lifts: the whole row opens it.
        <Box key="next" width="100%" paddingX={1} paddingY={0.25} flexShrink={0} backgroundColor={FILL} hover={{ backgroundColor: CARD_LINE }}>
          {client('next', next)}
        </Box>
      )}

      <Box key="repos" flexDirection="column" gap={1} flexShrink={1} minHeight={0} overflow="hidden">
        {groups.map(group => (
          <Box key={group.key} width="100%" flexDirection="column" flexShrink={0}>
            {/* The heading sorts the asks under it and opens nothing: its name, and how many wait. */}
            <Box key="heading" flexDirection="row" columnGap={1} paddingX={1}>
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text color={QUIET} wrap="truncate-end">
                  {group.name}
                </Text>
              </Box>
              <Text color={QUIET}>{String(group.count)}</Text>
            </Box>
            {groupRows(group).map(row => (
              // A fill with no border lifts the row under the pointer, flush with its text, as a
              // Caches row lifts; the cell of inset a side lets the lift clear the text.
              <Box key={`lift-${row.key}`} width="100%" paddingX={1} flexShrink={0} hover={{ backgroundColor: CARD_LINE }}>
                {client(row.key, row.props)}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  )
}
