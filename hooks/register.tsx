// vantage-point: the band, and the human queue, a pane over the asks agents leave for a person. They queue them
// in human-queue.md, or file them as issues labelled ready-for-human in the
// owner's repositories; the person rules on them here with WASD and the mouse,
// or with big buttons on the phone. The file keeps its rulings; an issue gets
// them as one comment and loses the label; the asking agent gets them back.
//
// Every request the pane keeps is named by where it lives: `file:<id>` for the
// file, `issue:<owner/name#n>` for an issue. An issue's rulings live in a draft
// saved to $.store per issue, by compare-and-swap on its `rev`. Trust is the
// signed-in gh login alone: only its Asks comments count, and only its comment
// answers. A submit is sent by the session where the person pressed it, once
// its undo window has passed, and by nothing else: what that session leaves
// unsent, or may have sent, waits in the pane for the person to press R.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, RenderElement, RenderInput, RenderSurface, TurnStepChunk, TurnStepResult } from 'claude-code'

import type { HumanQueueCache, HumanQueueFrontier, HumanQueueAgentNext, HumanQueueDeckPage, HumanQueueAgentBranch, HumanQueueAsk, HumanQueueDecision, HumanQueueFact, HumanQueueReady, HumanQueueReading, HumanQueueReplyTicket, HumanQueueTask, HumanQueueTicketPage, HumanQueueTicketState, HumanQueueCapture, HumanQueueIssue, HumanQueueSubmission, HumanQueueUndo, HumanQueueView, HumanQueueComposedView, HumanQueueGrading, HumanQueueStep } from '../types'
import { DESKTOP_CHARS_PER_CELL, shortTitle, titleRoom } from '../panes/band/title'
import { PANEL, picture } from '../panes/reader/picture'
import { SPEED_STEP } from '../panes/reader/reading'
import {
  AGENT_LABEL,
  ASKS_LABEL,
  GhError,
  gh,
  SEARCH_CEILING,
  SHARED_FOR,
  asksOf,
  findAnswer,
  isOwned,
  listComments,
  parseTarget,
  postComment,
  removeLabel,
  sameLogin,
  branchIssue,
  gist,
  parseTicket,
  parseTicketPage,
  readyOf,
  ticketPageArgs,
  repoOfRemote,
  ticketArgs,
  searchLabels,
  signedInLogin,
  viewAsk,
  viewCard,
} from '../panes/human-queue/issues'
import type { Found, LabelSearch, Run, Viewed } from '../panes/human-queue/issues'
import { BUDGETS, noteRefusal, paced, pausedNow, readHold } from '../panes/human-queue/limits'
import type { Budget, PauseIO } from '../panes/human-queue/limits'
import { mentionsOf } from '../panes/human-queue/mentions'
import {
  contextGaps,
  uncomposedItems,
  uncomposedText,
  gapsText,
  FILE,
  QueueError,
  askAge,
  askRevision,
  carryRulings,
  complete,
  counts,
  fieldLineOf,
  findItem,
  findRequest,
  isSameAsk,
  issueAsk,
  issueKey,
  issueRequest,
  localDate,
  parse,
  parseIssueRef,
  parseRuling,
  rulingLineOf,
  rulingsComment,
  setNote,
  setRuling,
  submissionText,
  writeFieldLine,
  writeRulingLine,
} from '../panes/human-queue/queue'
import type { Item, Request } from '../panes/human-queue/queue'
import { agentPill, youPill, freshCount, freshPill, staleCount, readSpecProgress, waitingTotal, NEW_ASK_MS } from './band'
import type { CountObservation } from './band'
import { withoutGist, boxlessWrapUp, callKey, checkLines, citedSentences, sourceName, wasRead, checkTouches, deckPageFacts, decisionFromFork, fileUrl, decisionOfPermission, decisionOfQuestions, modeOf, projectFolder, ROW_MODES, decisionOfWrapUp, optionSends, fitFields, forkPrompt, GATE_MODEL, GATE_SYSTEM, gateText, isMemoryPath, isYes, looksLikeDecision, parseForkJson, PERSON_TOOLS, proposedCard, startedCard, WRAP_UP_TOOL, wrapUpAsk } from './deck'
import type { WrapUpAsk } from './deck'
import { snapshot } from './snapshot'
import { fromLabels, fromScript, GROUPS, inFlightSpec, nextOf, parseRepoIssues } from './frontier'
import { STATE_SECTION, stateLine } from './state'
import { counts as teamCounts, detail, elapsed, freshMeta, isFailed, isLive, mergeListed, modelOf, ordered, rowFacts, ROOM, waitingOn } from './subagents'
import type { Subagent, SubagentMeta } from './subagents'
import { applyCall, cardLines, doneOf, finished, linesOf, renamedPlans, stepsOfCalls, STEPS_TOOL, UPDATE_PLAN_TOOL } from './steps'
import { endReader, isHeld, pacingOf, speedReader, startReader, switchLevel, toggleReader } from './reader'
import { GIST_SECTION, splitGist } from '../panes/reader/gist'
import type { ReaderIO } from './reader'
import { plainQuote } from './reply'
import { bodyProps, nativeCard, setupText } from './native-card'
import { lineRows, nativePlate, pickNext } from './native-plate'
import { palette as drawPalette, PAGES, PALETTE_START, SCOPE, takesNewProps } from './palette'
import { album as drawAlbum, ALBUM_PAGES, ALBUM_START } from './album'
import { grading as drawGrading } from './grading'
import { FIRST_RUN, tour as drawTour, tourText, TOUR_START, TOUR_STOPS, type TourKey, type TourSetup } from './tour'
import { gradeCases, gradesMessage, type GradeCase } from '../panes/visuals/grading'
import { composedCard, deckPictures } from './composed'
import { plan as planOf, type ComposeItem, type Plan } from '../panes/visuals/compose'
import { cardWidth, evidenceBars, evidenceBarsWidth } from '../panes/visuals/draw'
import { eligible } from '../panes/visuals/facts'
import { argumentsOf, checkArguments, isNumbered, numberedLine } from './evidence'
import { access, composer } from '../panes/visuals/jev'
import { composeDecision, composeItem, isShared, needsPlan, planKey, PROSE_OPENS_KEY, readSlot } from '../panes/visuals/plans'
import type { PlanSlot } from '../panes/visuals/plans'
import type { NativeCard } from './native-card'
import { CARD_LINE, FILL, MERGED, QUIET, RECOMMENDED, REST_LINE, SIGNAL_BLUE, SIGNAL_RED, SIGNAL_YELLOW } from './signal'
import { CACHE_TONE, linkDesks, projectsRoot, scanCaches, scanDesktopSessions } from './caches'
import type { CacheIO, SessionFiles } from './caches'
import { cachesAt, facts as factsOf, hitLabel, isChild, isWarm, kindCounts, leftLabel, passes, RESPONSES_AWK, SHOW_ALL, stateOf, tokens, touch, treeOf } from '../panes/caches/caches'
import type { CacheFilter, Seen } from '../panes/caches/caches'
import { sessionLink, sessionOf, transcriptId } from '../panes/caches/sessions'
import { afterTurn, missedCache, PING, pingAt, readWarmth, toggled, UNARMED, warmFact, WARMTH_PREFIX, warmStateOf, warmthKey } from '../panes/caches/warm'
import type { Warmth } from '../panes/caches/warm'
import { CONTEXT_HIGH, contextLabel } from '../panes/caches/context'
import { freshBrief, handbackOf, isHandbackOf } from '../panes/human-queue/handback'
import { screenSvg } from './screen'
import { refusal } from './refusal'
import { FETCH_SCRIPT, fetchArgs, fetchOf, fit, loadedOf, nameOf, pictureSvg, picturesOf, withoutPictures } from '../panes/human-queue/pictures'
import type { Loaded, Picture } from '../panes/human-queue/pictures'
import type { Screen, ScreenRequest } from './screen'

type $ = EngineInterface
type Ask = HumanQueueAsk
type Submission = HumanQueueSubmission

const PANE = 'human-queue'
/** The pane a ticket opens in, beside the chat: the issue drawn as markdown, no browser. */
const TICKET_PANE = 'human-queue-ticket'
/** The pane a declared task opens in: its title and detail. */
const TASK_PANE = 'human-queue-task'
/** The pane a declared decision opens in: the grid under the reply row. */
const DECISION_PANE = 'human-queue-decision'
const FRONTIER_PANE = 'human-queue-frontier'
/** The agent's zoom-out: every issue ready for an agent, by repo. */
const READY_PANE = 'human-queue-ready'
/** The palette specimen (docs/palette.md), behind `/vantage-point palette` and nowhere else. */
const PALETTE_PANE = 'human-queue-palette'
/** The mock album: every way to draw an ask, tried on a real one, behind `/vantage-point album`. */
const ALBUM_PANE = 'vantage-point-album'
/** The visuals-grading round: each ask drawn every way its facts allow, behind `/vantage-point grade` (#98). */
const GRADING_PANE = 'vantage-point-grading'
/** The tour: the setup and every feature, each with a Try, behind `/vantage-point tour` (#113). */
const TOUR_PANE = 'vantage-point-tour'
/** Set once the first-run toast has pointed at the tour, on this machine. */
const TOURED_KEY = 'toured'
/** Every prompt cache on this machine, from the footer's cache label (issue #50). */
const CACHES_PANE = 'human-queue-caches'
/** How often the transcripts are read again for their caches; a scan takes about 0.2 s. */
const CACHE_SCAN_MS = 15_000
/** The cells a Caches row keeps at its leading edge for its marker. */
const MARK_CELLS = 2
/** What each kind of the Caches pane's filter is called in its menu, in the menu's order. */
const FILTER_KINDS: readonly [keyof CacheFilter, string][] = [['cold', 'Cold'], ['children', 'Child sessions'], ['merged', 'Merged'], ['archived', 'Archived']]

/**
 * A Caches row's marker, 12px in a box a title line tall so it sits on the title: Lucide's
 * git-merge in the app's merged purple, or its corner-down-right elbow in grey for a child.
 */
function markIcon(kind: 'merged' | 'child'): { source: string; alt: string } {
  const [paths, colour, alt] = kind === 'merged'
    ? ['<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>', MERGED, 'Merged']
    : ['<polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/>', QUIET, 'Child session']
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="19" viewBox="0 0 14 19"><g transform="translate(1 3.5) scale(0.5)" fill="none" stroke="${colour}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`,
    alt,
  }
}
const TOOL = 'mcp__vantage-point__review'
const TASK_TOOL = 'mcp__vantage-point__task'
/** Opens the palette or the mock album, so an agent can stage either for a shot with no typed command. */
const SHOW_TOOL = 'mcp__vantage-point__show'
/** Cells a pill takes beyond its label (`panes/band/title.ts`). */
const PILL_CELLS = 2
/** A band card's one button: its label, and what a press does. */
type CardAction = { label: string; run: () => Promise<void> }
const POLL_MS = 1500
/** How often the issues are read again; GitHub's search allows 30 a minute. */
const ISSUE_POLL_MS = 60_000
/** How long one read of the issues may take before it stops; the next read starts where it stopped. */
const SCAN_BUDGET_MS = 45_000
/** How long an answered issue stays hidden while GitHub's search catches up. */
const HIDE_MS = 10 * 60_000
const WHEEL_GAP_MS = 150
const REPEAT_GAP_MS = 80
/** How long Q can take a submit back before the rulings go to the agent or the issue. */
const HAND_BACK_MS = 6000
/** Past its window by this much, another session's submit has not been sent by it: it waits for R. */
const GRACE_MS = 15_000
/** How long a POST that failed or went unanswered may still land; until then R only checks. */
const SETTLE_MS = 5 * 60_000
const CAPTURED = new Set(['composer', 'bridge', 'sdk'])
/** Request buttons per page; `0` turns the page. */
const PAGE_SIZE = 9
/** Each issue's draft persists under this prefix and its key. */
const STORE_PREFIX = 'ask:'
/** Where the unreleased round-one build kept every draft in one map; deleted at start. */
const LEGACY_KEY = 'asks'
const FILE_ID = 'file:'
const ISSUE_ID = 'issue:'
/** This load of the module: a submit made here is sent from here, and from nowhere else on its own. */
const SESSION = crypto.randomUUID()

const text = atom({ plugin: 'vantage-point', key: 'text' } as const, '')
const view = atom({ plugin: 'vantage-point', key: 'view' } as const, { request: null, item: 1 } as HumanQueueView)
const capture = atom({ plugin: 'vantage-point', key: 'capture' } as const, null as HumanQueueCapture)
const drafting = atom({ plugin: 'vantage-point', key: 'drafting' } as const, false)
/** The desktop draws the item from its own elements (issue #45); `/vantage-point picture` goes back to the SVG picture, `/vantage-point native` returns. */
const cardMode = atom({ plugin: 'vantage-point', key: 'cardMode' } as const, 'native' as 'picture' | 'native')
const paletteState = atom({ plugin: 'vantage-point', key: 'palette' } as const, PALETTE_START)
const albumState = atom({ plugin: 'vantage-point', key: 'album' } as const, ALBUM_START)
const gradingState = atom({ plugin: 'vantage-point', key: 'grading' } as const, { at: 0, picks: {}, prose: null, sent: false } as HumanQueueGrading)
const tourState = atom({ plugin: 'vantage-point', key: 'tour' } as const, TOUR_START)
const tourSetup = atom({ plugin: 'vantage-point', key: 'tourSetup' } as const, { gh: 'unknown', login: null, queueFile: false } as TourSetup)
const plans = atom({ plugin: 'vantage-point', key: 'plans' } as const, {} as Record<string, Plan>)
const composedView = atom({ plugin: 'vantage-point', key: 'composedView' } as const, { prose: null, scopes: {}, viewing: null } as HumanQueueComposedView)
/** The keyboard is in the native card's comment field: it is the Input; otherwise a saved comment rests as wrapped text. */
const commentTyping = atom({ plugin: 'vantage-point', key: 'commentTyping' } as const, false)
const undoStack = atom({ plugin: 'vantage-point', key: 'undo' } as const, [])
const redoStack = atom({ plugin: 'vantage-point', key: 'redo' } as const, [])
const notify = atom({ plugin: 'vantage-point', key: 'notify' } as const, [])
const fresh = atom({ plugin: 'vantage-point', key: 'fresh' } as const, [])
const asks = atom({ plugin: 'vantage-point', key: 'asks' } as const, {} as Record<string, Ask>)
const github = atom({ plugin: 'vantage-point', key: 'github' } as const, null as string | null)
const agent = atom({ plugin: 'vantage-point', key: 'agent' } as const, null as HumanQueueAgentNext)
const agentBranch = atom({ plugin: 'vantage-point', key: 'agentBranch' } as const, { state: 'unknown', key: null, branch: null } as HumanQueueAgentBranch)
const task = atom({ plugin: 'vantage-point', key: 'task' } as const, null as HumanQueueTask)
const here = atom({ plugin: 'vantage-point', key: 'here' } as const, null as string | null)
const ready = atom({ plugin: 'vantage-point', key: 'ready' } as const, null as HumanQueueReady)
const frontier = atom({ plugin: 'vantage-point', key: 'frontier' } as const, { state: 'unknown' } as HumanQueueFrontier)
const ticketPage = atom({ plugin: 'vantage-point', key: 'ticketPage' } as const, null as HumanQueueTicketPage)
const peek = atom({ plugin: 'vantage-point', key: 'peek' } as const, null as 'human' | 'agent' | null)
/** The Reader holding the band (issue #35); null while the band shows its rows. */
const reading = atom({ plugin: 'vantage-point', key: 'reading' } as const, null as HumanQueueReading)
/** The waiting count last time the queue was opened, or when a new-ask mark expired. */
const seenWaiting = atom({ plugin: 'vantage-point', key: 'seenWaiting' } as const, null as number | null)
/** When the current rise started; null when the pill shows the steady count. */
const unseenSince = atom({ plugin: 'vantage-point', key: 'unseenSince' } as const, null as number | null)
const decision = atom({ plugin: 'vantage-point', key: 'decision' } as const, null as HumanQueueDecision | null)
const decisionCards = atom({ plugin: 'vantage-point', key: 'decisionCards' } as const, { tasks: [] as string[], since: 0 })
/** Which deck page shows, and the source a citation opened. */
const deckPage = atom({ plugin: 'vantage-point', key: 'deckPage' } as const, { page: 0, source: null } as HumanQueueDeckPage)
/** The quote a source chip opened under its sentence, as `field-sentence-source` (#108); null, none. */
const deckQuote = atom({ plugin: 'vantage-point', key: 'deckQuote' } as const, null as string | null)
/** Tickets the last reply names, their cards, and which rows the Tickets page has open. Cleared with the decision. */
const replyTickets = atom({ plugin: 'vantage-point', key: 'replyTickets' } as const, [] as HumanQueueReplyTicket[])
const ticketStates = atom({ plugin: 'vantage-point', key: 'ticketStates' } as const, {} as Record<string, HumanQueueTicketState>)
const ticketOpen = atom({ plugin: 'vantage-point', key: 'ticketOpen' } as const, {} as Record<string, boolean>)
const subagents = atom({ plugin: 'vantage-point', key: 'subagents' } as const, [] as Subagent[])
const subagentMeta = atom({ plugin: 'vantage-point', key: 'subagentMeta' } as const, {} as Record<string, SubagentMeta>)
const subagentNow = atom({ plugin: 'vantage-point', key: 'subagentNow' } as const, 0)
const subagentsOpen = atom({ plugin: 'vantage-point', key: 'subagentsOpen' } as const, false)
const subagentPick = atom({ plugin: 'vantage-point', key: 'subagentPick' } as const, null as string | null)
/** The agent's task list, as its calls left it (issue 104). */
const steps = atom({ plugin: 'vantage-point', key: 'steps' } as const, [] as HumanQueueStep[])
/** Whether the band draws this session's task list in place of the app's own: on unless the session turned it off (issue 104). */
const stepsHere = atom({ plugin: 'vantage-point', key: 'stepsHere' } as const, true)
const caches = atom({ plugin: 'vantage-point', key: 'caches' } as const, { at: 0, caches: [] as HumanQueueCache[] })
const cachesHidden = atom({ plugin: 'vantage-point', key: 'cachesHidden' } as const, SHOW_ALL)
const cachesMenu = atom({ plugin: 'vantage-point', key: 'cachesMenu' } as const, false)
const cachesExpanded = atom({ plugin: 'vantage-point', key: 'cachesExpanded' } as const, null as string | null)
/**
 * Two clicks on one Caches row this close together are a double click, which opens its session. A
 * single click waits this long before it expands the card, so a double click never shows it.
 */
const DOUBLE_CLICK_MS = 360
/** A single click on a Caches row waiting out DOUBLE_CLICK_MS before it expands the card. */
let pendingRowClick: { file: string; timer: { cancel: () => void } } | null = null
/** Every session's Keep warm as the store last read it, by its transcript's id (issue #60). */
const warmths = atom({ plugin: 'vantage-point', key: 'warmths' } as const, {} as Record<string, Warmth>)
const observations = atom({ plugin: 'vantage-point', key: 'observations' } as const, {
  waiting: null, ready: null,
} as { waiting: CountObservation | null; ready: CountObservation | null })

// Module variables start over on a reload; session.start fills them again.
let seen = { mtime: -1, size: -1 }
let lastWheelAt = 0
let windowOffset = 0
let lastAct = { key: '', at: 0, from: '' }
/** The native card's unsaved comments, by draftKey: typing reaches here without a redraw. */
const drafts = new Map<string, string>()
// The pictures asks embed, by link: loaded, failed, or still fetching. In memory only, since a
// picture's base64 is too big for the store; the PNG itself is cached on disk (issue 87).
const pictures = new Map<string, Loaded | 'failed' | 'pending'>()
/** File hand-backs and this session's issue undo windows, by qualified id. */
const pending = new Map<string, { cancel: () => void }>()
/** Issues this session is sending now. */
const sending = new Set<string>()
/** Each issue's update-and-save, one at a time in this session. */
const chains = new Map<string, Promise<unknown>>()
let issuesLookup: Promise<void> | undefined
let labelsLookup: Promise<LabelSearch> | undefined
/** The signed-in gh login, read again at each pane open; null while unknown. */
let login: string | null = null
/** Where the next read of the issues starts, so a slow first stretch cannot starve the rest. */
let scanFrom = 0
/** Whether a read of the issues has finished since this load. */
let hasScanned = false
/** Only the newest read of this session's branch can publish its ticket. */
let agentReadEpoch = 0
/** The state line as taken at this turn's start; undefined until taken. Held so every request in a turn sends the same text. */
let stateTaken: string | null | undefined

async function takeState($: $): Promise<string | null> {
  // A session's first request comes before the band's first read: read once here, so the line is right from the start.
  const held = await read($, agentBranch)
  if (held.state === 'unknown' || (held.state === 'ticket' && held.key === null)) await readAgent($)
  stateTaken = stateLine({ branch: await read($, agentBranch), ticket: await read($, agent) })
  return stateTaken
}

async function clearDecision($: $): Promise<void> {
  await update($, decision, () => null)
  await update($, decisionCards, () => ({ tasks: [], since: 0 }))
  await update($, replyTickets, () => [])
}

async function markCount($: $, name: 'waiting' | 'ready', value: number | null): Promise<void> {
  const at = await $.clock.now()
  await update($, observations, held => ({ ...held, [name]: value === null ? staleCount(held[name]) : freshCount(value, at) }))
}

/**
 * The label search behind the asks and the ready count:
 * reads made while one runs share it, and gh's cache shares it with every
 * other session on the machine.
 */
function labelSearch($: $): Promise<LabelSearch> {
  labelsLookup ??= signedIn($, false).then(owner => searchLabels(runner($), owner)).finally(() => {
    labelsLookup = undefined
  })
  return labelsLookup
}

/** Every GitHub read the band and the pane keep a minute fresh. */
function pollGitHub($: $): void {
  void refreshIssues($)
    .catch(() => undefined)
    .then(() => planOpen($))
    .catch(() => undefined)
  void readAgent($).then(() => readFrontier($)).catch(() => undefined)
  void readReady($).catch(() => undefined)
}

/** Where in each `every` milliseconds a session with this id polls. */
function pollPhase(id: string, every: number): number {
  return [...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % every
}

// --- Where a request lives -------------------------------------------------

/** The pane's id for a request: `file:<id>` or `issue:<owner/name#n>`. */
function qidOf(request: Request): string {
  return request.issue === undefined ? FILE_ID + request.id : ISSUE_ID + request.id
}

/** A qualified id taken apart; an unqualified one (kept from before) is the file's. */
function sourceOf(qid: string): { kind: 'file' | 'issue'; id: string } {
  if (qid.startsWith(ISSUE_ID)) return { kind: 'issue', id: qid.slice(ISSUE_ID.length) }
  return { kind: 'file', id: qid.startsWith(FILE_ID) ? qid.slice(FILE_ID.length) : qid }
}

/** An issue as the pane names it: `agent-config#221`. */
function shortKey(key: string): string {
  return key.split('/').at(-1) ?? key
}

/** `0003 Rate the drafts`, or `agent-config#221 Title` for an issue. */
function label(request: Request): string {
  if (request.issue !== undefined) return `${shortKey(request.id)} ${request.title}`
  return request.id === request.title ? request.title : `${request.id} ${request.title}`
}

/**
 * The bucket a request belongs to: its repository's name for an issue, the
 * project folder's for human-queue.md, so a repo's issues and its file share one.
 */
function bucketOf(request: Request, project: string): string {
  return request.issue === undefined ? project : (request.issue.repo.split('/')[1] ?? request.issue.repo)
}

/** The bucket of a request known only by its qualified id, as after it was submitted. */
function bucketOfQid(qid: string, project: string): string {
  const source = sourceOf(qid)
  if (source.kind === 'file') return project
  return source.id.split('#')[0]?.split('/')[1] ?? project
}

/** The project folder's name: the bucket of human-queue.md's requests. */
async function projectName($: $): Promise<string> {
  const root = await $.session.root()
  return root.split('/').filter(part => part !== '').pop() ?? root
}

/** Open requests grouped by bucket, buckets in the order their first request appears. */
function bucketsOf(open: Request[], project: string): { name: string; requests: Request[] }[] {
  const groups = new Map<string, Request[]>()
  for (const request of open) {
    const name = bucketOf(request, project)
    groups.set(name, [...(groups.get(name) ?? []), request])
  }
  return [...groups].map(([name, requests]) => ({ name, requests }))
}

/** The latest pause this session read or wrote for each budget: what stands when the store cannot be read, or lost a write. */
const pausesSeen = new Map<Budget, unknown>()

/** GitHub's rate-limit pauses, one per budget, in the store every session reads. */
function pauseIO($: $): PauseIO {
  return {
    now: () => $.clock.now(),
    load: async budget => {
      const stored = await $.store.get(`github-pause-${budget}`).then(value => ({ value }), () => null)
      if (stored !== null && readHold(stored.value).until >= readHold(pausesSeen.get(budget)).until) pausesSeen.set(budget, stored.value)
      return pausesSeen.get(budget)
    },
    save: async (budget, hold) => {
      pausesSeen.set(budget, hold)
      await $.store.set(`github-pause-${budget}`, hold).catch(() => undefined)
    },
  }
}

function runner($: $): Run {
  return paced((argv, init) => $.process.run(argv, init), pauseIO($))
}

async function filePath($: $): Promise<string> {
  return `${await $.session.root()}/${FILE}`
}

async function readFile($: $, path: string): Promise<string> {
  if (!(await $.fs.exists(path))) return ''
  return String(await $.fs.read(path))
}

// --- Where an issue's answer stands --------------------------------------------

/**
 * `window`: this session's undo window. `posting`: this session is sending.
 * `elsewhere`: another session's window, or its POST, not yet over. `unsent`,
 * `maybe` (may have posted) and `label` (posted, the label still on) wait for
 * R. `done`: answered.
 */
type Phase = 'window' | 'posting' | 'elsewhere' | 'unsent' | 'maybe' | 'label' | 'done'

function phaseOf(key: string, ask: Ask, now: number): Phase | null {
  const s = ask.submission
  if (s === null) return null
  if (ask.doneAt !== null) return 'done'
  if (sending.has(key)) return 'posting'
  switch (s.state) {
    case 'posted':
      return 'label'
    case 'ambiguous':
      return 'maybe'
    case 'sending':
      return s.session !== SESSION && now - (s.triedAt ?? 0) < GRACE_MS ? 'elsewhere' : 'maybe'
    case 'unsent':
      return 'unsent'
    case 'waiting':
      if (s.session === SESSION) return pending.has(ISSUE_ID + key) ? 'window' : 'unsent'
      return now < s.dueAt + GRACE_MS ? 'elsewhere' : 'unsent'
  }
}

const WAITS_FOR_R = new Set<Phase | null>(['unsent', 'maybe', 'label'])

/** The line a submitted issue shows: where its answer actually stands. */
function phaseLine(key: string, ask: Ask, phase: Phase): string {
  const name = shortKey(key)
  const error = ask.submission?.error
  const last = error ? ` Last try: ${error}.` : ''
  switch (phase) {
    case 'window':
      return `Submitted ${name}: it posts once the undo window has passed. Q takes it back until then.`
    case 'posting':
      return `Posting the rulings on ${name}…`
    case 'elsewhere':
      return `${name} was submitted in another session; it posts from there.`
    case 'unsent':
      return `Unsent ruling: R sends it.${last}`
    case 'maybe':
      return `May have posted: R checks and sends.${last}`
    case 'label':
      return `Posted; ${ASKS_LABEL} is still on: R retries the label.${last}`
    case 'done':
      return ask.submission?.label === 'kept'
        ? `${name}: answered; ${ASKS_LABEL} stays on because the ask changed after the rulings.`
        : `${name}: answered; ${ASKS_LABEL} is off.`
  }
}

/** An issue's request while the person rules on it: not submitted, not answered. */
function isWaiting(ask: Ask): boolean {
  return ask.submission === null && ask.doneAt === null && issueRequest(ask.issue, ask.text)?.isOpen === true
}

const byAge = (a: Ask, b: Ask) => (a.issue.createdAt ?? '').localeCompare(b.issue.createdAt ?? '') || a.issue.key.localeCompare(b.issue.key)

/** Every request the pane offers: answers waiting for R first, then the file's, then the issues', oldest first. */
async function openRequests($: $): Promise<Request[]> {
  const held = await read($, asks)
  const now = await $.clock.now()
  const all = Object.entries(held)
  const forR = all.filter(([key, ask]) => WAITS_FOR_R.has(phaseOf(key, ask, now))).map(([, ask]) => ask)
  const waiting = all.filter(([, ask]) => isWaiting(ask)).map(([, ask]) => ask)
  const asRequests = (list: Ask[]) => list.sort(byAge).flatMap(ask => issueRequest(ask.issue, ask.text) ?? [])
  const fromFile = parse(await read($, text)).requests.filter(r => r.isOpen)
  return [...asRequests(forR), ...[...fromFile, ...asRequests(waiting)].filter(isDistilled)]
}

/** A plain ask's whole text may be at most this long; past it, it is a ticket, not a decision. */
const PLAIN_ASK_CHARS = 200

/**
 * Only distilled decisions reach the owner: an issue needs ### items (its own
 * ## Asks) that each stand alone, and a file's plain ask must be one short line.
 * A ticket labelled ready-for-human without them is counted, never drawn. The
 * review tool refuses a leaning ask, but one written before issue 87 never met it.
 */
function isDistilled(request: Request): boolean {
  if (request.items.length > 0) return contextGaps(request).length === 0
  return request.issue === undefined && request.body.trim().length <= PLAIN_ASK_CHARS
}

/** Asks held back because nobody has distilled them into decisions yet. */
async function undistilledCount($: $): Promise<number> {
  const held = await read($, asks)
  const waiting = Object.values(held).filter(ask => isWaiting(ask)).flatMap(ask => issueRequest(ask.issue, ask.text) ?? [])
  const fromFile = parse(await read($, text)).requests.filter(r => r.isOpen)
  return [...fromFile, ...waiting].filter(r => !isDistilled(r)).length
}

/** The phase of an issue request the pane shows, when it is submitted; null otherwise. */
async function phaseOfRequest($: $, request: Request | undefined): Promise<Phase | null> {
  if (request?.issue === undefined) return null
  const ask = (await read($, asks))[request.id]
  return ask === undefined ? null : phaseOf(request.id, ask, await $.clock.now())
}

/** A request by qualified id, wherever it lives. */
async function requestOf($: $, qid: string): Promise<Request | undefined> {
  const { kind, id } = sourceOf(qid)
  if (kind === 'file') return findRequest(parse(await read($, text)), id)
  const ask = (await read($, asks))[id]
  return ask === undefined ? undefined : issueRequest(ask.issue, ask.text)
}

/**
 * Opens a ticket in a pane of the mod's own, beside the chat: the issue's
 * title, state, labels, body and newest comments, read through gh. No mod can
 * reveal the desktop's browser pane (it stays hidden), so the issue is drawn
 * in-app instead.
 */
async function openTicket($: $, key: string): Promise<void> {
  const [repo, number] = key.split('#')
  try {
    const page = parseTicketPage(await gh(runner($), ticketPageArgs(repo as string, Number(number))), repo as string)
    await update($, ticketPage, () => page)
  } catch (error) {
    if (!(error instanceof GhError)) throw error
    $.ui.toast(`Could not read ${key}: ${error.message}`)
    return
  }
  await $.ui.open({ id: TICKET_PANE, title: `#${number}`, focus: true })
}

/** Opens the agent's zoom-out: every ready-for-agent issue, read fresh through gh. */
/** Reads the ready-for-agent issues into `ready`; a failed read keeps what was held. Resolves whether it read. */
async function readReady($: $): Promise<boolean> {
  try {
    const list = readyOf(await labelSearch($))
    if (JSON.stringify(await read($, ready)) !== JSON.stringify(list)) await update($, ready, () => list)
    await markCount($, 'ready', list.length)
    return true
  } catch (error) {
    if (!(error instanceof GhError)) throw error
    await markCount($, 'ready', null)
    return false
  }
}

// The script walks a spec's whole graph through gh, so it runs at most this often
// unless the person opens the pane; the labels are one read and follow the issue poll.
const SCRIPT_EVERY_MS = 10 * 60_000

/** The frontier script's path from the plugin's settings; '' when unset. */
async function frontierScript($: $): Promise<string> {
  const row = (await $.config.list().catch(() => [])).find(r => r.key === 'vantage-point.frontierScript')
  return typeof row?.value === 'string' ? row.value.trim() : ''
}

/** Whether the mod asks agents for a gist the Reader plays (#112): on unless the setting is off. */
async function readerGist($: $): Promise<boolean> {
  const row = (await $.config.list().catch(() => [])).find(r => r.key === 'vantage-point.readerGist')
  return row?.value !== false
}

/**
 * Reads this project's frontier into `frontier` (issue 16): spec-frontier.mjs for the
 * spec in flight when the script is set and present, else the repo's labels. A failed
 * read says why; it never stands in an empty frontier.
 */
async function readFrontier($: $, force = false): Promise<void> {
  const repo = await read($, here)
  if (repo === null) return
  let issues
  try {
    await signedIn($, false)
    issues = parseRepoIssues(await gh(runner($), ['api', `repos/${repo}/issues?state=open&per_page=100`, '--paginate', '--slurp', '--cache', SHARED_FOR]))
  } catch (error) {
    await update($, frontier, () => ({ state: 'failed' as const, reason: `could not read ${repo}'s issues (${error instanceof Error ? error.message : String(error)})` }))
    return
  }
  const held = await read($, frontier)
  const now = await $.clock.now()
  const spec = inFlightSpec(issues)
  const script = await frontierScript($)
  const hasScript = script !== '' && await $.fs.exists(script).catch(() => false)
  if (spec !== null && hasScript) {
    const fresh = held.state === 'read' && held.repo === repo && held.frontier.source === 'script' && held.frontier.spec === spec
      && held.scriptAt !== null && now - held.scriptAt < SCRIPT_EVERY_MS
    if (fresh && !force) return
    // The script calls gh itself, past the runner's pacing. While GitHub has paused, what is held stays,
    // or the labels' frontier stands in: a pause that lifts by itself is not a failure.
    const isPaused = (await pausedNow(pauseIO($), BUDGETS)) !== null
    if (isPaused && held.state === 'read') return
    if (!isPaused) {
      let ran
      try {
        ran = await $.process.run(['node', script, String(spec), '--repo', repo, '--json'], { timeoutMs: 120_000 })
      } catch (error) {
        await update($, frontier, () => ({ state: 'failed' as const, reason: `spec-frontier.mjs could not run (${String(error)})` }))
        return
      }
      if (ran.exitCode !== 0) await noteRefusal((argv, init) => $.process.run(argv, init), pauseIO($), ['core', 'graphql'], ran.stderr)
      // 0 admitted and 1 not admitted both print the frontier; anything else printed none.
      try {
        if (ran.exitCode !== 0 && ran.exitCode !== 1) throw new Error(ran.stderr.trim().split('\n')[0] || `exit ${ran.exitCode}`)
        const found = fromScript(ran.stdout, spec)
        await update($, frontier, () => ({ state: 'read' as const, repo, frontier: found, scriptAt: now }))
      } catch (error) {
        await update($, frontier, () => ({ state: 'failed' as const, reason: `spec-frontier.mjs for #${spec}: ${error instanceof Error ? error.message : String(error)}` }))
      }
      return
    }
  }
  const labels = fromLabels(issues)
  if (held.state === 'read' && JSON.stringify(held.frontier) === JSON.stringify(labels) && held.repo === repo) return
  await update($, frontier, () => ({ state: 'read' as const, repo, frontier: labels, scriptAt: null }))
}

async function openFrontier($: $): Promise<void> {
  await readFrontier($, true).catch(() => undefined)
  await $.ui.open({ id: FRONTIER_PANE, title: 'Frontier', focus: true })
}

function cacheIO($: $): CacheIO {
  return {
    home: async () => (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')),
    list: path => $.fs.list(path),
    read: path => $.fs.read(path),
    // The path rides as $1, never inside the script.
    responses: async path => (await $.process.run(['/bin/sh', '-c', 'awk "$1" "$2" | tail -n 120', 'sh', RESPONSES_AWK, path])).stdout,
  }
}

// One scan at a time: a tick that lands while one runs is skipped, and the next tick reads afresh.
let cacheScanning = false
/** The desktop's session files as the last scan read them (issue #62). */
let desktopSessions: SessionFiles = new Map()

async function scanCachesNow($: $): Promise<void> {
  if (cacheScanning) return
  cacheScanning = true
  try {
    const io = cacheIO($)
    const root = await projectsRoot(io)
    if (root === null) return
    const now = await $.clock.now()
    const own = `${await $.session.id()}.jsonl`
    const found = await scanCaches(io, root, now, own, (await read($, caches)).caches)
    // Which desktop session each cache's row opens; with no home, none does.
    const home = await io.home()
    desktopSessions = home === undefined || home === '' ? new Map() : await scanDesktopSessions(io, home, desktopSessions)
    const linked = linkDesks(found, desktopSessions)
    await update($, caches, () => ({ at: now, caches: linked }))
    await retitleCaches($, linked, now).catch(() => undefined)
    await loadWarmths($)
    await scheduleWarm($)
  } finally {
    cacheScanning = false
  }
}

// Keep warm (issue #60). Each session's mod pings only its own session, so arming another from the
// Caches pane writes the store, and that session's mod reads it on its next scan.
/** The ping waiting for the session to go idle. */
let warmTimer: { cancel: () => void } | undefined
/** True from the ping's submit until its turn starts. */
let pingPending = false
/** The ping's turn while it runs. */
let pingTurn: string | null = null
/** Whether the ping's request missed the cache, read off its usage as it lands. */
let pingMissed = false
let turnRunning = false

async function loadWarmths($: $): Promise<void> {
  const keys = (await $.store.keys().catch(() => [] as string[])).filter(key => key.startsWith(WARMTH_PREFIX))
  const found = await Promise.all(keys.map(async key => [key.slice(WARMTH_PREFIX.length), readWarmth(await $.store.get(key).catch(() => undefined))] as const))
  await update($, warmths, () => Object.fromEntries(found))
}

/** Changes a session's Keep warm in the store, which every session reads, and here at once. */
async function changeWarmth($: $, sessionId: string, change: (w: Warmth) => Warmth): Promise<void> {
  const w = change(readWarmth(await $.store.get(warmthKey(sessionId)).catch(() => undefined)))
  if (w.armed) await $.store.set(warmthKey(sessionId), w)
  else await $.store.delete(warmthKey(sessionId)).catch(() => undefined)
  await update($, warmths, all => ({ ...all, [sessionId]: w }))
  await scheduleWarm($)
}

/** A press of Keep warm on a session's cache: the footer's, a row's, or `/vantage-point keep-warm`. */
async function toggleWarmth($: $, sessionId: string): Promise<void> {
  const now = await $.clock.now()
  await changeWarmth($, sessionId, w => toggled(w, now))
}

/** Sets the timer for this session's next ping, or none. */
async function scheduleWarm($: $): Promise<void> {
  warmTimer?.cancel()
  warmTimer = undefined
  const id = await $.session.id()
  const own = (await read($, caches)).caches.find(c => c.kind === 'session' && transcriptId(c) === id)
  if (own === undefined) return
  const now = await $.clock.now()
  const at = pingAt(own, (await read($, warmths))[id] ?? UNARMED, now)
  if (at !== null) warmTimer = $.clock.after(Math.max(0, at - now), () => void pingNow($).catch(() => undefined))
}

/** Submits the ping, unless a turn runs (its own request warms the cache) or the cache needs none. */
async function pingNow($: $): Promise<void> {
  if (turnRunning || pingPending) return
  const id = await $.session.id()
  const own = (await read($, caches)).caches.find(c => c.kind === 'session' && transcriptId(c) === id)
  const w = readWarmth(await $.store.get(warmthKey(id)).catch(() => undefined))
  if (own === undefined || pingAt(own, w, await $.clock.now()) === null) return
  pingPending = true
  const entered = await $.prompt.submit({ text: PING }).catch(() => null)
  if (entered === null || entered.drop !== undefined) pingPending = false
}

/** A response of this session's just landed: its cache counts from now, ahead of the next scan. */
async function touchSessionCache($: $): Promise<void> {
  const id = await $.session.id()
  const now = await $.clock.now()
  await update($, caches, held => {
    const mine = held.caches.find(c => c.kind === 'session' && c.file.endsWith(`/${id}.jsonl`))
    return mine === undefined ? held : { ...held, caches: touch(held.caches, mine.file, now) }
  })
}

/** The engine's release, for the props 2.1.299 added; absent where the host does not say. */
async function engineBase($: $): Promise<string | undefined> {
  return (await $.session.version().catch(() => undefined))?.base
}

/** `Caches (4)`: the pane's title counts the warm caches, the number the footer's pill shows. */
const cachesTitle = (held: readonly HumanQueueCache[], now: number) => `Caches (${cachesAt(held, now).filter(isWarm).length})`

async function openCaches($: $): Promise<void> {
  await $.ui.open({ id: CACHES_PANE, title: cachesTitle((await read($, caches)).caches, await $.clock.now()), focus: true })
}

/** An open Caches pane takes the count a scan found; a closed one stays closed. */
async function retitleCaches($: $, held: readonly HumanQueueCache[], now: number): Promise<void> {
  const pane = (await $.ui.panes()).find(p => p.id === CACHES_PANE)
  const title = cachesTitle(held, now)
  if (pane !== undefined && pane.title !== title) await $.ui.open({ id: CACHES_PANE, title })
}

/** Shows a cache's desktop session in the main window, through the link the desktop names it by (issue #62). */
async function openCacheSession($: $, file: string): Promise<void> {
  const cache = (await read($, caches)).caches.find(c => c.file === file)
  const session = cache === undefined ? undefined : sessionOf(cache)
  const link = session === undefined ? null : sessionLink(session)
  if (link === null) return
  const ran = await $.process.run(['open', link], { timeoutMs: 5000 }).catch(() => undefined)
  if (ran?.exitCode !== 0) $.ui.toast('The desktop did not open that session.')
}

async function openReady($: $): Promise<void> {
  if (!(await readReady($)) && (await read($, ready)) === null) {
    $.ui.toast('Could not read the issues ready for an agent; gh may be signed out or offline.')
    return
  }
  await $.ui.open({ id: READY_PANE, title: 'Ready for agent', focus: true })
}

/** The count the you row is showing, or null while that count is still unknown. */
async function currentWaiting($: $): Promise<number | null> {
  const local = (await openRequests($)).filter(request => request.issue === undefined).length
  return waitingTotal((await read($, observations)).waiting, local)
}

/** Opening the queue means this count has been seen. An unknown count changes nothing. */
async function markQueueSeen($: $): Promise<void> {
  const total = await currentWaiting($)
  if (total === null) return
  await update($, seenWaiting, () => total)
  await update($, unseenSince, () => null)
}

/** A rise in the waiting count starts the two-minute mark on the pill. The first count is only a baseline. */
async function noteWaiting($: $): Promise<void> {
  const total = await currentWaiting($)
  if (total === null) return
  const seen = await read($, seenWaiting)
  const since = await read($, unseenSince)
  const now = await $.clock.now()
  if (seen === null || total < seen) {
    await update($, seenWaiting, () => total)
    if (since !== null) await update($, unseenSince, () => null)
    return
  }
  if (total === seen) return
  if (since !== null && now - since >= NEW_ASK_MS) {
    await update($, seenWaiting, () => total)
    await update($, unseenSince, () => null)
    return
  }
  if (since !== null) return
  await update($, unseenSince, () => now)
  $.clock.after(NEW_ASK_MS, async () => {
    if ((await read($, unseenSince)) !== now) return
    const current = await currentWaiting($)
    await update($, seenWaiting, () => current ?? total)
    await update($, unseenSince, () => null)
  })
}

/** Opens the pane straight on one request, in its bucket: what the band's title does. */
async function openAsk($: $, qid: string): Promise<void> {
  await refresh($)
  await showRequest($, qid)
  await markQueueSeen($)
  await $.ui.open({ id: PANE, title: 'Human queue', focus: true })
  openedPane($)
}

/** Opens the pane on the queue: what /vantage-point and the band's press both do. */
async function openPane($: $): Promise<void> {
  await refresh($)
  await update($, view, at => ({ ...at, zoom: 'home' as const }))
  await markQueueSeen($)
  await $.ui.open({ id: PANE, title: 'Human queue', focus: true })
  // The pane draws what is held now and redraws as the background read lands.
  openedPane($)
}

/** Opens the mock album on the page named, else where it was left. */
async function openAlbum($: $, page: string): Promise<string> {
  const named = ALBUM_PAGES.find(one => one.key === page)
  if (named !== undefined) await update($, albumState, held => ({ ...held, page: named.key }))
  const opened = await $.ui.open({ id: ALBUM_PANE, title: 'Album', focus: true })
  return opened.isPlaced
    ? `The mock album: ${ALBUM_PAGES.length} ways to draw an ask, each tried on the Jev dictation ask (interlace-core#21).`
    : 'Claude Code did not place the album pane on screen: the window is too narrow.'
}

/**
 * The round's asks, read once from the frozen evaluation set the plugin ships
 * (evals/composer/cases.json), and fixed at the width the pane first opened at,
 * so a pane resized mid-round never moves an ask out from under its pick.
 */
let gradeRound: { room: number; cases: GradeCase[] } | null = null
async function roundOf($: $, room: number): Promise<{ room: number; cases: GradeCase[] }> {
  if (gradeRound !== null) return gradeRound
  const text = await $.fs.read(`${$.plugin.root}/evals/composer/cases.json`).catch(() => null)
  const cases = typeof text === 'string' ? gradeCases(JSON.parse(text) as Parameters<typeof gradeCases>[0], room) : []
  gradeRound = { room, cases }
  return gradeRound
}

/** Opens the visuals-grading round where it was left. */
async function openGrading($: $): Promise<string> {
  const opened = await $.ui.open({ id: GRADING_PANE, title: 'Grade visuals', focus: true })
  return opened.isPlaced
    ? 'The visuals-grading round: each ask drawn every way its numbers allow; pick the one you would rule from fastest, then Send.'
    : 'Claude Code did not place the grading pane on screen: the window is too narrow.'
}

/** Opens the palette specimen on the page named, else where it was left. */
/** A Try of the Reader's stop: the reply its prompt brings starts the Reader when it lands. */
let readsNextReply = false

/** Reads what the tour's setup lines say: gh and its login, and this folder's human-queue.md. */
async function readTourSetup($: $): Promise<void> {
  const queueFile = await $.fs.exists(await filePath($)).catch(() => false)
  let next: TourSetup
  try {
    next = { gh: 'signed-in', login: await signedIn($, true), queueFile }
  } catch (error) {
    next = { gh: error instanceof GhError && error.message.startsWith('gh could not run') ? 'missing' : 'signed-out', login: null, queueFile }
  }
  await update($, tourSetup, () => next)
}

async function openTour($: $): Promise<string> {
  void readTourSetup($).catch(() => undefined)
  const opened = await $.ui.open({ id: TOUR_PANE, title: 'Tour', focus: true })
  return opened.isPlaced
    ? `The tour: the setup, then ${TOUR_STOPS.length} features, each with a Try that runs it here for real.`
    : 'Claude Code did not place the tour pane on screen: the window is too narrow.'
}

/** A press on a stop: a Try sends its prompt as the person's own, an Open opens its pane. */
async function pressTour($: $, key: TourKey): Promise<void> {
  const stop = TOUR_STOPS.find(one => one.key === key)
  if (stop === undefined) return
  const at = await $.clock.now()
  await update($, tourState, held => ({ pressed: { ...held.pressed, [key]: at } }))
  if (stop.act === 'open') {
    if (key === 'caches') await openCaches($)
    else await openPalette($, '')
    return
  }
  readsNextReply = stop.readsNext === true
  await $.prompt.submit({ text: stop.prompt, asUser: true })
}

async function openPalette($: $, page: string): Promise<string> {
  const named = PAGES.find(one => one.key === page)
  if (named !== undefined) await update($, paletteState, held => ({ ...held, page: named.key }))
  const opened = await $.ui.open({ id: PALETTE_PANE, title: 'Palette', focus: true })
  return opened.isPlaced
    ? `The palette: what the desktop draws, one page per element (${PAGES.map(one => one.key).join(', ')}).`
    : 'Claude Code did not place the palette pane on screen: the window is too narrow.'
}

async function store($: $, body: string): Promise<void> {
  if ((await read($, text)) !== body) await update($, text, () => body)
}

async function stamp($: $, path: string): Promise<{ mtime: number; size: number }> {
  const stat = await $.fs.stat(path).catch(() => undefined)
  return { mtime: stat?.mtimeMs ?? 0, size: stat === undefined ? -1 : stat.size }
}

/** Re-reads the file when it changed on disk: an agent's edit, an editor's save. */
async function refresh($: $): Promise<void> {
  const path = await filePath($)
  const now = await stamp($, path)
  if (now.mtime === seen.mtime && now.size === seen.size) return
  seen = now
  await store($, await readFile($, path))
  await noteWaiting($)
}

// --- Issue drafts on disk ----------------------------------------------------------

const storeKey = (key: string) => `${STORE_PREFIX}${key}`
const STATES = new Set(['waiting', 'sending', 'unsent', 'ambiguous', 'posted'])
const LABELS = new Set(['pending', 'removed', 'kept'])

function isAsk(value: unknown): value is Ask {
  const ask = value as Partial<Ask> | null
  const s = ask?.submission as Partial<Submission> | null | undefined
  return (
    typeof ask?.text === 'string' &&
    typeof ask.rev === 'number' &&
    (ask.doneAt === null || typeof ask.doneAt === 'number') &&
    typeof ask.issue?.key === 'string' &&
    typeof ask.issue.title === 'string' &&
    typeof ask.issue.base === 'string' &&
    typeof ask.issue.instructions === 'string' &&
    typeof ask.issue.meta?.repo === 'string' &&
    (s === null ||
      (typeof s?.id === 'string' &&
        typeof s.target === 'string' &&
        typeof s.login === 'string' &&
        typeof s.revision === 'string' &&
        typeof s.body === 'string' &&
        typeof s.session === 'string' &&
        typeof s.dueAt === 'number' &&
        STATES.has(s.state as string) &&
        LABELS.has(s.label as string) &&
        (s.commentUrl === null || typeof s.commentUrl === 'string')))
  )
}

/** One issue's saved draft: what is on disk (undefined when nothing is), or why it could not be read. */
async function readStored($: $, key: string): Promise<{ ok: true; value: Ask | undefined } | { ok: false; error: string }> {
  try {
    const value = await $.store.get(storeKey(key))
    return { ok: true, value: isAsk(value) ? value : undefined }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

/** This session's copy unless the disk holds a later revision. */
function newest(mine: Ask | undefined, disk: Ask | undefined): Ask | undefined {
  if (mine === undefined) return disk
  if (disk === undefined) return mine
  return disk.rev >= mine.rev ? disk : mine
}

/** Runs `work` after every earlier update of the same issue in this session has finished. */
function serialize<T>(key: string, work: () => Promise<T>): Promise<T> {
  const turn = (chains.get(key) ?? Promise.resolve()).then(work, work)
  chains.set(
    key,
    turn.catch(() => undefined),
  )
  return turn
}

/**
 * Changes one issue request and saves it, by compare-and-swap: `change` runs
 * on the newest copy, the save lands only if the disk still holds the revision
 * that copy was read at, and on a mismatch the draft is read again and
 * `change` applied again. In this session the whole update-and-save runs one
 * issue at a time. A draft that cannot be read is never written over. `change`
 * answers undefined to leave it, null to drop it.
 */
async function patchAsk(
  $: $,
  key: string,
  change: (ask: Ask | undefined) => Ask | null | undefined,
): Promise<{ ask: Ask | null | undefined; saved: boolean }> {
  return serialize(key, async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const read1 = await readStored($, key)
      if (!read1.ok) {
        $.ui.toast(`Could not read ${shortKey(key)}'s saved rulings (${read1.error}), so nothing about it was written.`)
        return { ask: undefined, saved: false }
      }
      const disk = read1.value
      const base = newest((await read($, asks))[key], disk)
      const next = change(base)
      if (next === undefined) {
        if (disk !== undefined && base === disk) await update($, asks, all => (all[key]?.rev === disk.rev ? all : { ...all, [key]: disk }))
        return { ask: undefined, saved: true }
      }
      const result = next === null ? null : { ...next, rev: Math.max(base?.rev ?? 0, disk?.rev ?? 0) + 1 }
      const read2 = await readStored($, key)
      if (!read2.ok) {
        $.ui.toast(`Could not read ${shortKey(key)}'s saved rulings (${read2.error}), so nothing about it was written.`)
        return { ask: undefined, saved: false }
      }
      if ((read2.value?.rev ?? -1) !== (disk?.rev ?? -1)) continue
      let saved = true
      try {
        if (result === null) await $.store.delete(storeKey(key))
        else await $.store.set(storeKey(key), result)
      } catch (error) {
        saved = false
        $.ui.toast(`Could not save ${shortKey(key)} to disk (${String(error)}). This session keeps it; a restart would not.`)
      }
      await update($, asks, all => {
        const copy = { ...all }
        if (result === null) delete copy[key]
        else copy[key] = result
        return copy
      })
          return { ask: result, saved }
    }
    $.ui.toast(`${shortKey(key)} keeps changing in another session; try again in a moment.`)
    return { ask: undefined, saved: false }
  })
}

/** Changes one submission, matched by id; resolves it as saved, or undefined. */
async function patchSubmission($: $, key: string, id: string, change: (s: Submission) => Submission | undefined): Promise<{ submission: Submission | undefined; saved: boolean }> {
  const { ask, saved } = await patchAsk($, key, held => {
    if (held?.submission?.id !== id) return undefined
    const next = change(held.submission)
    return next === undefined ? undefined : { ...held, submission: next }
  })
  return { submission: ask?.submission ?? undefined, saved }
}

/**
 * Loads the drafts saved to disk, newest revision first; nothing is sent or re-armed.
 * Drafts on another account's repositories are left unloaded once gh says whose they are.
 */
async function loadAsks($: $): Promise<void> {
  const owner = await signedIn($, false).catch(() => null)
  const keys = await $.store.keys()
  // One-time cleanup: the unreleased round-one build kept every draft under one key.
  if (keys.includes(LEGACY_KEY)) await $.store.delete(LEGACY_KEY)
  for (const one of keys.filter(key => key.startsWith(STORE_PREFIX))) {
    const value = await $.store.get(one).catch(() => undefined)
    if (!isAsk(value) || (owner !== null && !isOwned(value.issue.meta.repo, owner))) continue
    const key = one.slice(STORE_PREFIX.length)
    await update($, asks, all => (newest(all[key], value) === all[key] ? all : { ...all, [key]: value }))
  }
}

/**
 * Reads the request's text fresh, applies `edit`, and writes the result: an
 * issue's draft by compare-and-swap, the file re-reading first and redoing the
 * edit when someone else wrote meanwhile. A QueueError (the item moved, the
 * request is gone) becomes a toast and the pane reloads.
 */
async function mutate($: $, qid: string, edit: (body: string, id: string) => string): Promise<boolean> {
  const { kind, id } = sourceOf(qid)
  if (kind === 'issue') {
    try {
      const { ask } = await patchAsk($, id, held => (held === undefined || !isWaiting(held) ? undefined : { ...held, text: edit(held.text, id) }))
      if (ask === undefined) $.ui.toast(`${shortKey(id)} is no longer waiting on you.`)
      return ask !== undefined
    } catch (error) {
      if (!(error instanceof QueueError)) throw error
      $.ui.toast(error.message)
      return false
    }
  }
  const path = await filePath($)
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await readFile($, path)
    let next: string
    try {
      next = edit(current, id)
    } catch (error) {
      if (!(error instanceof QueueError)) throw error
      $.ui.toast(error.message)
      await store($, current)
      return false
    }
    if (next === current) {
      await store($, current)
      return true
    }
    if ((await readFile($, path)) !== current) continue
    await $.fs.write(path, next)
    seen = await stamp($, path)
    await store($, next)
    return true
  }
  $.ui.toast(`${FILE} keeps changing under the pane; try again in a moment.`)
  await refresh($)
  return false
}

// --- Reading the issues --------------------------------------------------------

/**
 * The signed-in gh login, read again when `fresh` (each pane open, each send) or not yet known.
 * It is also the owner: the repositories the queue reads, and the only ones it posts to.
 * While gh is signed out this throws a GhError, and nothing that needs an owner reads.
 */
async function signedIn($: $, fresh: boolean): Promise<string> {
  if (!fresh && login !== null) return login
  try {
    login = await signedInLogin(runner($))
    return login
  } catch (error) {
    login = null
    throw error
  }
}

/** An issue read as a request: its Asks comments count only from the signed-in login. */
function readAsk(viewed: Viewed, self: string | null): HumanQueueIssue {
  return issueAsk(viewed, author => sameLogin(author, self))
}

/**
 * A fresh read of an issue applied to what is held; undefined leaves the draft
 * as it is. An answered issue stays hidden while search catches up, unless it
 * now asks something new: a new round shows at once.
 */
function refreshed(held: Ask | undefined, issue: HumanQueueIssue, now: number): Ask | undefined {
  const fresh: Ask = { issue, text: issue.base, submission: null, doneAt: null, rev: 0 }
  if (held === undefined) return fresh
  if (held.doneAt !== null) {
    const isNewRound = held.submission?.label === 'kept' || (held.submission !== null && askRevision(issue) !== held.submission.revision)
    return isNewRound || now - held.doneAt >= HIDE_MS ? fresh : undefined
  }
  if (held.submission !== null) return undefined
  if (isSameAsk(held.issue, issue)) return JSON.stringify(held.issue) === JSON.stringify(issue) ? undefined : { ...held, issue }
  return { ...held, issue, text: carryRulings({ text: held.text, instructions: held.issue.instructions, title: held.issue.title }, issue) }
}

/** Runs `work` over `list`, `width` at a time. */
async function inBatches<T>(list: readonly T[], width: number, work: (one: T) => Promise<void>): Promise<void> {
  for (let at = 0; at < list.length; at += width) await Promise.all(list.slice(at, at + width).map(work))
}

/** Reads the open ready-for-human issues again, one read at a time. */
function refreshIssues($: $): Promise<void> {
  issuesLookup ??= readIssues($).finally(() => {
    issuesLookup = undefined
  })
  return issuesLookup
}

/** Most tickets one reply is read for; the rest of its Tickets page shows them unread. */
const TICKETS_READ = 12
// Ticket reads under way, by ticket key: a reply that names a ticket twice reads it once.
const cardsInFlight = new Set<string>()

/** The tickets a reply names in this project's repositories, first mention first, each once. */
async function ticketsOf($: $, answer: string): Promise<HumanQueueReplyTicket[]> {
  const home = await read($, here)
  const self = await signedIn($, false).catch(() => null)
  const tickets: HumanQueueReplyTicket[] = []
  if (self === null) return tickets
  for (const { repo, number } of mentionsOf(answer)) {
    const owner = repo ?? home
    if (owner === null || !isOwned(owner, self)) continue
    const key = `${owner.toLowerCase()}#${number}`
    if (tickets.some(ticket => ticket.key === key)) continue
    const sameRepo = home !== null && owner.toLowerCase() === home.toLowerCase()
    tickets.push({ key, repo: owner, number, label: sameRepo ? `#${number}` : `${owner}#${number}` })
  }
  return tickets
}

/** Reads the cards the reply's tickets do not have yet. A failed read is kept and tried on the next reply. */
async function readCards($: $, tickets: readonly HumanQueueReplyTicket[]): Promise<void> {
  const self = await signedIn($, false).catch(() => null)
  if (self === null) return
  const held = await read($, ticketStates)
  const wanted = tickets.slice(0, TICKETS_READ).filter(ticket => !held[ticket.key]?.card && !cardsInFlight.has(ticket.key))
  await Promise.all(wanted.map(async ticket => {
    cardsInFlight.add(ticket.key)
    try {
      const card = await viewCard(runner($), ticket.repo, ticket.number, self)
      await update($, ticketStates, states => ({ ...states, [ticket.key]: { card, error: null } }))
    } catch (error) {
      if (!(error instanceof GhError)) throw error
      await update($, ticketStates, states => ({ ...states, [ticket.key]: { card: null, error: error.message } }))
    } finally {
      cardsInFlight.delete(ticket.key)
    }
  }))
}

/**
 * Reads the ticket this session's agent is building, off the branch of the
 * session's working directory (a worktree's own), from origin's repository.
 * Only a verified branch with no ticket can be Idle. A failed ticket read hides
 * that work; it cannot borrow an old declared task or another branch's ticket.
 */
async function readAgent($: $): Promise<void> {
  const epoch = ++agentReadEpoch
  let next: HumanQueueAgentNext = null
  let source: HumanQueueAgentBranch = { state: 'unknown', key: null, branch: null }
  let repoHere: string | null = null
  try {
    const cwd = await $.session.cwd()
    const head = await $.process.run(['git', '-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 5000 })
    const found = head.exitCode === 0 ? branchIssue(head.stdout) : null
    source = { state: head.exitCode !== 0 ? 'unknown' : found === null ? 'none' : 'ticket', key: null, branch: head.exitCode === 0 ? head.stdout.trim() : null }
    if (epoch !== agentReadEpoch) return
    await update($, agentBranch, held => epoch === agentReadEpoch ? source : held)
    const remote = await $.process.run(['git', '-C', cwd, 'remote', 'get-url', 'origin'], { timeoutMs: 5000 })
    const repo = remote.exitCode === 0 ? repoOfRemote(remote.stdout) : null
    repoHere = repo
    if (found !== null && repo !== null) source = { ...source, state: 'ticket', key: `${repo}#${found.number}` }
    if (epoch !== agentReadEpoch) return
    await update($, agentBranch, held => epoch === agentReadEpoch ? source : held)
    if (found !== null && repo !== null) {
      const owner = await signedIn($, false)
      next = parseTicket(await gh(runner($), ticketArgs(repo, found.number)), repo, found.kind)
      if (found.kind === 'spec') {
        const progress = await readSpecProgress(runner($), repo, found.number, owner).catch(() => null)
        if (progress !== null) next.progress = { closed: progress.closed, total: progress.total }
      }
    }
  } catch (error) {
    if (!(error instanceof GhError)) $.ui.log(`vantage-point: could not read the session's ticket: ${String(error)}`)
  }
  if (epoch !== agentReadEpoch) return
  await update($, agentBranch, held => epoch === agentReadEpoch ? source : held)
  const held = await read($, agent)
  if (JSON.stringify(held) !== JSON.stringify(next)) await update($, agent, held => epoch === agentReadEpoch ? next : held)
  if ((await read($, here)) !== repoHere) await update($, here, held => epoch === agentReadEpoch ? repoHere : held)
}

async function readIssues($: $): Promise<void> {
  const run = runner($)
  let search: { found: Found[]; isCapped: boolean }
  let owner: string
  try {
    owner = await signedIn($, false)
    const labelled = await labelSearch($)
    search = { found: asksOf(labelled), isCapped: labelled.isCapped }
  } catch (error) {
    if (!(error instanceof GhError)) throw error
    await update($, github, () => error.message)
    await markCount($, 'waiting', null)
    return
  }
  await markCount($, 'waiting', search.isCapped ? null : search.found.length)
  await noteWaiting($)
  const started = await $.clock.now()
  const held = await read($, asks)
  const problems: string[] = []
  if (search.isCapped) problems.push(`GitHub's search returns ${SEARCH_CEILING} issues at most, so any past that are not shown`)
  let isOverBudget = false
  const look = async (repo: string, number: number): Promise<Viewed | undefined> => {
    if ((await $.clock.now()) - started > SCAN_BUDGET_MS) {
      isOverBudget = true
      return undefined
    }
    try {
      return await viewAsk(run, repo, number, owner)
    } catch (error) {
      if (!(error instanceof GhError)) throw error
      problems.push(error.message)
      return undefined
    }
  }

  // Start where the last read stopped, so issues past a slow stretch are read in turn.
  const count = search.found.length
  const start = count === 0 ? 0 : scanFrom % count
  const order = [...search.found.slice(start), ...search.found.slice(0, start)]
  let reached = order.length
  const incoming = new Map<string, HumanQueueIssue | null>()
  const moved: [string, Viewed][] = []
  const listed = new Set(search.found.map(hit => issueKey(hit.repo, hit.number)))
  await inBatches(
    order.map((hit, at) => ({ hit, at })),
    4,
    async ({ hit, at }) => {
      const key = issueKey(hit.repo, hit.number)
      const previous = held[key]
      const isSettled =
        previous !== undefined &&
        ((previous.submission !== null && previous.doneAt === null) ||
          (previous.doneAt !== null &&
            previous.submission?.label !== 'kept' &&
            started - previous.doneAt < HIDE_MS &&
            previous.issue.updatedAt === hit.updatedAt) ||
          (previous.submission === null && previous.issue.updatedAt === hit.updatedAt))
      if (isSettled) return
      const viewed = await look(hit.repo, hit.number)
      if (viewed === undefined) {
        if (isOverBudget) reached = Math.min(reached, at)
        return
      }
      if (issueKey(viewed.repo, viewed.number) !== key) moved.push([key, viewed])
      else incoming.set(key, viewed.isOpen && viewed.isLabelled ? readAsk(viewed, login) : null)
    },
  )
  scanFrom = reached < order.length ? (start + reached) % count : start
  // Gone from the search: answered (drop it), moved, or new and not indexed yet (keep it while it waits).
  for (const [key, previous] of Object.entries(held)) {
    if (listed.has(key) || (previous.submission !== null && previous.doneAt === null)) continue
    if (previous.doneAt !== null) {
      incoming.set(key, null)
      continue
    }
    const viewed = await look(previous.issue.meta.repo, previous.issue.meta.number)
    if (viewed === undefined) continue
    if (issueKey(viewed.repo, viewed.number) !== key) moved.push([key, viewed])
    else incoming.set(key, viewed.isOpen && viewed.isLabelled ? readAsk(viewed, login) : null)
  }

  const now = await $.clock.now()
  for (const [key, issue] of incoming) {
    await patchAsk($, key, ask =>
      issue !== null ? refreshed(ask, issue, now) : ask === undefined || (ask.submission !== null && ask.doneAt === null) ? undefined : null,
    )
  }
  for (const [key, viewed] of moved) await transfer($, key, viewed)
  if (isOverBudget) problems.push(`stopped reading after ${SCAN_BUDGET_MS / 1000} s; the next read carries on from there`)
  hasScanned = true
  // A pause reaches every read it stops; the pane says it once.
  await update($, github, () => (problems.length === 0 ? null : [...new Set(problems)].join('; ')))
}

// --- Selection -------------------------------------------------------------------

type Selection = { open: Request[]; request: Request | undefined; item: Item | undefined; index: number }

/** The pictures the card draws for one item: its own, then the lead-in's. */
function picturesFor(request: Request, item: Item | undefined): Picture[] {
  const all = [...picturesOf(item?.body ?? ''), ...picturesOf(request.body)]
  return all.filter((one, i) => all.findIndex(other => other.url === one.url) === i)
}

/** One picture as the card holds it, starting its fetch the first time it is asked for. */
function pictureOf($: $, url: string, root: string): Loaded | 'failed' | 'pending' {
  const held = pictures.get(url)
  if (held !== undefined) return held
  const fetch = fetchOf(url, root)
  if (fetch === null) {
    pictures.set(url, 'failed')
    return 'failed'
  }
  pictures.set(url, 'pending')
  void $.process
    .run(['/bin/sh', '-c', FETCH_SCRIPT, 'sh', nameOf(url), ...fetchArgs(fetch)], { timeoutMs: 45_000 })
    .then(ran => (ran.exitCode === 0 ? loadedOf(ran.stdout) : null))
    .catch(() => null)
    .then(loaded => {
      pictures.set(url, loaded ?? 'failed')
      $.ui.invalidate('ui.render')
    })
  return 'pending'
}

// --- Composing an item's card (#97) --------------------------------------------------

/** Items this load is planning, by id: a second sight of one, from the poll or the review tool, waits on the first. */
const planning = new Set<string>()
/** Items another session claimed, by id, each with a re-read of the store pending. */
const awaiting = new Set<string>()
/** How long a claim settles before it is read back: two sessions that claimed at once see the same last writer. */
const CLAIM_SETTLE_MS = 250
/** How often a session waiting on another's plan reads the store again. */
const RECHECK_MS = 2000

/** This process's composer: how it reaches Jev is decided on its first plan, once. */
let compose: ((items: readonly ComposeItem[]) => Promise<Plan[]>) | undefined

function composerOf($: $): (items: readonly ComposeItem[]) => Promise<Plan[]> {
  compose ??= composer(
    async () => {
      const home = (await $.env.get('HOME')) ?? ''
      const adapter = (await $.env.get('JEV_ADAPTER')) || ''
      const key = await $.env.get('TYPESAFE_API_KEY')
      return access({ key, adapterFound: key?.trim() ? await $.fs.exists(adapter) : false, root: $.plugin.root, home, adapter })
    },
    (argv, init) => $.process.run(argv, init),
  )
  return compose
}

/** The open items with facts in these requests, each once. */
function composable(requests: readonly Request[]): ComposeItem[] {
  return [...new Map(requests.flatMap(r => r.items.flatMap(item => composeItem(item) ?? [])).map(one => [one.id, one])).values()]
}

/**
 * Plans the items no session has planned, in the background, never in a render.
 * Every session reads one store, so a plan made anywhere is drawn everywhere. A
 * session claims an item before it calls Jev and reads its claim back after the
 * claims settle; only the session whose claim stood plans it. One that finds
 * another's live claim reads the store again until that plan lands or the claim
 * dies, then plans the item itself.
 */
async function planItems($: $, items: readonly ComposeItem[]): Promise<void> {
  const held = await read($, plans)
  const now = await $.clock.now()
  const claimed: ComposeItem[] = []
  for (const one of items) {
    if (held[one.id] !== undefined || planning.has(one.id)) continue
    const stored = await $.store.get(planKey(one.id)).then(value => ({ value }), () => null)
    if (stored === null) continue
    const slot = readSlot(stored.value, one.id)
    if (slot.kind === 'plan' && !needsPlan(slot, now)) {
      await update($, plans, all => ({ ...all, [one.id]: slot.plan }))
      continue
    }
    if (slot.kind === 'claim' && slot.by !== SESSION && !needsPlan(slot, now)) {
      recheck($, one)
      continue
    }
    const claim: PlanSlot = { claim: { by: SESSION, at: now } }
    if (await $.store.set(planKey(one.id), claim).then(() => true, () => false)) claimed.push(one)
  }
  if (claimed.length === 0) return
  for (const one of claimed) planning.add(one.id)
  try {
    await $.clock.sleep(CLAIM_SETTLE_MS)
    const mine: ComposeItem[] = []
    for (const one of claimed) {
      const slot = readSlot(await $.store.get(planKey(one.id)).catch(() => undefined), one.id)
      if (slot.kind === 'claim' && slot.by === SESSION) mine.push(one)
      else recheck($, one)
    }
    if (mine.length === 0) return
    const made = await composerOf($)(mine).catch(() => mine.map(one => planOf(one, { failed: 'failed' })))
    const at = await $.clock.now()
    for (const p of made) {
      const slot: PlanSlot = { plan: p, at }
      if (isShared(p)) await $.store.set(planKey(p.item), slot).catch(() => undefined)
      else await $.store.delete(planKey(p.item)).catch(() => undefined)
      await update($, plans, all => ({ ...all, [p.item]: p }))
    }
  } finally {
    for (const one of claimed) planning.delete(one.id)
  }
}

/** Reads the store again soon for an item another session is planning. */
function recheck($: $, one: ComposeItem): void {
  if (awaiting.has(one.id)) return
  awaiting.add(one.id)
  $.clock.after(RECHECK_MS, () => {
    awaiting.delete(one.id)
    void planItems($, [one]).catch(() => undefined)
  })
}

/** Plans every open item with facts: after each read of the issues, and when the review tool opens a request. */
async function planOpen($: $, requests?: readonly Request[]): Promise<void> {
  await planItems($, composable(requests ?? (await openRequests($))))
}

/** Opens or closes an item's prose on its card; each open is counted in the store, per item. */
async function toggleProse($: $, id: string): Promise<void> {
  const open = (await read($, composedView)).prose === id
  await update($, composedView, held => ({ ...held, prose: open ? null : id }))
  if (open) return
  const counts = await $.store.get(PROSE_OPENS_KEY).catch(() => undefined)
  const all = typeof counts === 'object' && counts !== null && !Array.isArray(counts) ? (counts as Record<string, unknown>) : {}
  const before = typeof all[id] === 'number' ? (all[id] as number) : 0
  await $.store.set(PROSE_OPENS_KEY, { ...all, [id]: before + 1 }).catch(() => undefined)
}

/** The composed card of an item with facts, drawn from its plan, or the prior-ranked card until the plan lands; null for any other item. */
async function composedOf(
  $: $,
  e: RenderInput<'Pane'>,
  item: Item | undefined,
  surface: 'desktop' | 'phone',
  images: { count: number; node: RenderElement } | null = null,
  beside: RenderElement | null = null,
): Promise<RenderChildren | null> {
  const one = item === undefined ? null : composeItem(item)
  if (one === null || item === undefined) return null
  const elements = $.ui.resolve(e)
  if (!('Svg' in elements)) return null
  const { Box, Text, Button, Svg, Link, Markdown } = elements
  const Select = 'Select' in elements ? elements.Select : undefined
  const Client = 'Client' in elements ? elements.Client : undefined
  const p = (await read($, plans))[one.id] ?? planOf(one, { failed: 'pending' })
  const held = await read($, composedView)
  return composedCard(
    { Box, Text, Button, Svg, Link, Markdown, ...(Select === undefined ? {} : { Select }) },
    {
      plan: p,
      surface,
      facts: one.facts,
      question: item.heading === String(item.index) ? null : item.heading,
      prose: withoutPictures(item.body),
      proseOpen: held.prose === one.id,
      room: cardWidth(e.props.bodyColumns),
      scope: held.scopes[one.id] ?? -1,
      newProps: takesNewProps(await engineBase($)),
      images,
      beside,
    },
    {
      prose: () => void toggleProse($, one.id),
      scope: scope => void update($, composedView, v => ({ ...v, scopes: { ...v.scopes, [one.id]: scope } })),
    },
    Client === undefined
      ? null
      : terms => <Client key="glossary" width="100%" module="../panes/album/glossary.tsx" props={{ terms: terms.map(t => ({ term: t.term, means: t.meaning })) }} />,
  )
}

function select(open: Request[], at: HumanQueueView): Selection {
  const request = open.find(r => qidOf(r) === at.request) ?? open[0]
  if (request === undefined || request.items.length === 0) return { open, request, item: undefined, index: 1 }
  const index = Math.min(Math.max(1, at.item), request.items.length)
  return { open, request, item: index === 0 ? undefined : request.items[index - 1], index }
}

async function current($: $): Promise<Selection> {
  return select(await openRequests($), await read($, view))
}

function firstUnruled(request: Request): number {
  return request.items.find(item => item.verdict === null)?.index ?? 1
}

async function show($: $, request: string | null, item: number, zoom: 'plate' | 'bucket' = 'bucket'): Promise<void> {
  await update($, view, at => ({ ...at, request, item, zoom }))
  await update($, drafting, () => false)
  windowOffset = 0
  await $.ui.scroll({ to: 'start', in: PANE }).catch(() => undefined)
}

/** Switches to an open request, at its first unruled item. */
async function showRequest($: $, qid: string): Promise<void> {
  const request = select(await openRequests($), { request: qid, item: 1 }).request
  if (request === undefined) return
  await update($, capture, () => null)
  await show($, qidOf(request), firstUnruled(request))
}

/** Moves on to the first open request, after one was submitted. */
async function showNext($: $): Promise<void> {
  const open = await openRequests($)
  const was = (await read($, view)).request
  const project = await projectName($)
  const bucket = was === null ? undefined : bucketOfQid(was, project)
  const same = bucket === undefined ? undefined : open.find(r => bucketOf(r, project) === bucket)
  if (same !== undefined) return show($, qidOf(same), firstUnruled(same))
  // That bucket is empty: back to the plate when other buckets wait, else the next request.
  const next = select(open, { request: null, item: 1 }).request
  const zoom = bucketsOf(open, project).length > 1 ? 'plate' : 'bucket'
  await show($, next === undefined ? null : qidOf(next), next === undefined ? 1 : firstUnruled(next), zoom)
}

// --- Rulings, notes, undo ----------------------------------------------------------

type Target = { request: string; item: number; heading: string | null }

/** Records a change for Q to take back; a new change forgets what E could redo. */
async function remember($: $, entry: HumanQueueUndo): Promise<void> {
  await update($, undoStack, list => [...list.slice(-49), entry])
  await update($, redoStack, () => [])
}

/** Sets one item's ruling, a verdict, a comment or both, keeping what is not given. */
async function writeRuling($: $, target: Target, change: { verdict?: 'yes' | 'no'; comment?: string | null }): Promise<boolean> {
  let before: string | null = null
  let after: string | null = null
  let heading = target.heading ?? ''
  const ok = await mutate($, target.request, (body, id) => {
    before = rulingLineOf(body, id, target.item, target.heading)
    const found = findItem(findRequest(parse(body), id)!, target.item, target.heading)
    heading = found?.heading ?? heading
    const was = before === null ? { verdict: null, comment: null } : parseRuling(before.replace(/^ruling:\s*/i, ''))
    const next = setRuling(
      body,
      id,
      target.item,
      { verdict: change.verdict ?? was.verdict, comment: change.comment === undefined ? was.comment : change.comment },
      target.heading,
    )
    after = rulingLineOf(next, id, target.item, heading)
    return next
  })
  if (!ok) return false
  if (before !== after) await remember($, { kind: 'ruling', request: target.request, item: target.item, heading, before, after })
  return true
}

async function writeNote($: $, qid: string, note: string | null): Promise<boolean> {
  let before: string | null = null
  let after: string | null = null
  const ok = await mutate($, qid, (body, id) => {
    before = fieldLineOf(body, id, 'note')
    const next = setNote(body, id, note)
    after = fieldLineOf(next, id, 'note')
    return next
  })
  if (!ok) return false
  if (before !== after) await remember($, { kind: 'note', request: qid, before, after })
  return true
}

/** Saves a comment on an item, or a plain ask's note. */
async function saveComment($: $, target: Target, value: string): Promise<boolean> {
  const comment = value.trim() === '' ? null : value.trim()
  const request = await requestOf($, target.request)
  if (request === undefined || !request.isOpen) throw new QueueError(`Request ${sourceOf(target.request).id} is no longer open.`)
  if (request.items.length === 0) return writeNote($, target.request, comment)
  return writeRuling($, target, { comment })
}

async function rule($: $, verdict: 'yes' | 'no'): Promise<void> {
  const { request, item, index } = await current($)
  if (request === undefined) return
  if (WAITS_FOR_R.has(await phaseOfRequest($, request))) {
    $.ui.toast(`${label(request)} is already submitted: R ${verdict === 'yes' ? 'sends it' : 'sends it, or take it back'}.`)
    return
  }
  if (item === undefined && request.items.length > 0) return step($, 1)
  if (item === undefined) {
    if (verdict === 'yes') await submit($)
    else $.ui.toast('A plain ask has no yes or no: W marks it done.')
    return
  }
  if (!(await writeRuling($, { request: qidOf(request), item: index, heading: item.heading }, { verdict }))) return
  await show($, qidOf(request), Math.min(index + 1, request.items.length))
}

/** Writes one side of an undo entry: its `before` lines for Q, its `after` lines for E. */
async function replay($: $, entry: HumanQueueUndo, side: 'before' | 'after'): Promise<boolean> {
  if (entry.kind === 'ruling') {
    const ok = await mutate($, entry.request, (body, id) => writeRulingLine(body, id, entry.item, entry[side], entry.heading))
    if (ok) await show($, entry.request, entry.item)
    return ok
  }
  if (entry.kind === 'note') {
    const ok = await mutate($, entry.request, (body, id) => writeFieldLine(body, id, 'note', entry[side]))
    if (ok) await show($, entry.request, 1)
    return ok
  }
  const { kind, id } = sourceOf(entry.request)
  if (kind === 'issue') return side === 'before' ? takeBack($, id) : resubmit($, id)
  const lines = entry[side]
  const ok = await mutate($, entry.request, (body, at) =>
    writeFieldLine(writeFieldLine(body, at, 'status', lines.status), at, 'completed', lines.completed),
  )
  if (!ok) return false
  if (side === 'before') {
    pending.get(entry.request)?.cancel()
    pending.delete(entry.request)
    const request = await requestOf($, entry.request)
    await show($, entry.request, request === undefined ? 1 : firstUnruled(request))
    $.ui.toast(`Reopened ${id}.`)
  } else {
    await handBack($, entry.request)
    await showNext($)
  }
  return true
}

async function undo($: $): Promise<void> {
  const last = (await read($, undoStack)).at(-1)
  if (last === undefined) {
    $.ui.toast('Nothing to undo.')
    return
  }
  if (!(await replay($, last, 'before'))) return
  await update($, undoStack, all => all.slice(0, -1))
  await update($, redoStack, all => [...all, last])
  await update($, capture, () => null)
}

async function redo($: $): Promise<void> {
  const last = (await read($, redoStack)).at(-1)
  if (last === undefined) {
    $.ui.toast('Nothing to redo.')
    return
  }
  if (!(await replay($, last, 'after'))) return
  await update($, redoStack, all => all.slice(0, -1))
  await update($, undoStack, all => [...all, last])
}

async function step($: $, delta: number): Promise<void> {
  const { request, index } = await current($)
  if (request === undefined || request.items.length === 0) return
  const next = Math.min(Math.max(1, index + delta), request.items.length)
  if (next !== index) await show($, qidOf(request), next)
}

/** Submit all is live on the last item, once every item is ruled, or for a plain ask. */
function canSubmit(request: Request, index: number): boolean {
  const tally = counts(request)
  return tally.total === 0 || index >= tally.total || tally.unruled === 0
}

// --- Submitting --------------------------------------------------------------------

/** This session's cache as it stands now, read afresh; undefined when no transcript says. */
async function ownCache($: $): Promise<Seen | undefined> {
  await scanCachesNow($).catch(() => undefined)
  const id = await $.session.id()
  const own = (await read($, caches)).caches.find(c => c.kind === 'session' && c.file.endsWith(`/${id}.jsonl`))
  return own === undefined ? undefined : stateOf(own, await $.clock.now())
}

/**
 * Gives the asking agent its rulings: into this session while its cache is warm or cheap to
 * warm again, or else to a fresh agent beside it, so a cold, costly context is not read back
 * for a few rulings (issue 66). Resolves why nothing took them, or null.
 */
async function handOver($: $, name: string, handback: string): Promise<string | null> {
  const choice = handbackOf(await ownCache($).catch(() => undefined))
  if (choice.kind === 'fresh') {
    const spawned = await $.agent.spawn({ prompt: freshBrief(handback), description: `Rulings on ${name}` }).catch(() => null)
    if (spawned !== null && spawned.deny === undefined) {
      // Core sets the id; with none, the report still reaches the session, as it did before.
      const agentId = spawned.agentId
      if (agentId !== undefined) await update($, fresh, ids => [...ids, agentId])
      $.ui.toast(`This session's cache is cold with ${tokens(choice.prefix)} in it, so a fresh agent took the rulings on ${name}.`)
      return null
    }
  }
  return (await $.prompt.submit({ text: handback })).drop ?? null
}

/** Hands a file request's rulings back to the agent that asked, once the undo window has passed. */
async function handBack($: $, qid: string): Promise<void> {
  if (!(await read($, notify)).includes(qid)) return
  pending.get(qid)?.cancel()
  pending.set(
    qid,
    $.clock.after(HAND_BACK_MS, () => {
      pending.delete(qid)
      void sendFile($, qid).catch(() =>
        $.ui.toast(`Could not hand the rulings for ${sourceOf(qid).id} back to the agent; they are in ${FILE}.`),
      )
    }),
  )
}

async function sendFile($: $, qid: string): Promise<void> {
  await refresh($)
  const done = findRequest(parse(await read($, text)), sourceOf(qid).id)
  if (done === undefined || done.isOpen || !(await read($, notify)).includes(qid)) return
  await handOver($, sourceOf(qid).id, submissionText(done))
  await update($, notify, ids => ids.filter(one => one !== qid))
}

/** Forgets every undo and redo entry of a request that has left the pane for good. */
async function forget($: $, qid: string): Promise<void> {
  await update($, undoStack, list => list.filter(entry => entry.request !== qid))
  await update($, redoStack, list => list.filter(entry => entry.request !== qid))
}

/** The draft reopened: Status Open, no Completed line. */
function reopened(text: string, key: string): string {
  return writeFieldLine(writeFieldLine(text, key, 'status', 'Status: Open'), key, 'completed', null)
}

/**
 * Marks an issue request done and saves its submission (a stable id, the
 * signed-in login, the answered revision and the comment, fixed now) before
 * the undo window starts: what is not on disk is never sent. Resolves the
 * saved draft's text, or null.
 */
async function submitIssue($: $, key: string, date: string): Promise<string | null> {
  let self: string
  try {
    self = await signedIn($, login === null)
  } catch (error) {
    $.ui.toast(`Nothing was submitted on ${shortKey(key)}: could not tell who gh is signed in as (${String(error)}).`)
    return null
  }
  const now = await $.clock.now()
  const id = crypto.randomUUID()
  const { ask, saved } = await patchAsk($, key, held => {
    if (held === undefined || !isWaiting(held)) return undefined
    const text = complete(held.text, key, date)
    const done = issueRequest(held.issue, text)
    if (done === undefined) return undefined
    const submission: Submission = {
      id,
      target: key,
      login: self,
      revision: askRevision(held.issue),
      body: rulingsComment(done, held.issue.meta.url, { id, target: key }),
      session: SESSION,
      dueAt: now + HAND_BACK_MS,
      state: 'waiting',
      triedAt: null,
      commentUrl: null,
      label: 'pending',
      error: null,
    }
    return { ...held, text, submission }
  })
  if (ask === undefined || ask === null || ask.submission === null) return null
  if (!saved) {
    await patchAsk($, key, held => (held?.submission?.id === id ? { ...held, text: reopened(held.text, key), submission: null } : undefined))
    $.ui.toast(`Nothing will be posted on ${shortKey(key)}: the submit could not be saved to disk. Your rulings are kept; R submits again.`)
    return null
  }
  const qid = ISSUE_ID + key
  pending.get(qid)?.cancel()
  pending.set(
    qid,
    $.clock.after(HAND_BACK_MS, () => {
      pending.delete(qid)
      void send($, key, 'window').catch(error => $.ui.toast(`Could not post the rulings on ${shortKey(key)}: ${String(error)}`))
    }),
  )
  return ask.text
}

/** Q on an issue submit: takes it back while nothing can have been sent. */
async function takeBack($: $, key: string): Promise<boolean> {
  const qid = ISSUE_ID + key
  const ask = (await read($, asks))[key]
  const s = ask?.submission ?? null
  if (ask === undefined || s === null || ask.doneAt !== null) {
    $.ui.toast(`${shortKey(key)} is no longer waiting to post.`)
    return false
  }
  if (sending.has(key) || !(s.state === 'unsent' || (s.state === 'waiting' && (s.session === SESSION || phaseOf(key, ask, await $.clock.now()) === 'unsent')))) {
    $.ui.toast(`${shortKey(key)} is posting or may have posted, so it can no longer be taken back. R checks where it stands.`)
    return false
  }
  pending.get(qid)?.cancel()
  pending.delete(qid)
  const { ask: open, saved } = await patchAsk($, key, held =>
    held?.submission?.id === s.id && (held.submission.state === 'waiting' || held.submission.state === 'unsent')
      ? { ...held, submission: null, text: reopened(held.text, key) }
      : undefined,
  )
  if (open === undefined || open === null) {
    $.ui.toast(`${shortKey(key)} changed in another session, so it was not taken back.`)
    return false
  }
  const request = issueRequest(open.issue, open.text)
  await show($, qid, request === undefined ? 1 : firstUnruled(request))
  $.ui.toast(saved ? `Reopened ${shortKey(key)}; nothing was posted.` : `Reopened ${shortKey(key)} in this session; nothing was posted.`)
  return true
}

/** E on an issue submit: submits it again, as a new submission. */
async function resubmit($: $, key: string): Promise<boolean> {
  const done = await submitIssue($, key, await today($))
  if (done === null) return false
  await showNext($)
  return true
}

/** Drops an issue that went away before its rulings posted. */
async function dropAsk($: $, key: string, said: string): Promise<void> {
  await patchAsk($, key, held => (held === undefined || held.submission?.state === 'posted' ? undefined : null))
  await forget($, ISSUE_ID + key)
  $.ui.toast(said)
}

/** The ask changed after the rulings: nothing posts, and it reopens with only the unchanged items' rulings. */
async function reopenChanged($: $, key: string, live: HumanQueueIssue): Promise<void> {
  await patchAsk($, key, held =>
    held === undefined || held.submission === null || held.submission.state === 'posted'
      ? undefined
      : {
          ...held,
          issue: live,
          submission: null,
          doneAt: null,
          text: carryRulings({ text: reopened(held.text, key), instructions: held.issue.instructions, title: held.issue.title }, live),
        },
  )
  await forget($, ISSUE_ID + key)
  $.ui.toast(`${shortKey(key)} changed after you ruled, so nothing was posted. It is open again for review.`)
}

/** An issue moved (transferred): the old draft goes, and the issue comes back under its new key, unruled. */
async function transfer($: $, oldKey: string, viewed: Viewed): Promise<void> {
  const issue = readAsk(viewed, login)
  const oldQid = ISSUE_ID + oldKey
  await patchAsk($, oldKey, () => null)
  if (viewed.isOpen && viewed.isLabelled) {
    await patchAsk($, issue.key, held => (held === undefined ? { issue, text: issue.base, submission: null, doneAt: null, rev: 0 } : undefined))
  }
  pending.get(oldQid)?.cancel()
  pending.delete(oldQid)
  await forget($, oldQid)
  await update($, notify, ids => ids.map(one => (one === oldQid ? ISSUE_ID + issue.key : one)))
  $.ui.toast(`${shortKey(oldKey)} moved to ${shortKey(issue.key)}; its rulings were cleared, so it is open for review there.`)
}

/** Sends one submission: at the end of this session's window, or when the person presses R. */
async function send($: $, key: string, how: 'window' | 'r'): Promise<void> {
  if (sending.has(key)) return
  sending.add(key)
  try {
    await sendOnce($, key, how)
  } finally {
    sending.delete(key)
    }
}

/**
 * The one way an answer leaves: the signed-in login must be the one that
 * ruled; the issue's comments are checked for this submission first; the
 * issue is read again right before the POST (open, labelled, the same ask),
 * and the POST is made once. A POST that fails or goes unanswered may have
 * landed: R checks again later and posts only once nothing has shown up for
 * a while. The label comes off only while the issue still asks what was
 * answered. The asking agent hears right after, from this session only.
 */
async function sendOnce($: $, key: string, how: 'window' | 'r'): Promise<void> {
  const name = shortKey(key)
  const qid = ISSUE_ID + key
  const disk = await readStored($, key)
  if (!disk.ok) {
    $.ui.toast(`Could not read ${name}'s saved rulings (${disk.error}), so nothing was sent.`)
    return
  }
  const held = newest((await read($, asks))[key], disk.value)
  const s = held?.submission ?? null
  if (held === undefined || s === null || held.doneAt !== null) return
  if (how === 'window' && (s.session !== SESSION || s.state !== 'waiting')) return
  const target = parseTarget(s.target)
  if (target === null) return dropAsk($, key, `${s.target} is not an issue, so nothing was posted.`)
  const run = runner($)
  const unsent = async (why: string) => {
    await patchSubmission($, key, s.id, sub => ({ ...sub, state: sub.state === 'waiting' ? 'unsent' : sub.state, error: why }))
    $.ui.toast(`Nothing was sent on ${name}: ${why}. R sends it.`)
  }

  let self: string
  try {
    self = await signedIn($, true)
  } catch (error) {
    if (!(error instanceof GhError)) throw error
    return unsent(`could not tell who gh is signed in as (${error.message})`)
  }
  if (!sameLogin(self, s.login)) return unsent(`gh is signed in as ${self}, but these rulings were made as ${s.login}; sign back in as ${s.login}, or take them back`)
  if (!isOwned(target.repo, self)) return dropAsk($, key, `${s.target} is not one of ${self}'s issues, so nothing was posted.`)

  let commentUrl = s.commentUrl
  if (s.state !== 'posted') {
    let found: string | null
    try {
      found = findAnswer(await listComments(run, target.repo, target.number), s, s.login)
    } catch (error) {
      if (!(error instanceof GhError)) throw error
      return unsent(`could not read its comments (${error.message})`)
    }
    if (found === null) {
      const now = await $.clock.now()
      if ((s.state === 'ambiguous' || s.state === 'sending') && now - (s.triedAt ?? 0) < SETTLE_MS) {
        $.ui.toast(`${name} may have posted, but no comment is visible yet. Press R again in a few minutes; it never posts twice.`)
        return
      }
      let viewed: Viewed
      try {
        viewed = await viewAsk(run, target.repo, target.number, self)
      } catch (error) {
        if (!(error instanceof GhError)) throw error
        return unsent(`could not read the issue (${error.message})`)
      }
      if (issueKey(viewed.repo, viewed.number) !== key) return transfer($, key, viewed)
      if (!viewed.isOpen || !viewed.isLabelled) return dropAsk($, key, `${name} was closed or unlabelled before the rulings posted, so nothing was posted.`)
      if (askRevision(readAsk(viewed, self)) !== s.revision) return reopenChanged($, key, readAsk(viewed, self))
      const marked = await patchSubmission($, key, s.id, sub => (sub.state === s.state ? { ...sub, state: 'sending', triedAt: now, error: null } : undefined))
      if (marked.submission?.state !== 'sending' || !marked.saved) {
        $.ui.toast(`Nothing was sent on ${name}: its submit could not be recorded as sending. Look again before pressing R.`)
        return
      }
      try {
        found = (await postComment(run, target.repo, target.number, s.body)) ?? viewed.url
      } catch (error) {
        if (!(error instanceof GhError)) throw error
        await patchSubmission($, key, s.id, sub => ({ ...sub, state: 'ambiguous', error: error.message }))
        $.ui.toast(`${name} may have posted: ${error.message}. R checks and sends; it never posts twice.`)
        return
      }
    }
    commentUrl = found
    await patchSubmission($, key, s.id, sub => ({ ...sub, state: 'posted', commentUrl: found, error: null }))
  }

  // The label comes off only while the issue still asks what was answered.
  let labelState: 'pending' | 'removed' | 'kept' = 'pending'
  let why: string | null = null
  try {
    const viewed = await viewAsk(run, target.repo, target.number, self)
    if (!viewed.isLabelled) labelState = 'removed'
    else if (askRevision(readAsk(viewed, self)) !== s.revision) {
      labelState = 'kept'
      why = 'the ask changed after these rulings, so the label stays for the new round'
    } else {
      await removeLabel(run, target.repo, target.number)
      labelState = 'removed'
    }
  } catch (error) {
    if (!(error instanceof GhError)) throw error
    why = `${error.message}; R in the pane retries it`
  }
  const doneAt = labelState === 'pending' ? null : await $.clock.now()
  await patchAsk($, key, a =>
    a?.submission?.id === s.id ? { ...a, submission: { ...a.submission, label: labelState, error: labelState === 'pending' ? why : null }, doneAt } : undefined,
  )
  $.ui.toast(
    labelState === 'removed'
      ? `Posted the rulings on ${name}.`
      : labelState === 'kept'
        ? `Posted the rulings on ${name}; ${ASKS_LABEL} stays on because the ask changed.`
        : `Posted the rulings on ${name}, but ${ASKS_LABEL} is still on: ${why}`,
  )
  if (doneAt !== null) await forget($, qid)

  // This session's agent asked: it hears now, once. No one else owes it anything.
  if ((await read($, notify)).includes(qid)) {
    await update($, notify, ids => ids.filter(one => one !== qid))
    const request = issueRequest(held.issue, held.text)
    if (request !== undefined) {
      const delivery = { id: s.id, target: s.target, comment: commentUrl, labelRemoved: labelState === 'removed' }
      const dropped = await handOver($, name, submissionText(request, held.issue.meta.url, delivery, why))
      if (dropped !== null) $.ui.toast(`The agent did not get the rulings on ${name} (${dropped}); it can read them in the comment.`)
    }
  }
}

async function submit($: $): Promise<void> {
  const { request, index } = await current($)
  if (request === undefined) return
  if (request.issue !== undefined && WAITS_FOR_R.has(await phaseOfRequest($, request))) {
    await send($, request.id, 'r')
    return
  }
  if (!canSubmit(request, index)) {
    const left = counts(request).unruled
    await show($, qidOf(request), firstUnruled(request))
    $.ui.toast(`${left} left to rule. Submit all lights up on the last item.`)
    return
  }
  const date = await today($)
  const qid = qidOf(request)
  if (request.issue !== undefined) {
    const done = await submitIssue($, request.id, date)
    if (done === null) return
    await update($, undoStack, list => [
      ...list.filter(entry => entry.request !== qid).slice(-49),
      {
        kind: 'submit' as const,
        request: qid,
        before: { status: 'Status: Open', completed: null },
        after: { status: fieldLineOf(done, request.id, 'status'), completed: fieldLineOf(done, request.id, 'completed') },
      },
    ])
    await update($, redoStack, () => [])
    await update($, capture, () => null)
    $.ui.toast(`Submitted ${shortKey(request.id)}. Q takes it back before it posts.`)
    await showNext($)
    return
  }
  let before = { status: null as string | null, completed: null as string | null }
  let after = { status: null as string | null, completed: null as string | null }
  const ok = await mutate($, qid, (body, id) => {
    before = { status: fieldLineOf(body, id, 'status'), completed: fieldLineOf(body, id, 'completed') }
    const next = complete(body, id, date)
    after = { status: fieldLineOf(next, id, 'status'), completed: fieldLineOf(next, id, 'completed') }
    return next
  })
  if (!ok) return

  await update($, undoStack, list => [...list.filter(entry => entry.request !== qid).slice(-49), { kind: 'submit' as const, request: qid, before, after }])
  await update($, redoStack, () => [])
  await update($, capture, () => null)
  await handBack($, qid)
  $.ui.toast(`Submitted ${request.id} ${request.title}. Q takes it back.`)
  await showNext($)
}

/** Takes back a submit that waits for R and was never sent, from the button on its page. */
async function takeBackUnsent($: $, key: string): Promise<void> {
  if (await takeBack($, key)) await forget($, ISSUE_ID + key)
}

/** The person's local date: the host's clock and zone where a shell answers, else UTC. */
async function today($: $): Promise<string> {
  const ran = await $.process.run(['date', '+%F'], { timeoutMs: 2000 }).catch(() => undefined)
  const date = ran?.exitCode === 0 ? ran.stdout.trim() : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDate(await $.clock.now())
}

async function comment($: $, surface: RenderSurface): Promise<void> {
  const { request, item, index } = await current($)
  if (request === undefined) return
  if (surface !== 'mobile') {
    await $.ui.focus({ requestId: PANE, key: 'comment' }).catch(() => undefined)
    return
  }
  const where = item === undefined ? `request ${request.id}` : `item ${item.heading}`
  await update($, capture, () => ({ request: qidOf(request), item: index, heading: item?.heading ?? null }))
  $.ui.toast(`Say or type your comment in the message box. It attaches to ${where} and never reaches the agent.`)
}

type Action = 'yes' | 'no' | 'prev' | 'next' | 'comment' | 'undo' | 'redo' | 'submit'

/** The game keymap, shared by the pane's hotkeys and the desktop card. */
const KEYS: Record<string, Action> = { w: 'yes', s: 'no', a: 'prev', d: 'next', q: 'undo', e: 'redo', r: 'submit' }

async function act($: $, action: Action, surface: RenderSurface, from: 'button' | 'card' = 'button'): Promise<void> {
  // A key on the focused card may also press the pane Button bound to it: act once.
  const now = await $.clock.now()
  if (action === lastAct.key && from !== lastAct.from && now - lastAct.at < REPEAT_GAP_MS) return
  lastAct = { key: action, at: now, from }
  switch (action) {
    case 'yes':
      return rule($, 'yes')
    case 'no':
      return rule($, 'no')
    case 'prev':
      return step($, -1)
    case 'next':
      return step($, 1)
    case 'comment':
      return comment($, surface)
    case 'undo':
      return undo($)
    case 'redo':
      return redo($)
    case 'submit':
      return submit($)
  }
}

// --- The native card (issue #45's prototype) -------------------------------------

/** R on the native card, its comment saved: moves to the next item, or submits on the last. */
async function saveAndMove($: $): Promise<void> {
  const { request, index } = await current($)
  if (request === undefined) return
  if (request.items.length === 0 || index >= request.items.length) return submit($)
  await show($, qidOf(request), index + 1)
}

/** Where an item's unsaved comment is held: the comment field's target. */
function draftKey(target: Target): string {
  return `${target.request}#${target.item}:${target.heading ?? ''}`
}

/** Saves the current item's unsaved comment when it says something new; false when the save failed. */
async function flushDraft($: $): Promise<boolean> {
  const { request, item, index } = await current($)
  if (request === undefined) return true
  const target: Target = { request: qidOf(request), item: index, heading: item?.heading ?? null }
  const key = draftKey(target)
  const draft = drafts.get(key)
  if (draft === undefined) return true
  const stored = (item === undefined ? request.note : item.comment) ?? ''
  if (draft.trim() !== stored.trim()) {
    try {
      if (!(await saveComment($, target, draft))) return false
    } catch (error) {
      if (!(error instanceof QueueError)) throw error
      $.ui.toast(error.message)
      return false
    }
  }
  drafts.delete(key)
  return true
}

/**
 * A press on the native card, from a Button or from a key the card's body heard
 * after a click: one key can reach both, so it acts once. A verdict, R, and a
 * step take the unsaved comment with them.
 */
async function pressNative($: $, action: Action, surface: RenderSurface, from: 'button' | 'card'): Promise<void> {
  const now = await $.clock.now()
  if (action === lastAct.key && from !== lastAct.from && now - lastAct.at < REPEAT_GAP_MS) return
  lastAct = { key: action, at: now, from }
  if (action === 'undo' || action === 'redo' || action === 'comment') return act($, action, surface, from)
  if (!(await flushDraft($))) return
  if (action === 'yes' || action === 'no') return rule($, action)
  if (action === 'prev' || action === 'next') return step($, action === 'prev' ? -1 : 1)
  return saveAndMove($)
}

/** The issue an agent names, from the list or read directly while search catches up; a string says why not. */
async function askFor($: $, wanted: string): Promise<Request | string | undefined> {
  // A file request's number is no issue reference: it reads nothing, so it needs no owner.
  if (parseIssueRef(wanted, '') === null) return undefined
  let owner: string
  try {
    owner = await signedIn($, false)
  } catch (error) {
    if (!(error instanceof GhError)) throw error
    return `Could not read ${wanted}: ${error.message}`
  }
  const ref = parseIssueRef(wanted, owner)
  if (ref === null) return undefined
  const key = issueKey(ref.repo, ref.number)
  if (!isOwned(ref.repo, owner)) return `${key} is outside ${owner}'s repositories; the human queue reads and answers only those.`
  const held = await read($, asks)
  const match = Object.keys(held).find(one => one.toLowerCase() === key.toLowerCase())
  const known = match === undefined ? undefined : held[match]
  const now = await $.clock.now()
  if (known !== undefined && match !== undefined) {
    const phase = phaseOf(match, known, now)
    if (isWaiting(known) || WAITS_FOR_R.has(phase)) return issueRequest(known.issue, known.text)
    if (phase !== null && !(phase === 'done' && now - (known.doneAt ?? 0) >= HIDE_MS)) return `${key} was just answered in the pane.`
  }
  let viewed: Viewed
  try {
    viewed = await viewAsk(runner($), ref.repo, ref.number, owner)
  } catch (error) {
    if (!(error instanceof GhError)) throw error
    return `Could not read ${key} with gh: ${error.message}`
  }
  if (!viewed.isOpen || !viewed.isLabelled) return `${key} is not an open issue labelled ${ASKS_LABEL}. Label it first (see the vantage-point:ask skill).`
  const issue = readAsk(viewed, login)
  const { ask } = await patchAsk($, issue.key, held => refreshed(held, issue, now))
  const kept = ask ?? (await read($, asks))[issue.key]
  return kept === undefined || kept === null ? undefined : issueRequest(kept.issue, kept.text)
}

/** What /vantage-point prints: how many wait, and which. */
async function summary($: $, open: Request[], problem: string | null): Promise<string> {
  const lines = [open.length === 0 ? 'Human queue opened: nothing waiting.' : `Human queue opened: ${open.length} open.`]
  for (const request of open.slice(0, PAGE_SIZE)) {
    const phase = await phaseOfRequest($, request)
    const size =
      phase === 'unsent'
        ? 'unsent ruling: R sends it'
        : phase === 'maybe'
          ? 'may have posted: R checks and sends'
          : phase === 'label'
            ? 'posted, label still on: R retries it'
            : request.items.length === 0
              ? 'plain ask'
              : `${request.items.length} items`
    lines.push(`· ${label(request)} (${size})`)
  }
  if (open.length > PAGE_SIZE) lines.push(`· and ${open.length - PAGE_SIZE} more (0 turns the page in the pane)`)
  if (!hasScanned) lines.push(`Reading issues labelled ${ASKS_LABEL} in the background; the pane shows them as they arrive.`)
  if (problem !== null) lines.push(`Issues labelled ${ASKS_LABEL} could not all be read: ${problem}`)
  return lines.join('\n')
}

/** Rereads the signed-in login and the issues in the background: what each pane open does. */
function openedPane($: $): void {
  void (async () => {
    await signedIn($, true).catch(() => undefined)
    await refreshIssues($)
  })().catch(() => undefined)
}

/** A new turn makes any fill still running stale. */
let deckEpoch = 0
/**
 * The question the agent asked this turn, which armed the row: the turn's deck is filled for it,
 * never for the reply's own guess at a decision. Null when it asked none.
 */
let askedThisTurn: WrapUpAsk | null = null

/** A permission ask armed the row this turn: the row is Allow or Deny, and no deck is filled over it. */
let permissionThisTurn = false
/** Tool calls the person allowed on the reply row, each to run once when the agent repeats it. */
const allowedOnce = new Set<string>()

const WAIT_ON_ROW =
  'This call needs the person\'s approval, which they give on Vantage Point\'s reply row: it shows Allow once and Deny for this call. ' +
  'End your turn now with one plain sentence saying what you want to run and why. If they allow it, their next message says so: ' +
  'repeat the same call exactly and it runs once. If they deny it, do not run it.'

/** This session's permission mode, read off its transcript; null when the transcript cannot be read. */
async function sessionMode($: $): Promise<string | null> {
  const id = await $.session.id()
  const scanned = (await read($, caches)).caches.find(c => c.kind === 'session' && c.file.endsWith(`/${id}.jsonl`))?.file
  const home = (await $.env.get('HOME')) ?? ''
  const path = scanned ?? (home === '' ? null : `${home}/.claude/projects/${projectFolder(await $.session.root())}/${id}.jsonl`)
  if (path === null) return null
  const text = await $.fs.read(path).catch(() => null)
  return typeof text === 'string' ? modeOf(text) : null
}

/** Whether a phone is attached to this session through Remote Control; false where the engine cannot say. */
async function onPhone($: $): Promise<boolean> {
  try {
    return (await $.session.surfaces()).includes('mobile')
  } catch {
    return false
  }
}

/** The question a decision on the row asks, as the deck's fill reads it. */
const askOf = (asked: HumanQueueDecision): WrapUpAsk => ({ ask: asked.ask, actions: asked.options, sends: asked.sends ?? asked.options })
/** The session cards the running turn's `start_session` calls proposed (#67). */
let turnCards: string[] = []
/** Where each deck fill stopped, newest last: a fill that shows nothing says why here, not nowhere (#109). */
const DECK_FILLS_KEY = 'deckFills'

async function fillStopped($: $, stage: string, detail = ''): Promise<void> {
  const held = await $.store.get(DECK_FILLS_KEY).catch(() => null)
  const kept = Array.isArray(held) ? held.slice(-29) : []
  await $.store.set(DECK_FILLS_KEY, [...kept, { at: await $.clock.now(), stage, detail: detail.slice(0, 300) }]).catch(() => undefined)
}

/** The store key of each deck's picks, newest last, and how many it keeps (#109). */
const DECK_PICKS_KEY = 'deckPicks'
const DECK_PICKS_LOG = 200

/** Memory files the agent read this turn. */
const memoryReads = new Set<string>()

/** The auto-memory files the context carries now. */
async function memoriesInContext($: $): Promise<string[]> {
  const usage = await $.session.usage({ breakdown: 'summary' }).catch(() => null)
  const files = usage?.context?.breakdown?.memoryFiles ?? []
  return files.filter(file => file.type === 'AutoMem').map(file => file.path)
}

/** One Haiku call; null when it does not answer. */
async function haiku($: $, system: string, prompt: string, maxTokens: number): Promise<string | null> {
  const r = await $.model.complete({ model: GATE_MODEL, system, prompt, maxTokens, timeoutMs: 30_000 })
  return r.isAnswered ? r.text : null
}

/** Regex passed: gate, fork, fit, check, then show. Anything that fails shows nothing. */
/** How often a decision that recommends a session card looks for the card's session (#67). */
const CARD_POLL_MS = 3000

/**
 * Clears a decision once a session card proposed in its turn has been started: the desktop
 * writes the new session's record, whose `spawnedFrom.taskId` names the card, and raises
 * nothing a mod can hear (#67). Reads only records written since the decision.
 */
async function watchCards($: $): Promise<void> {
  const held = await read($, decisionCards)
  if (held.tasks.length === 0) return
  const home = (await $.env.get('HOME')) ?? ''
  if (home === '') return
  const root = `${home}/Library/Application Support/Claude/claude-code-sessions`
  const dirs = async (path: string) => (await $.fs.list(path).catch(() => [])).filter(f => f.kind === 'dir').map(f => `${path}/${f.name}`)
  for (const account of await dirs(root)) {
    for (const org of await dirs(account)) {
      for (const f of await $.fs.list(org).catch(() => [])) {
        if (f.kind !== 'file' || !f.name.startsWith('local_') || !f.name.endsWith('.json') || f.mtimeMs < held.since) continue
        const body = await $.fs.read(`${org}/${f.name}`).catch(() => '')
        const card = typeof body === 'string' ? startedCard(body) : null
        if (card !== null && held.tasks.includes(card)) {
          await clearDecision($)
          return
        }
      }
    }
  }
}

async function fillDeck($: $, answer: string, wrap: WrapUpAsk | null, epoch: number, cards: readonly string[] = [], asked = false): Promise<void> {
  // A question the agent asked is a decision already; the gate only guesses at a reply's.
  if (!asked) {
    const gate = await haiku($, GATE_SYSTEM, gateText(answer, wrap), 5)
    if (gate === null || !isYes(gate) || epoch !== deckEpoch) return fillStopped($, 'gate', gate ?? 'no answer')
  }
  const fork = await $.model.fork({ prompt: forkPrompt(wrap) })
  if (!fork.isAnswered || epoch !== deckEpoch) return fillStopped($, 'fork', fork.isAnswered ? 'superseded' : String((fork as { reason?: unknown }).reason ?? 'unanswered'))
  const raw = parseForkJson(fork.text)
  if (raw === null) return fillStopped($, 'json', fork.text.slice(-300))
  const fitted = await fitFields(raw, (text, words) =>
    haiku($, `Say this in ${words} words or fewer, keeping any [n] citations. Reply with the shorter text only.`, text, 120))
  const parsed = decisionFromFork(fitted)
  if (parsed === null) return fillStopped($, 'parse', JSON.stringify(fitted).slice(0, 300))
  // The row's buttons are the agent's own options: a deck that names others would answer a different question.
  const key = (option: string) => option.trim().toLowerCase()
  if (asked && wrap !== null && [...parsed.options].map(key).sort().join('\n') !== [...wrap.actions].map(key).sort().join('\n')) return
  const cwd = (await $.session.cwd()).replace(/\/$/, '')
  const absolute = (path: string) => (path.startsWith('/') ? path : `${cwd}/${path}`)
  const read = async (path: string) => {
    const text = await $.fs.read(path)
    if (typeof text !== 'string') throw new Error('not text')
    return text
  }
  const memories = new Set([...(await memoriesInContext($)), ...memoryReads])
  // A source is a file one of the session's tool calls named, and lines read from it now (#108).
  const uses = (await $.session.messages().catch(() => [])).flatMap(message => (message.role === 'assistant' ? message.toolUses : []))
  const calls = uses.map(use => use.input)
  const quoted = await checkLines({ ...parsed, sources: parsed.sources?.map(source => ({ ...source, path: absolute(source.path) })) }, read, path => wasRead(calls, path, path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : ''), memories)
  const touched = await checkTouches({ ...quoted, touches: quoted.touches?.map(paths => paths.map(touch => ({ ...touch, path: absolute(touch.path) }))) }, read)
  const supported = touched
  if (epoch !== deckEpoch) return
  // Paths in the session folder show relative to it.
  const relative = (path: string) => (path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path)
  const shown = {
    ...supported,
    sources: supported.sources?.map(source => ({ ...source, path: relative(source.path) })),
    touches: supported.touches?.map(paths => paths.map(touch => ({ ...touch, path: relative(touch.path) }))),
  }
  // Each argument's fact, checked against the output of the call it came from (#110).
  const argued = await checkArguments(argumentsOf(raw.arguments), uses.map(use => ({ tool: use.tool, input: use.input, text: typeof use.text === 'string' ? use.text : '' })),
    path => read(absolute(path.replace(/^~(?=\/)/, ''))).catch(() => null))
  if (argued.length > 0) Object.assign(shown, { arguments: argued })
  if (shown.sources === undefined) delete shown.sources
  if (shown.touches === undefined) delete shown.touches
  const sends = optionSends(shown.options, wrap)
  await update($, decision, () => ({ ...shown, sends }))
  // Each deck's picks, kept so `scripts/deck-picks.mts` can say how many techniques the decks draw on (#109).
  const logged = await $.store.get(DECK_PICKS_KEY).catch(() => null)
  const kept = Array.isArray(logged) ? logged.slice(-(DECK_PICKS_LOG - 1)) : []
  void $.store.set(DECK_PICKS_KEY, [...kept, { at: await $.clock.now(), picks: shown.picks ?? [] }]).catch(() => undefined)
  // The fork's own picks beside the ones kept, and why a kept pick cannot draw, so a pick that fails shows in the log.
  const refused = eligible(deckPageFacts(shown) ?? {}, 'desktop').refused.filter(one => shown.picks?.includes(one.view)).map(one => `${one.view}: ${one.reason}`)
  const backed = argued.filter(one => one.fact !== undefined).map(one => one.fact!.shape)
  void fillStopped($, 'shown', `${(shown.picks ?? []).join(', ')} | fork: ${JSON.stringify(raw.picks ?? null).slice(0, 200)}${refused.length === 0 ? '' : ` | refused: ${refused.join('; ').slice(0, 300)}`} | arguments: ${argued.length}, facts: ${backed.join(', ') || 'none'}`)
  // The deck's pictures are planned in the background, as a queue item's are, and drawn once the plan lands (#100).
  const composed = composeDecision({ ...shown, facts: deckPageFacts(shown) })
  if (composed !== null) void planItems($, [composed]).catch(() => undefined)
  const since = await $.clock.now()
  await update($, decisionCards, () => ({ tasks: [...cards], since }))
  await update($, deckPage, () => ({ page: 0, source: null }))
  await update($, deckQuote, () => null)
  // The recommended option waits in the empty prompt box as a dim suggestion, Tab to take.
  const recommended = sends[shown.recommend]
  if (recommended !== undefined) void $.prompt.suggest({ text: recommended }).catch(() => undefined)
}

// The subagents row (issue #22): one fact about one subagent, from any hook.
const subagentFact = ($: EngineInterface, id: string, now: number, change: (m: SubagentMeta) => SubagentMeta) =>
  update($, subagentMeta, all => ({ ...all, [id]: change(all[id] ?? freshMeta(now)) }))

// The engine's list once a second, kept after it drops a subagent.
const watchSubagents = ($: EngineInterface) =>
  $.clock.every(1000, async () => {
    const listed = await $.agent.list().catch(() => null)
    if (listed === null) return
    const now = await $.clock.now()
    const before = await read($, subagents)
    if (before.length === 0 && listed.length === 0) return
    const { rows, dropped } = mergeListed(before, listed)
    for (const id of [...dropped, ...listed.filter(a => !isLive(a as Subagent)).map(a => a.id)]) {
      await subagentFact($, id, now, m => (m.endedAt === undefined ? { ...m, endedAt: now, tool: undefined, toolAt: undefined } : m))
    }
    if (JSON.stringify(before) !== JSON.stringify(rows)) await update($, subagents, () => rows)
    if (rows.some(isLive)) await update($, subagentNow, () => now)
  })

/**
 * The transcript's rows, which draw nothing while a read holds the band (issue
 * #36): the nearest a mod gets to Interlace's black screen, since the desktop's
 * sidebar, title bar and prompt box are not its to draw (#32). Reading always
 * hides them and exit brings them back, with no button (the owner's ruling).
 */
const TRANSCRIPT_ROWS = ['UserMessage', 'AssistantMessage', 'ToolUse', 'ToolResult', 'ToolGroup', 'ToolProgress', 'CommandOutput', 'InfoNotice', 'TurnDuration'] as const
/** Where the person's reading speed is kept across sessions, as Interlace keeps its own. */
const READ_SPEED_KEY = 'readerWpm'
/** Where the last reads' words are kept, newest last, for scripts/reader-log.mts. */
const READ_LOG_KEY = 'readerLog'
const READ_LOG_KEPT = 5

/** The Reader's engine calls (hooks/reader.ts). */
function readerIO($: $): ReaderIO {
  return {
    messages: () => $.session.messages(),
    toast: text => $.ui.toast(text),
    now: () => $.clock.now(),
    after: (ms, fn) => $.clock.after(ms, fn),
    storedWpm: () => $.store.get(READ_SPEED_KEY),
    storeWpm: wpm => $.store.set(READ_SPEED_KEY, wpm),
    logRead: async entry => {
      const kept = await $.store.get(READ_LOG_KEY)
      const reads = Array.isArray(kept) ? kept : []
      await $.store.set(READ_LOG_KEY, [...reads, entry].slice(-READ_LOG_KEPT))
    },
    read: () => read($, reading),
    update: change => update($, reading, change),
  }
}

/** Every AskUserQuestion call the hook saw, newest last, for finding a dialog that slipped through. */
const ASK_LOG_KEY = 'askLog'
const ASK_LOG_KEPT = 50

/** Where a question went: refused onto the row, left to the dialog, or refused by the catch. */
type AskOutcome = 'row' | 'dialog' | 'failed'

async function logAsk($: $, outcome: AskOutcome, why?: string): Promise<void> {
  try {
    const entry = { at: await $.clock.now(), session: await $.session.id().catch(() => null), outcome, ...(why === undefined ? {} : { why }) }
    const kept = await $.store.get(ASK_LOG_KEY)
    await $.store.set(ASK_LOG_KEY, [...(Array.isArray(kept) ? kept : []), entry].slice(-ASK_LOG_KEPT))
  } catch {
    // The log is telemetry: a failed write never changes where the question goes.
  }
}

const ON_ROW =
  'That question is in Vantage Point\'s reply row now, with its options and the recommended one first. Do not ask it again in a dialog. End your turn with the question in one plain sentence; the person\'s choice comes back as their next message. If you call a wrap-up tool, give it a recap only, with no question or buttons: the desktop hides the reply row while that box shows.'
const IN_PROSE =
  'The question dialog is unavailable for this question. End your turn with the question and its options in plain sentences; the person\'s choice comes back as their next message.'

/**
 * The sessions that leave the task list to the app, by `$.session.id()`: the band draws it in every
 * other (the owner, 2026-10-24, issue 104). `/vantage-point steps` or the show tool turns one off or back on.
 */
const STEPS_OFF_KEY = 'stepsOffSessions'
/**
 * Whether update_plan calls are renamed (`renamesHere`): plan mode lets no hook allow a call that is
 * not a read, so there the app keeps its own list. Read at a turn's start, a load and a toggle, not each step.
 */
let renamesPlans = false
/** The band's size as it last drew, for the show tool's reply to an agent staging a shot. */
let bandSeen = { maxRows: 0, columns: 0 }

/**
 * The sessions whose deck draws each argument over the tool output it rests on (#110), by `$.session.id()`: a gate,
 * so the owner sees it in one session's shot before it lands for every one.
 */
const DECK_FACTS_KEY = 'deckFactsSessions'

async function deckFactsSessions($: $): Promise<string[]> {
  const held = await $.store.get(DECK_FACTS_KEY)
  return Array.isArray(held) ? held.filter((id): id is string => typeof id === 'string') : []
}

/** Turns the deck's arguments on for this session, or back off, and says which. */
async function toggleDeckFacts($: $): Promise<string> {
  const id = await $.session.id()
  const gated = await deckFactsSessions($)
  const isOn = gated.includes(id)
  await $.store.set(DECK_FACTS_KEY, isOn ? gated.filter(other => other !== id) : [...gated, id])
  return isOn ? 'This session\'s deck draws its pictures again.' : 'This session\'s deck draws each argument over the tool output it rests on.'
}

async function stepsOffSessions($: $): Promise<string[]> {
  const held = await $.store.get(STEPS_OFF_KEY)
  return Array.isArray(held) ? held.filter((id): id is string => typeof id === 'string') : []
}

/** Turns the band's task list off for this session, or back on, and says which. */
async function toggleSteps($: $): Promise<string> {
  const id = await $.session.id()
  const off = await stepsOffSessions($)
  const isOn = off.includes(id)
  await $.store.set(STEPS_OFF_KEY, isOn ? off.filter(other => other !== id) : [...off, id])
  await update($, stepsHere, () => isOn)
  renamesPlans = await renamesHere($)
  if (!isOn) return 'The app draws this session\'s task list again.'
  await replaySteps($)
  const kept = await read($, steps)
  return (
    `The band draws this session's task list again${kept.length === 0 ? '' : ` (${doneOf(kept)} done)`}, from its next update_plan call on; ` +
    `the app draws none. The band last drew ${bandSeen.maxRows} rows by ${bandSeen.columns} columns.`
  )
}

/** Whether update_plan calls are renamed now: where the band draws the steps, outside plan mode. */
async function renamesHere($: $): Promise<boolean> {
  return (await read($, stepsHere)) && (await sessionMode($).catch(() => null)) !== 'plan'
}

/** The task list the conversation's calls leave: a restarted session gets it back from its transcript. */
async function replaySteps($: $): Promise<void> {
  const messages = await $.session.messages().catch(() => [])
  const calls = messages.flatMap(message => (message.role === 'assistant' ? message.toolUses : []))
  await update($, steps, () => stepsOfCalls(calls))
}

/**
 * The model's stream with every wrap-up call's question and buttons cut before the app sees
 * them, since the app draws its next-step box from the call as streamed and hides the band
 * under it. The call's arguments are held until they parse whole, then go on as one piece,
 * and the question arms the reply row instead. Anything else streams as it came.
 */
async function* withoutWrapUpBox(
  stream: AsyncGenerator<TurnStepChunk, TurnStepResult>,
  arm: (asked: HumanQueueDecision) => Promise<void>,
): AsyncGenerator<TurnStepChunk, TurnStepResult> {
  const wrapUps = new Set<number>()
  const held = new Map<number, TurnStepChunk[]>()
  const pieces = (index: number) => (held.get(index) ?? []).map(chunk => (chunk.kind === 'input' ? chunk.json : '')).join('')
  while (true) {
    const step = await stream.next()
    if (step.done) {
      // Arguments that never parsed go on as the model wrote them.
      for (const chunks of held.values()) yield* chunks
      return step.value
    }
    const chunk = step.value
    if (chunk.kind === 'tool' && chunk.name === WRAP_UP_TOOL) wrapUps.add(chunk.index)
    if (chunk.kind !== 'input' || !wrapUps.has(chunk.index)) {
      yield chunk
      continue
    }
    held.set(chunk.index, [...(held.get(chunk.index) ?? []), chunk])
    const read = boxlessWrapUp(pieces(chunk.index))
    if (read === 'partial') continue
    const chunks = held.get(chunk.index)!
    held.delete(chunk.index)
    wrapUps.delete(chunk.index)
    if (read.decision !== null) await arm(read.decision).catch(() => undefined)
    if (read.json === null) yield* chunks
    else yield { kind: 'input', index: chunk.index, json: read.json }
  }
}

export const register: Register = (on, _options) => {
  on('session.start', async ($, e, next) => {
    seen = { mtime: -1, size: -1 }
    // The decision is not cleared here: a plugin reload starts the session again,
    // and the reply it belongs to is still the last one. A new turn or /clear clears it.
    await update($, seenWaiting, () => null)
    await update($, unseenSince, () => null)
    await update($, agentBranch, () => ({ state: 'unknown' as const, key: null, branch: null }))
    await update($, agent, () => null)
    await update($, here, () => null)
    // The subagents row starts closed, a reload included: the outline opens only on a press.
    await update($, subagentsOpen, () => false)
    await update($, subagentPick, () => null)
    watchSubagents($)
    $.clock.every(CARD_POLL_MS, () => void watchCards($).catch(() => undefined))
    await $.tool.register({
      name: 'review',
      description:
        'Open the human-queue pane so the person can rule on a request: one you wrote to human-queue.md, ' +
        `or an issue you filed with the ${ASKS_LABEL} label in one of the signed-in gh account's repositories (see the vantage-point:ask skill for both). ` +
        'Returns at once; when the person submits, their rulings arrive as a new message with a JSON payload. They stay in ' +
        'human-queue.md, or post as one comment on the issue, which then loses the label.',
      inputSchema: {
        type: 'object',
        properties: {
          request: {
            type: 'string',
            description:
              'The request\'s number as written in its ## heading (e.g. "0003"), or the issue as owner/repo#n ' +
              '(e.g. "your-login/your-repo#221"). Omit to open the oldest open request.',
          },
        },
      },
    })
    await $.tool.register({
      name: 'task',
      description:
        'Tell the person what you are working on now. It shows in the band above their prompt, beside what waits on ' +
        'them, unless the session is on a ticket or spec branch, which names the work itself. Call it when you start a ' +
        'task and whenever your task changes; call it with an empty task when you finish and hand back to the person.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'What you are doing now, in under ten words ("Redesigning the human-queue band").' },
          detail: { type: 'string', description: 'One or two sentences the person sees when they open the card: the goal and where it stands.' },
        },
        required: ['task'],
      },
    })
    // The tool each update_plan call is renamed to in the stream (issue 104): the same input, the app's reply.
    await $.tool.register({
      name: 'steps',
      description:
        'The task list the band above the prompt draws in place of the app\'s own. This session\'s ' +
        `${UPDATE_PLAN_TOOL} calls are routed here; keep calling that tool as usual. It takes the same input ` +
        'and returns its reply.',
      inputSchema: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'object' }, description: 'The whole plan, as update_plan takes it.' },
          scope: { type: 'string', enum: ['first_task', 'continuation', 'new_task'] },
          advance: { type: 'boolean' },
          done: { type: 'array', items: { type: 'number' } },
          start: { type: 'number' },
        },
      },
    })
    await $.tool.register({
      name: 'show',
      description:
        'Open one of Vantage Point\'s reference panes beside the conversation: "palette", what the desktop can draw, ' +
        'one page per element, or "album", every way to draw an ask, tried on a real one. Use it to stage a pane for ' +
        'a screenshot, or to show the person a technique; it changes nothing else. "steps" instead turns the band\'s ' +
        'task list off for this session, leaving it to the app, or back on. "deck-facts" turns on, or off, the decision ' +
        'deck that draws each argument over the tool output it rests on, for this session only. "tour" opens the tour: ' +
        'the setup this plugin needs and every feature, each with a button that runs it here.',
      inputSchema: {
        type: 'object',
        properties: {
          pane: { type: 'string', enum: ['palette', 'album', 'grading', 'steps', 'deck-facts', 'tour'], description: 'Which pane to open, "steps" to turn the band\'s task list off or back on, or "deck-facts" to turn the deck\'s arguments on or off for this session.' },
          page: { type: 'string', description: 'The page to open at, by its key (e.g. "svg", "threshold"); omit for where it was left.' },
        },
        required: ['pane'],
      },
    })
    // Off the start's path, so the tools above are declared however long the transcript takes to read.
    // A store or session id that cannot be read leaves the app's own list.
    void (async () => {
      const isStepsHere = await stepsOffSessions($).then(async off => !off.includes(await $.session.id())).catch(() => false)
      await update($, stepsHere, () => isStepsHere)
      renamesPlans = await renamesHere($)
      if (isStepsHere) await replaySteps($)
    })().catch(() => undefined)
    // A refused command must not take the review tool and the polling down with it.
    await $.command
      .register({
        name: 'vantage-point',
        description: `Open the human queue: rule on what agents left in human-queue.md and in issues labelled ${ASKS_LABEL}`,
      })
      .catch(error => $.ui.toast(`vantage-point: /vantage-point could not be registered: ${String(error)}`))
    // A fresh install says once, on this machine, where to start.
    void (async () => {
      if ((await $.store.get(TOURED_KEY)) === true) return
      await $.store.set(TOURED_KEY, true)
      $.ui.toast(FIRST_RUN)
    })().catch(() => undefined)
    await refresh($).catch(() => undefined)
    $.clock.every(POLL_MS, () => refresh($).catch(() => undefined))
    await loadAsks($).catch(error => $.ui.toast(`vantage-point: could not load the saved issue drafts: ${String(error)}`))
    openedPane($)
    // The frontier needs this repo, which the agent read finds, so it follows that read.
    void readAgent($).then(() => readFrontier($)).catch(() => undefined)
    // The agent row's zoom-out button carries the ready count, so it is read ahead.
    void readReady($).catch(() => undefined)
    // Sessions started together would poll in step and all miss gh's shared cache at once,
    // so each polls at its own moment of the minute, taken from its id.
    const id = await $.session.id().catch(() => '')
    $.clock.after(pollPhase(id, ISSUE_POLL_MS), () => {
      pollGitHub($)
      $.clock.every(ISSUE_POLL_MS, () => pollGitHub($))
    })
    void scanCachesNow($).catch(() => undefined)
    $.clock.every(CACHE_SCAN_MS, () => void scanCachesNow($).catch(() => undefined))

    return next(e)
  })

  // A turn may switch branches or move into a worktree: read the ticket again.
  // The decision stays through the reply and a plugin reload; the next turn and /clear clear it.
  // The deck fills itself too (issue #14): a regex on the reply or a wrap-up ask (issue #21), a Haiku gate, a
  // tool-less fork that writes the deck, then the quote and support checks. The
  // band shows nothing new until the deck has passed them. A question the agent asked this turn
  // keeps the row: the reply and its wrap-up box only restate it.
  on('turn.complete', async ($, e, next) => {
    // A Keep warm ping's turn leaves the band as it was, and one that missed the cache stops the
    // pinging; a real turn is the person acting, so the stop counts from it (issue #60).
    if (e.agentId === undefined) {
      turnRunning = false
      const wasPing = pingTurn !== null && pingTurn === e.turnId
      const missed = pingMissed
      pingTurn = null
      pingMissed = false
      const id = await $.session.id().catch(() => null)
      const now = await $.clock.now()
      if (id !== null && (wasPing || (await read($, warmths))[id]?.armed === true)) {
        await changeWarmth($, id, w => afterTurn(w, wasPing ? { ping: true, missed } : { ping: false, at: now })).catch(() => undefined)
      } else if (id !== null) await scheduleWarm($).catch(() => undefined)
      if (wasPing) return next(e)
    }
    if (e.agentId === undefined) void readAgent($).catch(() => undefined)
    const result = await next(e)
    if (e.agentId === undefined) {
      // Read off the reply's text alone, so the Tickets page needs no model call.
      const tickets = e.reason === 'answer' ? await ticketsOf($, e.answer) : []
      await update($, replyTickets, () => tickets)
      void readCards($, tickets).catch(() => undefined)
    }
    // The tour's Reader stop asked for this reply: it plays as it lands.
    if (e.agentId === undefined && e.reason === 'answer' && readsNextReply) {
      readsNextReply = false
      void startReader(readerIO($), false).catch(() => undefined)
    }
    if (e.agentId === undefined && e.reason === 'answer') {
      // A desktop agent may ask in the wrap-up box and write nothing after it.
      const epoch = deckEpoch
      const cards = turnCards
      const asked = askedThisTurn
      const permission = permissionThisTurn
      void (async () => {
        if (permission) return
        if (asked !== null) return fillDeck($, e.answer, asked, epoch, cards, true)
        const wrap = wrapUpAsk(await $.session.messages().catch(() => []))
        if (wrap !== null || looksLikeDecision(e.answer)) await fillDeck($, withoutGist(e.answer), wrap, epoch, cards)
      })().catch(() => undefined)
    }
    return result
  })

  // The subagents row (issue #22): what each spawn, model step and tool call say of a
  // subagent; the engine's list is read once a second from session.start (watchSubagents).
  on('agent.spawn', async ($, e, next) => {
    const now = await $.clock.now()
    const result = await next(e)
    if ('agentId' in result && result.agentId) {
      const model = result.model ?? e.model
      await subagentFact($, result.agentId, now, m => ({ ...m, startedAt: now, ...(model === undefined ? {} : { model }) }))
    }
    return result
  })

  on('turn.step', async function* ($, e, next) {
    const arm = async (asked: HumanQueueDecision) => {
      await update($, decision, () => asked)
      askedThisTurn = askOf(asked)
    }
    // Where the band draws the task list, the app must not: every update_plan call is renamed in the stream (issue 104).
    const main = e.agentId === undefined ? withoutWrapUpBox(next(e), arm) : next(e)
    const result = yield* (e.agentId === undefined && renamesPlans ? renamedPlans(main) : main)
    if (e.agentId === undefined && result.usage != null) await touchSessionCache($)
    if (e.agentId === undefined && result.usage != null && pingTurn !== null && pingTurn === e.turnId && missedCache(result.usage)) pingMissed = true
    if (e.agentId !== undefined && result.usage != null) {
      const u = result.usage
      await subagentFact($, e.agentId, await $.clock.now(), m => ({
        ...m,
        model: m.model ?? e.model,
        ...(e.effort === undefined ? {} : { effort: String(e.effort) }),
        outTokens: m.outTokens + u.output_tokens,
        context: u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens,
      }))
    }
    return result
  })

  // A card this turn proposes may be started from its chip, which no event reports (#67).
  on('tool.call', { tool: 'mcp__ccd_session__start_session' as typeof TOOL }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && result.deny === undefined) {
      const card = proposedCard(result.text ?? JSON.stringify(result.result ?? ''))
      if (card !== null) turnCards = [...turnCards, card]
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) return next(e)
    const id = e.agentId
    const now = await $.clock.now()
    await subagentFact($, id, now, m => ({ ...m, tool: e.tool, toolAt: now }))
    const result = await next(e)
    await subagentFact($, id, now, m => ({ ...m, tool: undefined, toolAt: undefined }))
    return result
  })

  // A memory the agent read this turn counts as in its context.
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const path = (e as unknown as { file_path?: unknown }).file_path
    if (typeof path === 'string' && isMemoryPath(path)) memoryReads.add(path)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      turnRunning = true
      warmTimer?.cancel()
      if (pingPending && e.text.includes(PING)) {
        pingPending = false
        pingTurn = e.turnId
        return next(e)
      }
    }
    deckEpoch += 1
    askedThisTurn = null
    permissionThisTurn = false
    turnCards = []
    memoryReads.clear()
    if (e.agentId === undefined) renamesPlans = await renamesHere($)
    await takeState($).catch(() => undefined)
    // The row waits for the person: their message or a press clears it, never a turn they did not
    // start (a background task's notification, another session's message, a scheduled prompt).
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await clearDecision($)
    agentReadEpoch += 1
    stateTaken = undefined
    // A /clear starts a new conversation: rulings no longer go back to the old one.
    if (e.reason === 'clear') {
      await update($, notify, () => [])
      await update($, capture, () => null)
      await update($, steps, () => [])
    }
    return next(e)
  })

  on('command.run', { command: 'vantage-point' }, async ($, e) => {
    const mode = e.args.trim().toLowerCase()
    if (mode === 'palette' || mode.startsWith('palette ')) return { text: await openPalette($, mode.slice('palette'.length).trim()) }
    if (mode === 'album' || mode.startsWith('album ')) return { text: await openAlbum($, mode.slice('album'.length).trim()) }
    if (mode === 'grade') return { text: await openGrading($) }
    if (mode === 'tour') return { text: await openTour($) }
    if (mode === 'keep-warm') {
      const id = await $.session.id()
      await toggleWarmth($, id)
      const w = (await read($, warmths))[id] ?? UNARMED
      const now = await $.clock.now()
      return { text: warmStateOf(w, now) === 'armed' ? `Keep warm armed: this session refreshes its cache while idle, ${warmFact(w, now)}.` : 'Keep warm off.' }
    }
    if (mode === 'caches') {
      await openCaches($)
      return { text: 'Caches opened.' }
    }
    if (mode === 'steps') return { text: await toggleSteps($) }
    if (mode === 'native' || mode === 'picture') await update($, cardMode, () => mode)
    await openPane($)
    return { text: await summary($, await openRequests($), await read($, github)) }
  })

  // A question the agent asks is not drawn in the native dialog. The reply row shows its
  // first question's options with the recommended one leading, and the person answers by
  // pressing one, which sends it as their reply. The call is refused, so the dialog never
  // renders. A subagent's question, or one whose input is not a question, keeps the dialog:
  // a subagent cannot take an answer that arrives as the person's next message.
  // The engine runs a failed hook's tool, so the catch refuses the dialog in its place.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (e.agentId !== undefined) {
      await logAsk($, 'dialog', 'subagent')
      return next(e)
    }
    const asked = decisionOfQuestions((e as unknown as { questions?: unknown }).questions)
    if (asked === null) {
      await logAsk($, 'dialog', 'not a question with 2-4 options')
      return next(e)
    }
    await update($, decision, () => asked)
    askedThisTurn = askOf(asked)
    await logAsk($, 'row')
    return { deny: ON_ROW }
  }).catch(async ($, e, next) => {
    if (next.called) return next(e)
    const asked = e.agentId === undefined ? decisionOfQuestions((e as unknown as { questions?: unknown }).questions) : null
    if (asked === null) return next(e)
    const armed = await update($, decision, () => asked).then(() => true, () => false)
    askedThisTurn = askOf(asked)
    await logAsk($, 'failed', `${next.error.kind}${next.error.message === undefined ? '' : `: ${next.error.message}`}${armed ? '' : ', row not armed'}`)
    return { deny: armed ? ON_ROW : IN_PROSE }
  })

  // While a phone is attached through Remote Control, a call the mode would put to the person asks on
  // the reply row instead of the app's prompt: the call is refused with Allow once and Deny on the row,
  // and an Allow lets the agent's repeat of the same call run once. With no phone attached, a subagent's
  // call, a query, a mode whose asks the person does not answer (auto, plan, dontAsk), and a tool that
  // asks in a dialog of its own keep the native prompt; a failed hook leaves the engine's ask.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision !== 'ask' || e.tool_use_id === undefined || e.agentId !== undefined || PERSON_TOOLS.has(e.tool)) return verdict
    // Only an ask put to the person moves: in auto mode the classifier answers it, and an unread mode stays native.
    if (!ROW_MODES.has((await sessionMode($).catch(() => null)) ?? '')) return verdict
    // At the desk the app's own prompt answers it; the row is for the phone.
    if (!(await onPhone($))) return verdict
    if (allowedOnce.delete(callKey(e.tool, e.input))) return { decision: 'allow', reason: 'The person allowed this call on the reply row.' }
    const asked = decisionOfPermission(e.tool, e.input)
    await update($, decision, () => asked)
    permissionThisTurn = true
    await logAsk($, 'row', `permission: ${e.tool}`)
    return { decision: 'deny', reason: WAIT_ON_ROW }
  })

  // The desktop hides the whole band while a wrap-up box with a question shows, so the
  // question moves to the reply row and the box goes through as its recap alone, which
  // draws nothing. A press sends the button's message, as the box's button would.
  on('tool.call', { tool: WRAP_UP_TOOL as typeof TOOL }, async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const input = e as unknown as Record<string, unknown>
    const asked = decisionOfWrapUp(input)
    if (asked === null) return next(e)
    await update($, decision, () => asked)
    askedThisTurn = askOf(asked)
    const { ask: _ask, actions: _actions, blocked: _blocked, ...recap } = input
    return next(recap as unknown as typeof e)
  })

  // The engine types a plugin's tools from the last load, so a tool new in this
  // version is matched by name and its input read as the schema above declares it.
  on('tool.call', { tool: SHOW_TOOL as typeof TOOL }, async ($, e) => {
    const input = e as unknown as { pane?: unknown; page?: unknown }
    const page = typeof input.page === 'string' ? input.page.trim().toLowerCase() : ''
    if (input.pane === 'palette') return { result: await openPalette($, page) }
    if (input.pane === 'album') return { result: await openAlbum($, page) }
    if (input.pane === 'grading') return { result: await openGrading($) }
    if (input.pane === 'tour') return { result: await openTour($) }
    if (input.pane === 'steps') return { result: await toggleSteps($) }
    if (input.pane === 'deck-facts') return { result: await toggleDeckFacts($) }
    return { result: 'Not opened: pane is "palette", "album", "grading", "steps", "deck-facts" or "tour".' }
  })

  // The steps tool only forwards to the app's update_plan, which the app lists in the session's
  // allowed tools for every mode; without this the renamed call would ask where update_plan never does.
  on('tool.check', { tool: STEPS_TOOL as typeof TOOL }, async () => ({ decision: 'allow', reason: 'It forwards to update_plan, which the app allows.' }))

  // An update_plan call renamed in the stream lands here (issue 104). It goes on to the app's own
  // tool, so the app's reply and its record of the steps stay exact, and the band takes the steps.
  on('tool.call', { tool: STEPS_TOOL as typeof TOOL }, async ($, e) => {
    const { tool: _tool, tool_use_id: _id, agentId, ...input } = e as unknown as Record<string, unknown>
    // Where the app has no update_plan (a terminal), the band's steps are the whole list.
    const answer = await $.tool.call({ tool: UPDATE_PLAN_TOOL, ...input } as never).catch(() => null)
    if (answer?.deny !== undefined) return { deny: answer.deny }
    if (answer?.isError === true) return { deny: answer.text ?? 'update_plan failed.' }
    if (agentId === undefined) await update($, steps, held => applyCall(held, input))
    const reply = answer === null ? undefined : (answer.text ?? (typeof answer.result === 'string' ? answer.result : undefined))
    return { result: reply ?? 'Steps shown in the band.' }
  })

  // A wrap-up checks off every step, as the app's own list does.
  on('tool.call', { tool: WRAP_UP_TOOL as typeof TOOL }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && result.deny === undefined && result.isError !== true && (await read($, stepsHere))) await update($, steps, finished)
    return result
  })

  on('tool.call', { tool: TASK_TOOL as typeof TOOL }, async ($, e) => {
    const input = e as unknown as { task?: unknown; detail?: unknown }
    const title = typeof input.task === 'string' ? input.task.trim().replace(/\s+/g, ' ') : ''
    const detail = typeof input.detail === 'string' ? input.detail.trim() : ''
    await update($, task, () => (title === '' ? null : { title, detail }))
    return { result: title === '' ? 'Cleared: the band shows no task for you.' : `The band shows your task: ${title}` }
  })

  // One line in the system prompt so the session's agent keeps its task current,
  // and one (issue 20) telling it where the session stands, as taken at the turn's start.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const state = stateTaken !== undefined ? stateTaken : await takeState($).catch(() => null)
    const gist = await readerGist($)
    return {
      sections: [
        ...composed.sections,
        {
          id: 'vantage-point:task',
          scope: 'session' as const,
          text:
            `The person sees what you are working on in a band above their prompt. When you start a task, or your task ` +
            `changes, call ${TASK_TOOL} with it in under ten words and a sentence of detail; call it with an empty task ` +
            `when you finish and hand back to them.`,
        },
        ...(gist ? [{ id: 'vantage-point:gist', scope: 'session' as const, text: GIST_SECTION }] : []),
        ...(state === null ? [] : [{ id: STATE_SECTION, scope: 'session' as const, text: state }]),
      ],
    }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    await refresh($)
    await signedIn($, true).catch(() => undefined)
    const body = await read($, text)
    const wanted = typeof e.request === 'string' && e.request.trim() !== '' ? e.request.trim() : null
    const open = await openRequests($)
    const named =
      wanted === null
        ? open[0]
        : // The file's request by name, even one held back, so a refusal can say why.
          (parse(body).requests.find(r => r.isOpen && r.id === wanted) ??
          open.find(r => r.issue !== undefined && r.id === wanted) ??
          (await askFor($, wanted)))
    if (typeof named === 'string') return { deny: named }
    const request = named
    if (request === undefined) {
      return {
        deny:
          body === '' && open.length === 0
            ? `There is no ${FILE} at the project root yet, and no open issue labelled ${ASKS_LABEL}. Write the request first (see the vantage-point:ask skill).`
            : wanted === null
              ? `Nothing is open: ${FILE} has no open request, and no issue labelled ${ASKS_LABEL} is open.`
              : `${FILE} has no open request ${wanted}. Open ones: ${open.map(r => r.id).join(', ') || 'none'}.`,
      }
    }
    // The person sees the lead-in and one item at a time, so an ask that leans on the rest of
    // its issue goes back to the agent instead of to them (issue 87).
    const gaps = contextGaps(request)
    if (gaps.length > 0) return { deny: gapsText(gaps) }
    // An item with no facts or no context would draw as its question alone, so it goes back to the agent (the owner, 2026-10-23, #102).
    const bare = uncomposedItems(request)
    if (bare.length > 0) return { deny: uncomposedText(bare) }
    const qid = qidOf(request)
    void planOpen($, [request]).catch(() => undefined)
    await update($, notify, ids => (ids.includes(qid) ? ids : [...ids, qid]))
    await update($, capture, () => null)
    await show($, qid, firstUnruled(request))
    await markQueueSeen($)
    const opened = await $.ui.open({ id: PANE, title: 'Human queue', focus: true })
    openedPane($)
    const size = request.items.length === 0 ? 'a plain ask' : `${request.items.length} items`
    const where = opened.isPlaced
      ? 'Opened the human-queue pane on'
      : 'Queued, but Claude Code did not place the pane on screen (its window is narrow, or no attached app places panes). Tell the person to run /vantage-point to rule on'
    const answer =
      request.issue === undefined
        ? 'Their rulings arrive as a new message when they submit.'
        : 'Their rulings arrive as a new message once they post as a comment on the issue.'
    return { result: `${where} ${request.id} "${request.title}" (${size}). ${answer} Do not wait or poll.` }
  })

  on('prompt.submit', async ($, e, next) => {
    // A fresh agent that took a cold session's rulings reports to the person, not the session:
    // its hand-back would start the very turn it was spawned to spare (issue 66).
    if (e.origin.kind === 'peer') {
      const agentId = (await read($, fresh)).find(one => isHandbackOf(e.text, one))
      if (agentId !== undefined) {
        await update($, fresh, ids => ids.filter(one => one !== agentId))
        return { drop: 'A fresh agent acted on the rulings, so this cold session was not woken. Its report is under ← for agents.' }
      }
    }
    if (CAPTURED.has(e.origin.kind) && e.text.trim() !== '') await clearDecision($)
    const target = await read($, capture)
    if (target === null || !CAPTURED.has(e.origin.kind) || e.text.trim() === '') return next(e)
    await update($, capture, () => null)
    const request = await requestOf($, target.request)
    const item = request === undefined ? undefined : findItem(request, target.item, target.heading)
    const isGone = request === undefined || !request.isOpen || (target.heading !== null && item === undefined)
    const name = sourceOf(target.request).id
    if (isGone) {
      $.ui.toast(`The comment's target ${name} moved or closed, so your message went to the chat.`)
      return next(e)
    }
    if (!(await saveComment($, target, e.text))) return next(e)
    const where = target.heading === null ? `request ${name}` : `item ${target.heading}`
    return { drop: `💬 Saved as the comment on ${where}.` }
  }).catch(($, e, next) => {
    if (next.called) return next(e)
    $.ui.toast('The comment could not be saved, so your message went to the chat.')
    return next(e)
  })

  // The keyboard leaving the native card's comment field for anything else in the
  // pane saves what was typed, and the field rests as wrapped text.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    if ((await read($, cardMode)) === 'native') {
      const typing = e.element === 'comment'
      if (!typing) await flushDraft($)
      await update($, commentTyping, () => typing)
    }
    return next(e)
  })

  on('ui.message', { requestId: PANE }, async ($, e) => {
    if (e.element === 'comment-rest') {
      // A click on a saved comment brings the Input back, with the keyboard in it.
      await update($, commentTyping, () => true)
      await $.ui.focus({ requestId: PANE, key: 'comment' }).catch(() => undefined)
      return {}
    }
    const data = e.data as { key?: unknown; act?: unknown; open?: unknown } | null
    // A click anywhere on one of the plate's rows opens its ask: an ask's row its own, a
    // group's "N more" the first ask it stands for, the Next row the oldest (issue 71).
    const row = /^(?:ask|more):(.+)$/.exec(e.element)
    if (row !== null) {
      // An ask answered since the plate was drawn opens nothing, rather than whichever ask is first.
      const qid = row[1] as string
      if (data?.open === true && (await openRequests($)).some(r => qidOf(r) === qid)) await showRequest($, qid)
      return {}
    }
    if (e.element === 'next') {
      const buckets = bucketsOf(await openRequests($), await projectName($))
      const at = pickNext(buckets.map(bucket => ({ asks: bucket.requests })), r => r.opened)
      const target = at === null ? undefined : buckets[at.repo]?.requests[at.ask]
      if (data?.open === true && target !== undefined) await showRequest($, qidOf(target))
      return {}
    }
    if (e.element === 'body') {
      const action = typeof data?.key === 'string' ? KEYS[data.key] : undefined
      if (action !== undefined) await pressNative($, action, e.surface, 'card')
      return {}
    }
    if (e.element !== 'card') return {}
    const action = data?.act === 'comment' ? 'comment' : typeof data?.key === 'string' ? KEYS[data.key] : undefined
    if (action !== undefined) await act($, action, e.surface, 'card')
    return {}
  })

  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    // The native card takes no wheel steps (0001 mouse): the wheel only scrolls.
    if ((await read($, cardMode)) === 'native') return next(e)
    const max = Math.max(0, e.contentRows - e.bodyRows)
    const isWheel = e.pointer !== undefined && e.by !== 0
    const atEdge = max === 0 || (e.by > 0 ? windowOffset >= max : windowOffset <= 0)
    if (!isWheel || !atEdge) {
      const result = await next(e)
      if (result.deny === undefined) windowOffset = Math.min(Math.max(0, e.offset), max)
      return result
    }
    const now = await $.clock.now()
    if (now - lastWheelAt >= WHEEL_GAP_MS) {
      lastWheelAt = now
      await step($, e.by > 0 ? 1 : -1)
    }
    return {}
  })

  // The band above the prompt: the next ask waiting on the person (amber), and
  // what this session's agent is doing (blue): the ticket its branch names, else
  // the task it last declared. A title opens its card; with the card open, the
  // title (or the card's button) takes the action. The desktop draws a Button
  // as a native button showing only its label, so chips and prose are Text.
  // The blackout (issue #36): while a read holds the band, every transcript row
  // draws nothing. The read's end, or exit, brings them back.
  on('ui.render', { component: TRANSCRIPT_ROWS }, async ($, e, next) => {
    const reader = await read($, reading)
    if (!isHeld(reader)) {
      // The author's <gist> block is for the Reader (#49): the transcript draws the reply without it.
      if (e.component === 'AssistantMessage' && typeof e.props.text === 'string' && e.props.text.includes('<gist>')) {
        return next({ ...e, props: { ...e.props, text: splitGist(e.props.text).reply } } as typeof e)
      }
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    // While reading, the Reader takes over the whole band (issue #35): nothing else
    // is read here, so nothing else redraws it and restarts the picture's animation.
    const reader = await read($, reading)
    const pacing = pacingOf(reader)
    const elements = $.ui.resolve(e)
    // The Reader draws its words as a picture, so a surface without one (the terminal) has no Reader.
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined
    if (isHeld(reader) && pacing !== null && Svg !== undefined) {
      const { Box, Button, Text } = elements
      const isPlaying = reader.phase === 'playing'
      // Black from edge to edge, the picture spanning the band and the controls a
      // slim row beneath it (the owner's ruling on #35): nothing else draws the eye.
      return (
        <Box flexDirection="column" backgroundColor={PANEL} paddingBottom={1}>
          <Svg
            key={`reader-${reader.id}-${reader.from}-${reader.phase}-${reader.wpm}`}
            source={picture(pacing.beats, reader.from, reader.to, isPlaying, pacing.starts[reader.from] ?? 0, pacing.total)}
            alt={isPlaying ? `Reading the last reply${pacing.level === 'gist' ? "'s gist" : ''}: ${reader.count} words` : `Paused at word ${reader.from + 1} of ${reader.count}`}
            isInteractive
          />
          {/* App-like controls (the owner's comment on #35). The desktop draws a Button's label, never
              its children, so each glyph is the label itself. */}
          <Box key="reader-controls" flexDirection="row" justifyContent="center" alignItems="center" columnGap={4}>
            <Box flexDirection="row" alignItems="center" columnGap={1}>
              <Button key="reader-slower" label="−" plain dimColor onPress={() => speedReader(readerIO($), -SPEED_STEP)} />
              <Text dimColor>{`${reader.wpm} wpm`}</Text>
              <Button key="reader-faster" label="+" plain dimColor onPress={() => speedReader(readerIO($), SPEED_STEP)} />
            </Box>
            <Button key="reader-toggle" label={isPlaying ? '❚❚' : '▶︎'} plain onPress={() => toggleReader(readerIO($))} />
            {/* The author's gist plays first; this reads the whole reply instead, or goes back (#49). */}
            {pacing.gist !== null ? (
              <Button key="reader-level" label={pacing.level === 'gist' ? 'Read full' : 'Read gist'} plain dimColor onPress={() => switchLevel(readerIO($))} />
            ) : null}

            <Button key="reader-exit" label="✕" plain dimColor onPress={() => endReader(readerIO($))} />
          </Box>
        </Box>
      )
    }
    const open = await openRequests($)
    // Left is the project, right is everything (issue #10). The left names only
    // an ask of this session's repo, or of the project folder's human-queue.md,
    // which older projects keep their tickets in; with neither it stays empty. An
    // ask from another repo there would read as this project's, and a wrong
    // answer is worse than none. The right's counts span every repo.
    const repoHere = (await read($, here))?.toLowerCase() ?? null
    const isHere = (r: Request) => r.issue === undefined || (repoHere !== null && r.issue.repo.toLowerCase() === repoHere)
    const mine = open.filter(isHere)
    // A ruling the person submitted and has still to send leads this project's
    // asks: it is their unfinished act, not a new ask (openRequests lists those first).
    const pending = open[0] !== undefined && isHere(open[0]) && WAITS_FOR_R.has(await phaseOfRequest($, open[0])) ? open[0] : undefined
    const first = pending ?? mine[0]
    const askChip = first === undefined ? '' : first.issue === undefined ? first.id : `#${first.issue.number}`
    // A submitted ruling still to send is the person's next job, not a new ask.
    const isFollowUp = WAITS_FOR_R.has(await phaseOfRequest($, first))
    const branch = await read($, agentBranch)
    const heldTicket = await read($, agent)
    const ticket = branch.state === 'ticket' && heldTicket?.key === branch.key ? heldTicket : null
    const declared = await read($, task)
    const named =
      ticket !== null
        ? {
            chip: `#${ticket.key.split('#')[1]}`,
            title: ticket.title,
            heading: `This session's ${ticket.kind}: ${shortKey(ticket.key)} ${ticket.title}`,
            body: ticket.gist,
            action: { label: 'Open ticket', run: () => openTicket($, ticket.key) } as CardAction | null,
          }
        : declared !== null && branch.state !== 'ticket'
          ? {
              // The dot says the agent is working; no status word beside it (issue #22).
              chip: '',
              title: declared.title,
              heading: "This session's task",
              body: declared.detail === '' ? declared.title : declared.detail,
              action: { label: 'Open task', run: () => $.ui.open({ id: TASK_PANE, title: 'Task', focus: true }).then(() => undefined) } as CardAction | null,
            }
          : null
    // The agent's steps (issue 104) open from its task: a press on the agent row's title shows them in its
    // card, in place of the app's own list. An agent that named no task gets their count as the title.
    const heldSteps = (await read($, stepsHere)) ? await read($, steps) : []
    const work =
      named !== null || heldSteps.length === 0
        ? named
        : {
            chip: '',
            title: `${doneOf(heldSteps)} steps done`,
            heading: "This session's steps",
            body: '',
            action: { label: 'Open task', run: () => $.ui.open({ id: TASK_PANE, title: 'Task', focus: true }).then(() => undefined) } as CardAction | null,
          }
    const observed = await read($, observations)
    const now = await $.clock.now()
    const showing = e.props.view.agentId === undefined ? await read($, decision) : null
    const stage = ticket?.status === 'Moving' ? ticket.stage : ticket?.status ?? null
    const isIdle = work === null && branch.state === 'none'
    // Off a ticket, the agent row answers "what's next?" from this project's frontier
    // (issue 16): its first ready item, Idle when nothing is ready, or that the read failed.
    const heldFrontier = await read($, frontier)
    const nextItem = heldFrontier.state === 'read' ? nextOf(heldFrontier.frontier) : null
    const frontierLine = !isIdle ? null
      : heldFrontier.state === 'read'
        ? nextItem !== null ? { chip: 'next', label: `#${nextItem.number} ${nextItem.title}` } : { chip: '', label: 'Idle' }
        : heldFrontier.state === 'failed' ? { chip: '', label: 'Frontier unavailable' } : null
    const hasAgentObservation = work !== null || isIdle || showing !== null
    const { Box, Button, Text } = $.ui.resolve(e)
    const shown = await read($, peek)
    // The numbers share one column, so both titles start at one edge.
    const chipWidth = Math.max(first === undefined ? 0 : askChip.length, work?.chip.length ?? 0)
    const fileAsks = open.filter(request => request.issue === undefined).length
    const place = first !== undefined ? mine.indexOf(first) + 1 : null
    const readyText = agentPill(stage, ticket?.progress ?? null, observed.ready, now)
    const steady = youPill(place, mine.length, observed.waiting, now, fileAsks)
    const waitingNow = waitingTotal(observed.waiting, fileAsks)
    const seen = await read($, seenWaiting)
    const since = await read($, unseenSince)
    const waitingText = waitingNow !== null && seen !== null && since !== null && waitingNow > seen && now - since < NEW_ASK_MS
      ? `${waitingNow - seen} (${waitingNow})`
      : steady
    // Labels are always text; the owner declined an emoji fallback.
    // One label column, as wide as its longest label, so every title starts at one edge.
    const labelWidth = 'subagents'.length
    // Each label is followed by a dot: coloured only when the row needs the eye, grey otherwise (issue #22).
    const rowLabel = (key: string, name: 'you' | 'agent' | 'subagents', signal: string | null) => [
      <Box key={key} width={labelWidth} flexShrink={0}>
        <Text dimColor>{name}</Text>
      </Box>,
      signal === null ? <Text key={`${key}-dot`} dimColor>●</Text> : <Text key={`${key}-dot`} color={signal} bold>●</Text>,
    ]
    // The ticket or ask number, dim: the row's dot carries the colour (issue #22).
    const chip = (text: number | string) =>
      chipWidth === 0 ? null : (
        <Box width={chipWidth} flexShrink={0}>
          {text === '' ? null : <Text dimColor>{String(text)}</Text>}
        </Box>
      )
    // Each title is cut to the room its row leaves beside the pills, so a long status
    // ("Waiting on you (16)") shortens the title instead of drawing over it.
    const perCell = e.surface === 'terminal' ? 1 : DESKTOP_CHARS_PER_CELL
    // Cells before a title: the band's padding, the label column, the dot and the number, each with its gap.
    const lead = 2 + labelWidth + 1 + 1 + 1 + (chipWidth === 0 ? 0 : chipWidth + 1)
    const showsBook = e.props.view.agentId === undefined && Svg !== undefined
    const agentRoom = titleRoom(e.props.bodyColumns - lead, showsBook ? [readyText, '📖'] : [readyText], perCell)
    const followUp = 'Needs follow-up:'
    const youRoom = titleRoom(e.props.bodyColumns - lead - (isFollowUp ? Math.ceil(followUp.length / perCell) + 1 : 0), [waitingText], perCell)
    const close = () => update($, peek, () => null)
    // First press opens the card; a press with it open takes the action, or closes a card that has none.
    const titlePress = (which: 'human' | 'agent', action: (() => Promise<void>) | null) => async () => {
      if (shown !== which) return update($, peek, () => which)
      // Act first: closing the card redraws the band under the press.
      if (action !== null) await action()
      await close()
    }
    // The agent's reply above its row, then the agent row, then the project's ask.
    // Global counts stay on the right even when no project ask is observed.
    const row = (key: string, children: RenderChildren, icon: RenderChildren) => (
      <Box key={key} flexDirection="row" alignItems="center" columnGap={1}>
        {/* Clipped, so a title the cut misjudges ends at the pills rather than under them. */}
        <Box flexDirection="row" alignItems="center" columnGap={1} flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
          {children}
        </Box>
        {icon}
      </Box>
    )
    // A title's card: its heading with the action and Close on one line, then its body. The agent's card
    // with steps (issue 104) leads with the detail on that line instead and lists `lines` steps under it,
    // the room the band leaves beside its rows; the Task pane holds the detail and steps whole. The rows'
    // dots carry the colour, not the card.
    const card = (
      which: 'human' | 'agent',
      heading: string,
      body: string,
      action: CardAction | null,
      list: readonly HumanQueueStep[] = [],
      lines = 0,
    ) =>
      shown !== which ? null : (
        <Box key={`hq-${which}-card`} flexDirection="column" rowGap={1} borderStyle="round" paddingX={1}>
          <Box flexDirection="row" alignItems="center" columnGap={1}>
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              {list.length === 0 ? (
                <Text bold wrap="wrap">
                  {heading}
                </Text>
              ) : (
                <Text wrap="truncate-end">{shortTitle(body === '' ? heading : body, 60, firstLine)}</Text>
              )}
            </Box>
            {action === null ? null : (
              <Button
                key={`card-open-${which}`}
                variant="secondary"
                onPress={async () => {
                  await action.run()
                  await close()
                }}
              >
                {action.label}
              </Button>
            )}
            <Button key={`close-${which}`} role="dismiss" label="Close" onPress={close} />
          </Box>
          {body === '' || list.length > 0 ? null : <Text wrap="wrap">{body}</Text>}
          {list.length === 0 ? null : (
            // One line a step: done ones dim, the one in progress on a blue dot; past the room, counts in their place.
            <Box key={`hq-${which}-steps`} flexDirection="column">
              {linesOf(list, lines).map((line, i) => (
                <Box key={`step-${i}`} flexDirection="row" alignItems="center" columnGap={1}>
                  {line.kind === 'step' && line.step.status === 'in_progress' ? <Text color={SIGNAL_BLUE} bold>●</Text> : <Text dimColor>●</Text>}
                  <Box flexShrink={1} minWidth={0}>
                    {line.kind === 'step' ? (
                      <Text {...(line.step.status === 'completed' ? { dimColor: true } : {})} wrap="truncate-end">
                        {line.step.text}
                      </Text>
                    ) : (
                      <Text dimColor>{line.kind === 'done' ? `${line.count} done` : `${line.count} more`}</Text>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )
    const openDecision = () => $.ui.open({ id: DECISION_PANE, title: 'Decision', focus: true }).then(() => undefined)
    const openReader = () => startReader(readerIO($), e.props.isWorking)
    const openFirst = first === undefined ? null : () => openAsk($, qidOf(first))
    // The subagents row (issue #22): only once this session has spawned one. The
    // counts open an outline beneath, lined up with the titles; no pill, since the
    // counts already say how many.
    const team = await read($, subagents)
    const teamMeta = await read($, subagentMeta)
    const teamOpen = await read($, subagentsOpen)
    const teamPick = await read($, subagentPick)
    const teamNow = Math.max(await read($, subagentNow), now)
    const teamOrder = ordered(team, teamMeta)
    const teamLive = team.filter(isLive)
    const teamSignal = teamLive.length > 0 ? SIGNAL_BLUE : team.some(isFailed) ? SIGNAL_RED : null
    const teamLead = teamLive.length > 0 ? teamOrder[0] : undefined
    const toggleTeam = () => update($, subagentsOpen, isOpen => !isOpen)
    const teamDot = (s: Subagent) => (isLive(s) ? SIGNAL_BLUE : isFailed(s) ? SIGNAL_RED : null)
    const teamRows = team.length === 0 ? null : (
      <Box key="hq-subagents" flexDirection="column" rowGap={teamOpen ? 1 : 0}>
        {row(
          'hq-subagents-row',
          [
            ...rowLabel('subagents-label', 'subagents', teamSignal),
            chipWidth === 0 ? null : <Box key="subagents-chip" width={chipWidth} flexShrink={0} />,
            <Button key="open-subagents" label={teamCounts(team)} plain onPress={toggleTeam} />,
            teamOpen || teamLead === undefined ? null : (
              <Box key="subagents-lead" flexShrink={1} minWidth={0}>
                <Text dimColor wrap="truncate-end">
                  {`${teamLead.description} · ${modelOf(teamLead, teamMeta[teamLead.id])} · ${elapsed(teamMeta[teamLead.id], teamNow)}`}
                </Text>
              </Box>
            ),
          ],
          // The row's one action, lowest salience: grey, lowercase, only while open with something finished.
          // Without it, the line stops where the pills column starts, so that column stays clear on every
          // row (issue #41).
          teamOpen && team.length > teamLive.length ? (
            <Button key="subagents-clear" label="clear finished" plain dimColor onPress={() => update($, subagents, rows => rows.filter(isLive))} />
          ) : (
            <Box key="subagents-gutter" width={9} flexShrink={0} />
          ),
        )}
        {!teamOpen ? null : (
          // An outline: each subagent's dot under the row's dot, its description under the titles.
          <Box key="hq-subagents-outline" flexDirection="column" paddingLeft={labelWidth + 1}>
            {teamOrder.slice(0, ROOM).map(s => {
              const m = teamMeta[s.id]
              const signal = teamDot(s)
              const wait = waitingOn(m, teamNow)
              const [facts, doing] = detail(s, m, teamNow)
              return (
                <Box key={`subagent-${s.id}`} flexDirection="column">
                  <Box flexDirection="row" alignItems="center" columnGap={1} paddingLeft={s.parentId === undefined ? 0 : 2}>
                    {signal === null ? <Text dimColor>●</Text> : <Text color={signal} bold>●</Text>}
                    <Button key={`subagent-pick-${s.id}`} label={s.description || s.type} plain onPress={() => update($, subagentPick, held => (held === s.id ? null : s.id))} />
                    <Text dimColor>{rowFacts(s, m, teamNow)}</Text>
                    {wait === '' ? null : <Text color={SIGNAL_YELLOW}>{wait}</Text>}
                  </Box>
                  {teamPick !== s.id ? null : (
                    <Box flexDirection="column" paddingLeft={2}>
                      <Text dimColor>{facts}</Text>
                      <Text dimColor>{doing}</Text>
                    </Box>
                  )}
                </Box>
              )
            })}
            {teamOrder.length > ROOM ? <Box paddingLeft={2}><Text dimColor>{`+${teamOrder.length - ROOM} earlier`}</Text></Box> : null}
          </Box>
        )}
      </Box>
    )
    // The rows the agent card shares the band with (issue 104): the agent and you rows, the subagents
    // row and its open outline, and the reply above them.
    bandSeen = { maxRows: e.props.maxRows, columns: e.props.bodyColumns }
    // The card's first line, cut at a word to what its Open task and Close leave of the band's columns.
    const firstLine = Math.max(8, Math.floor((e.props.bodyColumns - 6 - 2 * (PILL_CELLS + 1) - Math.ceil('Open task Close'.length / perCell)) * perCell) - 1)
    const stepLines = cardLines(
      e.props.maxRows,
      2 + (team.length === 0 ? 0 : 1) + (showing === null ? 0 : 1),
      (teamOpen ? Math.min(team.length, ROOM + 1) : 0) + (showing === null ? 0 : showing.options.length),
    )
    return (
      <Box flexDirection="column" rowGap={2} paddingX={1}>
        {first === undefined || openFirst === null
          ? null
          : card('human', label(first), gist(first.body), { label: 'Open in human queue', run: openFirst })}
        {work === null ? null : card('agent', work.heading, work.body, work.action, heldSteps, stepLines)}
        {showing === null ? null : (
          // The reply sits above the agent row, as the Jev quotes did: the band grows
          // upward from the prompt, so the agent and you rows never move under the eye.
          <Box key="hq-reply" flexDirection="row" columnGap={1}>
            <Box width={labelWidth} flexShrink={0} />
            <Box width={1} flexShrink={0} />
            {chipWidth === 0 ? null : <Box width={chipWidth} flexShrink={0} />}
            {/* An outline, the question the parent and each option a child on its own line,
                the recommended one first and green, the rest dim: a brain reads an indented
                outline as a graph at a glance. */}
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
              <Button key="decision-headline" label={showing.headline} plain onPress={openDecision} />
              {/* Each option sends itself as the person's prompt (issue #22). The desktop paints a
                  Button's text in its own colour, so the recommended one's green is a dot beside it. */}
              {[showing.recommend, ...showing.options.map((_, i) => i).filter(i => i !== showing.recommend)].map(i => [i, showing.options[i] as string] as const).map(([i, option]) => (
                <Box key={`decision-option-${i}`} flexDirection="row" columnGap={1} paddingLeft={2}>
                  {i === showing.recommend ? <Text color={RECOMMENDED} bold>●</Text> : <Text dimColor>●</Text>}
                  <Button
                    key={`decision-send-${i}`}
                    label={option}
                    plain
                    {...(i === showing.recommend ? {} : { dimColor: true })}
                    onPress={() => (i === 0 && showing.grant !== undefined && allowedOnce.add(showing.grant), clearDecision($)).then(() => $.prompt.submit({ text: showing.sends?.[i] ?? option, asUser: true })).then(() => undefined)}
                  />
                </Box>
              ))}
            </Box>
          </Box>
        )}
        {row(
          hasAgentObservation ? 'hq-agent' : 'hq-global-ready',
          !hasAgentObservation ? [...rowLabel('agent-label', 'agent', null), <Text key="agent-unknown" dimColor>—</Text>] : [
            ...rowLabel('agent-label', 'agent', work === null ? null : SIGNAL_BLUE),
            ...(work === null ? [] : [
              chip(work.chip),
              <Button key="open-ticket" label={shortTitle(work.title, 6, agentRoom)} plain onPress={titlePress('agent', work.action?.run ?? null)} />,
            ]),
            ...(frontierLine === null ? [] : [
              chipWidth === 0 ? null : (
                <Box key="agent-next-chip" width={chipWidth} flexShrink={0} />
              ),
              <Button key="agent-next" label={shortTitle(frontierLine.label, 6, agentRoom)} plain onPress={() => openFrontier($)} />,
            ]),
          ],
          // The Reader's one entry (issues #34, #35, #41): a book in a grey pill at the agent row's far
          // right, the ready count to its left. The owner picked the book over a word, so the top row
          // keeps its width; no monochrome book draws on the desktop.
          [
            <Button key="open-ready" label={readyText} variant="secondary" onPress={() => openReady($)} />,
            showsBook ? <Button key="open-reader" label="📖" variant="secondary" onPress={openReader} /> : null,
          ],
        )}
        {/* The reply leads, then the agent; its subagents sit beneath it once one has run, so the
            agent row moves up a line when they appear and the you row never moves (issue #41). */}
        {teamRows}
        {row(
          'hq-human',
          first === undefined || openFirst === null ? [...rowLabel('you-label', 'you', null)] : [
            ...rowLabel('you-label', 'you', SIGNAL_YELLOW),
            chip(askChip),
            isFollowUp ? <Text key="follow-up" dimColor>{followUp}</Text> : null,
            <Button key="open-ask" label={shortTitle(first.title, 6, youRoom)} plain onPress={titlePress('human', openFirst)} />,
          ],
          <Button key="open-queue" label={waitingText} variant="secondary" onPress={() => openPane($)} />,
        )}
      </Box>
    )
  })

  // The frontier behind the agent row's "next" (issue 16): every group the frontier
  // read holds, each entry one press from its ticket, and the source it came from.
  on('ui.render', { component: 'Pane', requestId: FRONTIER_PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const held = await read($, frontier)
    if (held.state === 'unknown') return <Text dimColor>Reading this project's frontier…</Text>
    if (held.state === 'failed') return <Text color="error">Could not read the frontier: {held.reason}</Text>
    const f = held.frontier
    const groups = GROUPS.filter(g => f[g.key].length > 0)
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text dimColor>
          {f.source === 'script' ? `spec-frontier.mjs, spec #${f.spec}` : `${held.repo}'s labels`}
        </Text>
        {groups.length === 0 ? <Text>Nothing is on the frontier: no issue here is ready, waiting, claimed, blocked or paused.</Text> : null}
        {groups.map(g => (
          <Box key={`frontier-${g.key}`} flexDirection="column">
            <Text dimColor>{g.name}</Text>
            {f[g.key].map(item => (
              <Button key={`frontier-${g.key}-${item.number}`} label={`#${item.number} ${item.title}`} plain onPress={() => openTicket($, `${held.repo}#${item.number}`)} />
            ))}
          </Box>
        ))}
      </Box>
    )
  })

  // The palette specimen: every element of the desktop's table and its variants,
  // one page each, so a shot shows what docs/palette.md says can be painted.
  on('ui.render', { component: 'Pane', requestId: PALETTE_PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    if (!('Svg' in elements && 'Input' in elements && 'Client' in elements)) {
      const { Text } = elements
      return <Text dimColor>The palette is the desktop's: open it there.</Text>
    }
    const { Client } = elements
    const { version, base } = await $.session.version()
    const log = async (line: string) => {
      const at = new Date(await $.clock.now()).toTimeString().slice(0, 8)
      await update($, paletteState, held => ({ ...held, log: [`${at} ${line}`, ...held.log].slice(0, 5) }))
    }
    return drawPalette(
      elements,
      await read($, paletteState),
      {
        page: async page => {
          await update($, paletteState, held => ({ ...held, page }))
        },
        log,
        input: async value => {
          await update($, paletteState, held => ({ ...held, input: value }))
          await log(`input submit ${JSON.stringify(value)}`)
        },
        select: async value => {
          await update($, paletteState, held => ({ ...held, select: value }))
          await log(`select ${value}`)
        },
      },
      {
        pointer: <Client key="pointer" width="100%" module="../panes/palette/pointer.tsx" props={{ line: REST_LINE }} />,
        inner: [
          { name: 'button', node: <Client key="inner-button" width={84} module="../panes/palette/inner.tsx" props={{ kind: 'button' }} /> },
          { name: 'select', node: <Client key="inner-select" width={84} module="../panes/palette/inner.tsx" props={{ kind: 'select' }} /> },
          { name: 'link', node: <Client key="inner-link" width={84} module="../panes/palette/inner.tsx" props={{ kind: 'link' }} /> },
          { name: 'markdown', node: <Client key="inner-markdown" width={84} module="../panes/palette/inner.tsx" props={{ kind: 'markdown' }} /> },
          { name: 'code', node: <Client key="inner-code" width={84} module="../panes/palette/inner.tsx" props={{ kind: 'code' }} /> },
        ],
        fault: <Client key="fault" width={84} height={3} module="../panes/palette/fault.tsx" />,
      },
      { version, newProps: takesNewProps(base) },
    )
  })

  // The tour (#113): the setup, then each feature with the button that runs it.
  on('ui.render', { component: 'Pane', requestId: TOUR_PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const setup = await read($, tourSetup)
    if (!('Svg' in elements)) return tourText(elements.Text, setup)
    const { Box, Text, Button } = elements
    return drawTour({ Box, Text, Button }, setup, await read($, tourState), key => void pressTour($, key).catch(() => undefined))
  })

  // The mock album: each way the desktop can draw an ask, tried on a real one (hooks/album.tsx).
  on('ui.render', { component: 'Pane', requestId: ALBUM_PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    if (!('Svg' in elements && 'Select' in elements && 'Client' in elements)) {
      const { Text } = elements
      return <Text dimColor>The album is the desktop's: open it there.</Text>
    }
    const { Client } = elements
    return drawAlbum(
      elements,
      await read($, albumState),
      {
        page: async page => {
          await update($, albumState, held => ({ ...held, page }))
        },
        scenario: async scenario => {
          await update($, albumState, held => ({ ...held, scenario }))
        },
      },
      terms => <Client key="glossary" width="100%" module="../panes/album/glossary.tsx" props={{ terms: terms.map(one => ({ term: one.term, means: one.meaning })) }} />,
      cardWidth(e.props.bodyColumns),
      takesNewProps(await engineBase($)),
    )
  })

  // The visuals-grading round (#98): each ask drawn every way its facts allow, through the queue's own card.
  on('ui.render', { component: 'Pane', requestId: GRADING_PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    if (!('Svg' in elements)) {
      const { Text } = elements
      return <Text dimColor>The grading round is the desktop's: open it there.</Text>
    }
    const { Box, Text, Button, Svg, Link, Markdown } = elements
    const room = cardWidth(e.props.bodyColumns)
    const fixed = await roundOf($, room)
    const round = fixed.cases
    return drawGrading(
      { Box, Text, Button, Svg, Link, Markdown, ...('Select' in elements ? { Select: elements.Select } : {}), ...('Input' in elements ? { Input: elements.Input } : {}) },
      round,
      await read($, gradingState),
      {
        pick: (id, option) => void update($, gradingState, held => ({ ...held, sent: false, picks: { ...held.picks, [id]: { ...held.picks[id], pick: option } } })),
        comment: (id, text) => void update($, gradingState, held => ({ ...held, sent: false, picks: { ...held.picks, [id]: { pick: held.picks[id]?.pick ?? 'none', ...(text.trim() === '' ? {} : { comment: text.trim() }) } } })),
        go: at => void update($, gradingState, held => ({ ...held, at: Math.max(0, Math.min(round.length - 1, at)), prose: null })),
        prose: key => void update($, gradingState, held => ({ ...held, prose: held.prose === key ? null : key })),
        send: () =>
          void read($, gradingState).then(async held => {
            await $.prompt.submit({ text: gradesMessage(round, held.picks, fixed.room) })
            await update($, gradingState, h => ({ ...h, sent: true }))
          }),
      },
      room,
      fixed.room,
      takesNewProps(await engineBase($)),
    )
  })

  // The pointer specimen posts each `up`: what reaches the hooks lands in the log.
  on('ui.message', { requestId: PALETTE_PANE }, async ($, e) => {
    const at = new Date(await $.clock.now()).toTimeString().slice(0, 8)
    await update($, paletteState, held => ({ ...held, log: [`${at} ${e.element} posted ${JSON.stringify(e.data)}`, ...held.log].slice(0, 5) }))
    return {}
  })

  // The palette command's own row in the transcript holds one member of the
  // palette's hover scope, so a shot shows a group lighting across sites.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (e.props.command !== 'vantage-point' || !e.props.args.trim().toLowerCase().startsWith('palette')) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box key="palette-row" flexDirection="column">
        <Text dimColor>{e.props.text}</Text>
        <Text dimColor hover={{ scope: SCOPE, color: SIGNAL_YELLOW }}>
          ◆ palette scope: lights with the Hover page's scope rows
        </Text>
      </Box>
    )
  })

  // The agent's zoom-out: every issue ready for an agent, grouped by repo, each
  // one press from its Ticket pane.
  on('ui.render', { component: 'Pane', requestId: READY_PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, ready)
    if (list === null) return <Text dimColor>Reading the issues ready for an agent…</Text>
    if (list.length === 0) return <Text color="success">Nothing is labelled {AGENT_LABEL}.</Text>
    const groups = new Map<string, typeof list>()
    for (const one of list) groups.set(one.repo, [...(groups.get(one.repo) ?? []), one])
    // A number column as wide as the widest number, so every title starts at one edge.
    const numberWidth = Math.max(...list.map(one => String(one.number).length)) + 2
    return (
      <Box flexDirection="column" rowGap={2}>
        {[...groups].map(([repo, issues]) => (
          <Box key={`ready-${repo}`} flexDirection="column" rowGap={1}>
            <Box flexDirection="row" columnGap={1}>
              <Text bold color="suggestion">
                {repo.split('/')[1] ?? repo}
              </Text>
              <Text dimColor>{issues.length}</Text>
            </Box>
            <Box flexDirection="column">
              {issues.map(one => (
                <Box key={`ready-row-${one.key}`} flexDirection="row" alignItems="center">
                  <Box width={numberWidth} flexShrink={0}>
                    <Text dimColor>#{one.number}</Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Button key={`ready-${one.key}`} label={one.title} plain onPress={() => openTicket($, one.key)} />
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    )
  })

  // The footer's cache label (issue #50): a pill with every warm cache's count, which opens the pane,
  // then this session's cache with the minutes in its state's colour. The footer draws text runs and
  // Buttons only, and its Buttons ahead of its text whatever the order here (docs/palette.md), so
  // the label stays text, the pill is the press, and the tree is written in the order drawn. After
  // it, the context label, since the desktop's own left the footer: in the quiet grey, so it reads
  // apart from the cache's minutes, yellow once compaction is near. It runs on inside the label's
  // Text, since the footer trims the space a run of its own would lead with.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (e.surface !== 'desktop') return next(e)
    const engine = await next(e)
    const now = await $.clock.now()
    const held = (await read($, caches)).caches
    const id = await $.session.id()
    // This session's cache at any age, so an idle session reads cold rather than losing its minutes.
    const own = held.find(c => c.kind === 'session' && c.file.endsWith(`/${id}.jsonl`))
    const mine = own === undefined ? undefined : stateOf(own, now)
    const usage = (await $.session.usage().catch(() => null))?.context
    const label = contextLabel(usage)
    const { Box, Button, Text } = $.ui.resolve(e)
    const context = label === null ? null : <Text color={(usage?.percent ?? 0) >= CONTEXT_HIGH ? SIGNAL_YELLOW : QUIET}>{label}</Text>
    return (
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        {engine}
        <Button key="caches-open" label={String(cachesAt(held, now).filter(isWarm).length)} onPress={() => openCaches($)} />
        {mine !== undefined && (
          <Text>
            {'Cache '}
            <Text color={CACHE_TONE[mine.state]}>{leftLabel(mine.left)}</Text>
            {context}
          </Text>
        )}
        {mine === undefined && context}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: CACHES_PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined
    // A row opens its session on a click only on the desktop: the link is the desktop's.
    const Client = e.surface === 'desktop' && 'Client' in elements ? elements.Client : undefined
    const now = await $.clock.now()
    const all = cachesAt((await read($, caches)).caches, now)
    const hidden = await read($, cachesHidden)
    const menu = await read($, cachesMenu)
    const expanded = await read($, cachesExpanded)
    const warm = all.filter(isWarm)
    const shown = treeOf(all.filter(c => passes(c, hidden)))
    const counts = kindCounts(all)
    const filtering = FILTER_KINDS.some(([kind]) => hidden[kind] && counts[kind] > 0)
    const id = await $.session.id()
    const held = await read($, warmths)
    const total = tokens(warm.reduce((sum, c) => sum + c.prefix, 0))
    const newProps = takesNewProps(await engineBase($))
    // The leading gutter holds a top-level row's merged mark; with none shown it closes, so the
    // header and the rows start on the pane title's edge. A child's elbow sits in its own indent.
    const merged = (c: Seen) => c.desk?.merged === true && c.kind === 'session'
    const gutter = shown.some(r => r.depth === 0 && merged(r.cache)) ? MARK_CELLS + 1 : 0
    return (
      <Box flexDirection="column" rowGap={1}>
        {/* The headline, as the queue's overview draws its count (issue 69): the total held, raised by
            size alone, and its qualifiers stepping back beside it. It starts where the rows' titles do. */}
        <Box flexDirection="row" alignItems="flex-end" columnGap={1} paddingLeft={1 + gutter} paddingRight={1}>
          {newProps ? (
            <Text size="title" tabular>
              {total}
            </Text>
          ) : (
            <Text bold>{total}</Text>
          )}
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text color={QUIET} wrap="truncate-end">{['held', hitLabel(warm)].filter(Boolean).join(' · ')}</Text>
          </Box>
          {/* Grey at rest, white while it hides something the list holds: one step, on the control that hides. */}
          <Button key="caches-filter" label="Filter" plain dimColor={!filtering} onPress={() => update($, cachesMenu, open => !open)} />
        </Box>
        {/* The filter's menu: a tick on each kind the list shows, under the header at
            its trailing edge. It pushes the rows down: a Box placed over a Client's region draws
            beneath it (docs/palette.md). Filter closes it. */}
        {menu && (
          <Box key="caches-menu" alignSelf="flex-end" marginRight={1} flexDirection="column" backgroundColor={FILL} borderStyle="round" borderColor={REST_LINE} paddingX={1}>
            {FILTER_KINDS.map(([kind, label]) => (
              <Box key={`filter-row:${kind}`} flexDirection="row" alignItems="center" columnGap={1}>
                <Box width={2} flexShrink={0}>
                  <Text>{hidden[kind] ? '' : '✓'}</Text>
                </Box>
                <Button key={`filter:${kind}`} label={label} plain dimColor={hidden[kind]} onPress={() => update($, cachesHidden, h => ({ ...h, [kind]: !h[kind] }))} />
              </Box>
            ))}
          </Box>
        )}
        {shown.length === 0 && (
          <Box paddingLeft={1 + gutter} paddingRight={1}>
            <Text dimColor>{all.length === 0 ? 'No cache in the last hour.' : 'The filter hides every cache.'}</Text>
          </Box>
        )}
        {shown.map(({ cache: c, depth }) => {
          const tone = CACHE_TONE[c.state]
          const left = Math.round(c.fraction * 1000) / 10
          // The bar fills its column whatever the pane's width: the markup is wider than any pane, so
          // the Svg takes its slot's width, and its viewBox stretches to it. The line keeps its 3px
          // and its round ends however far it stretches.
          const bar = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="5" viewBox="0 0 1000 5" preserveAspectRatio="none"><line x1="2" y1="3.5" x2="998" y2="3.5" stroke="${REST_LINE}" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke"/>${left > 0 ? `<line x1="2" y1="3.5" x2="${Math.max(2.01, (left / 100) * 998)}" y2="3.5" stroke="${tone}" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` : ''}</svg>`
          const session = sessionOf(c)
          const opens = Client !== undefined && session !== undefined
          // Keep warm reaches a session whose mod runs: this one, or one the desktop holds (issue #60).
          const sessionId = c.kind === 'session' ? transcriptId(c) : undefined
          const warmable = sessionId !== undefined && (sessionId === id || session !== undefined)
          const w = sessionId === undefined ? UNARMED : (held[sessionId] ?? UNARMED)
          const armed = warmStateOf(w, now) === 'armed'
          const facts = factsOf(c, [warmFact(w, now)].filter(f => f !== null))
          // The marker says what the row is, since the minutes and the bar carry its state: a merged
          // pull request in the app's merged purple, a child's elbow in grey, a session alone none.
          const mark = merged(c) ? markIcon('merged') : isChild(c) ? markIcon('child') : null
          // A top-level row draws its mark column only while the gutter is open; a child's is its indent.
          const markColumn = depth > 0 || gutter > 0
          return (
            // Every row on the desktop is a Client, so a click anywhere on it expands its card, and
            // lifts under the pointer as the app's sidebar rows do; a double click opens its session
            // where the desktop knows one.
            // Every row and the header are inset a cell, so the lift clears the text (issue 62); a
            // child's elbow sits under its parent's title.
            <Box key={`cache-${c.file}`} flexDirection="row" columnGap={1} alignItems="flex-start" paddingLeft={1 + (depth > 0 ? gutter : 0) + Math.max(0, Math.min(depth, 2) - 1) * (MARK_CELLS + 1)} paddingRight={1} paddingY={0.25} {...(Client !== undefined ? { hover: { backgroundColor: CARD_LINE } } : {})}>
              {markColumn && (
                <Box width={MARK_CELLS} flexShrink={0}>
                  {mark !== null && Svg !== undefined && <Svg source={mark.source} alt={mark.alt} width={14} height={19} />}
                </Box>
              )}
              {/* minWidth 0 lets a long facts line cut at the column's edge instead of widening it. */}
              <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
                {Client !== undefined ? (
                  <Client
                    key={`open:${c.file}`}
                    width="100%"
                    height={2}
                    module="../panes/caches/row.tsx"
                    props={{ title: c.title, left: leftLabel(c.left), tone, facts, cold: c.state === 'cold', warm: armed }}
                  />
                ) : (
                  <>
                    <Box flexDirection="row" columnGap={1}>
                      <Box flexGrow={1} flexShrink={1} minWidth={0}>
                        <Text wrap="truncate-end" dimColor={c.state === 'cold'}>{c.title}</Text>
                      </Box>
                      <Box flexShrink={0}>
                        <Text color={tone}>{armed ? `🔥 ${leftLabel(c.left)}` : leftLabel(c.left)}</Text>
                      </Box>
                    </Box>
                    <Text dimColor wrap="truncate-end">{facts.join(' · ')}</Text>
                  </>
                )}
                {c.state !== 'cold' && Svg !== undefined && <Svg source={bar} alt={`${leftLabel(c.left)} of ${c.ttl} left`} height={5} />}
                {/* A click expands the row to its card, which holds the row's one act: Keep warm, the
                    standard grey button while off and white while armed. A press folds it. */}
                {expanded === c.file && warmable && (
                  <Box flexDirection="row" marginTop={0.5}>
                    <Button key={`warm:${c.file}`} label="Keep warm" {...(armed ? { variant: 'primary' as const } : {})} onPress={async () => {
                      // The card's one act is done: it folds.
                      await update($, cachesExpanded, () => null)
                      if (sessionId !== undefined) await toggleWarmth($, sessionId)
                    }} />
                  </Box>
                )}
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })

  // A click on a cache's row expands its card; a double click opens its desktop session (issues 62, 70).
  on('ui.message', { requestId: CACHES_PANE }, async ($, e) => {
    const data = e.data as { click?: unknown } | null
    const file = e.element.startsWith('open:') ? e.element.slice('open:'.length) : null
    if (file === null) return {}
    if (data?.click !== true) return {}
    const pending = pendingRowClick
    pending?.timer.cancel()
    pendingRowClick = null
    if (pending?.file === file) {
      // The second click of a double: the session opens, and the card was never touched.
      await openCacheSession($, file)
      return {}
    }
    pendingRowClick = {
      file,
      timer: $.clock.after(DOUBLE_CLICK_MS, () => {
        pendingRowClick = null
        void update($, cachesExpanded, open => (open === file ? null : file))
      }),
    }
    return {}
  })

  // The Task pane: what the agent declared it is doing, off a ticket branch.
  on('ui.render', { component: 'Pane', requestId: TASK_PANE }, async ($, e) => {
    const { Box, Markdown, Text } = $.ui.resolve(e)
    const declared = await read($, task)
    // Every step, whole: the band's card holds only as many as its room.
    const list = (await read($, stepsHere)) ? await read($, steps) : []
    if (declared === null && list.length === 0) return <Text dimColor>The agent has not said what it is working on.</Text>
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text bold wrap="wrap">
          {declared?.title ?? `${doneOf(list)} steps done`}
        </Text>
        {declared === null || declared.detail === '' ? null : <Markdown text={declared.detail} />}
        {list.length === 0 ? null : (
          <Box key="task-steps" flexDirection="column">
            {list.map((step, i) => (
              <Box key={`task-step-${i}`} flexDirection="row" columnGap={1}>
                {step.status === 'in_progress' ? <Text color={SIGNAL_BLUE} bold>●</Text> : <Text dimColor>●</Text>}
                <Text {...(step.status === 'completed' ? { dimColor: true } : {})} wrap="wrap">
                  {step.text}
                </Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )
  })

  // The decision deck the reply row opens: one page that scrolls, every part of the call composed from the
  // catalog on it (the owner, 2026-10-24: no Comparison or Sources tab holds a part apart). Tickets keep a tab.
  on('ui.render', { component: 'Pane', requestId: DECISION_PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Markdown, Text } = elements
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined
    const held = await read($, decision)
    if (held === null) return <Text dimColor>No decision is open.</Text>
    const at = await read($, deckPage)
    const cwd = await $.session.cwd()
    const sources = held.sources ?? []
    const replied = await read($, replyTickets)
    const cards = await read($, ticketStates)
    const openRows = await read($, ticketOpen)
    const fileOf = fileUrl(cwd)
    const newProps = takesNewProps(await engineBase($))
    // A citation is a chip naming its file and line; a press opens those lines under its sentence (#108).
    const openQuote = await read($, deckQuote)
    // A chip is its source's name at its sentence's end; a press opens the quote under that sentence, another closes it (#108).
    const chipped = (key: string, field: 'why' | 'reason', text: string) => {
      const nodes: RenderChildren[] = []
      let run: string[] = []
      let hrefs: string[] = []
      const flush = () => {
        if (run.length === 0) return
        const at = nodes.length
        nodes.push(
          <Markdown key={`${key}-${at}`} text={run.join(' ')} dimColor pressableLinks={hrefs}
            onLinkPress={link => void update($, deckQuote, open => {
              const which = link.href.split('#').pop() ?? ''
              return open === which ? null : which
            })} />,
        )
        run = []
        hrefs = []
      }
      citedSentences(text).forEach((sentence, i) => {
        const named = sentence.cites.filter(n => sources[n - 1] !== undefined)
        const links = named.map(n => {
          const href = `${fileOf(sources[n - 1]!.path)}#${field}-${i}-${n}`
          hrefs.push(href)
          return `[${sourceName(sources[n - 1]!)}](${href})`
        })
        // The chips sit in brackets before the sentence's stop, so a name never reads as the next sentence's first word.
        const stop = /[.!?]$/.exec(sentence.text)?.[0] ?? ''
        run.push(links.length === 0 ? sentence.text : `${sentence.text.slice(0, sentence.text.length - stop.length)} (${links.join(', ')})${stop}`)
        const open = named.find(n => openQuote === `${field}-${i}-${n}`)
        if (open === undefined) return
        flush()
        const source = sources[open - 1]!
        nodes.push(
          // The lines themselves, as the file holds them: the chip already names the file and line.
          <Box key={`deck-quote-${field}-${i}`} flexDirection="column" borderStyle="round" borderColor={CARD_LINE} backgroundColor={FILL} paddingX={1}>
            <Text wrap="wrap" {...(newProps ? { mono: true } : {})}>{source.quote}</Text>
          </Box>,
        )
      })
      flush()
      return <Box key={key} flexDirection="column" rowGap={1}>{nodes}</Box>
    }
    const md = (key: string, text: string, dim = false) => <Markdown key={key} text={text} dimColor={dim} />
    type Block = { node: RenderChildren }
    const recommended = held.options[held.recommend]!
    const alternatives = held.options.filter((_, o) => o !== held.recommend)
    // A deck column is about 7.9pt wide (docs/palette.md), so the snapshot fits the pane it is drawn in, or stays out.
    const shot = Svg === undefined ? null : snapshot(held, Math.min(420, e.props.bodyColumns * 7.8))
    // The engine keeps no key on an Svg, so a Box carries it.
    const shotBlock: Block | null = shot === null || Svg === undefined ? null : { node: (
      <Box key="deck-snapshot">
        <Svg source={shot.svg} width={shot.width} height={shot.height}
          alt="The call at the centre, its options around it, and the ADRs and code areas each option touches" />
      </Box>
    ) }
    // The composer's page of the call (#100, #102): its facts, its comparison and its sources, as tiles.
    const composedItem = Svg === undefined ? null : composeDecision({ ...held, facts: deckPageFacts(held) })
    const pictureBlocks: Block[] = composedItem === null || Svg === undefined ? [] : deckPictures(
      { Box, Text, Button, Svg, Link: elements.Link, Markdown },
      {
        plan: (await read($, plans))[composedItem.id] ?? planOf(composedItem, { failed: 'pending' }),
        surface: e.surface === 'mobile' ? 'phone' : 'desktop',
        facts: composedItem.facts,
        question: held.ask,
        room: cardWidth(e.props.bodyColumns),
        newProps,
        ...(held.picks === undefined ? {} : { picks: held.picks }),
      },
    ).map(one => ({ node: one.node }))
    // Each argument of the call over the tool output it rests on (#110): its claim, a chip naming the call that opens
    // the lines it printed, and its fact drawn as data. Gated per session until the owner rules on a shot.
    const isFacts = (held.arguments?.length ?? 0) > 0 && await deckFactsSessions($).then(async ids => ids.includes(await $.session.id())).catch(() => false)
    const caption = newProps ? { size: 'caption' as const } : {}
    const tabular = newProps ? { tabular: true } : {}
    const mono = newProps ? { mono: true } : {}
    const isNumber = (cell: string) => /^-?[$]?\d[\d,]*(\.\d+)?%?$/.test(cell.trim())
    // A numbered line splits into its number, dim in its own column, and its text, which wraps under itself (#110's
    // design review); only when every line prints a number, so a line of prose is never cut at a figure.
    const numberedLines = (text: string, key: string) => {
      const lines = text.split('\n')
      const numbered = lines.map(numberedLine)
      const isSplit = isNumbered(text)
      // The indent every line shares is the file's, not the fact's: dropped, so a wrapped line hangs on its own text.
      const bodies = lines.map((line, i) => (isSplit && numbered[i] !== null ? numbered[i]!.text : line))
      const shared = Math.min(...bodies.filter(body => body.trim() !== '').map(body => /^\s*/.exec(body)![0].length))
      return (
        <Box key={key} flexDirection="column">
          {lines.map((line, i) => (
            // The number sits beside its line's first row, not between the rows a long line wraps to.
            <Box key={`${key}-${i}`} flexDirection="row" columnGap={1} alignItems="flex-start">
              {isSplit && numbered[i] !== null ? <Text dimColor {...mono} {...tabular} {...caption}>{numbered[i]!.number}</Text> : null}
              <Text wrap="wrap" {...mono} {...caption}>{bodies[i]!.slice(Number.isFinite(shared) ? shared : 0)}</Text>
            </Box>
          ))}
        </Box>
      )
    }
    const factNode = (fact: HumanQueueFact, key: string): RenderChildren => {
      if (fact.shape === 'bars') {
        if (Svg === undefined) return null
        // Bars keep half the card wherever their labels and values fit there, rather than spread across the pane (the deck's rules).
        const room = cardWidth(e.props.bodyColumns) - 24
        const bars = evidenceBars(fact, evidenceBarsWidth(fact) <= room / 2 ? room / 2 : room)
        return <Svg source={bars.source} width={bars.width} height={bars.height} alt={bars.alt} />
      }
      if (fact.shape === 'table' || fact.shape === 'terms') {
        // One column a Box, so each column's cells line up whatever their widths; a column of numbers lines up on its right.
        const columns = fact.shape === 'table' ? fact.columns : ['', '']
        const rows = fact.shape === 'table' ? fact.rows : fact.terms.map(one => [one.term, one.meaning])
        return (
          <Box key={key} flexDirection="row" columnGap={2}>
            {columns.map((column, c) => {
              const numeric = rows.every(row => isNumber(row[c]!))
              return (
                <Box key={`${key}-col-${c}`} flexDirection="column" flexShrink={c === columns.length - 1 ? 1 : 0} alignItems={numeric ? 'flex-end' : 'flex-start'}>
                  {column === '' ? null : <Text dimColor {...caption}>{column}</Text>}
                  {/* Every cell white, only the header dim, so the values a claim rests on are never the dimmest data (#110's design review); a term's meaning stays dim beside it. */}
                  {rows.map((row, r) => <Text key={`${key}-${r}-${c}`} dimColor={fact.shape === 'terms' && c > 0} wrap="wrap" {...(numeric ? tabular : {})}>{row[c]}</Text>)}
                </Box>
              )
            })}
          </Box>
        )
      }
      return numberedLines(fact.lines, key)
    }
    const tile = (key: string, child: RenderChildren) => (
      // As narrow as it draws whole: the frame hugs its table or lines rather than stretch across the pane.
      <Box key={key} flexDirection="column" alignSelf="flex-start" borderStyle="round" borderColor={CARD_LINE} backgroundColor={FILL} paddingX={1}>
        {child}
      </Box>
    )
    const argumentBlocks: Block[] = (held.arguments ?? []).map((argument, i) => {
      const which = `argument-${i}`
      const href = `${fileOf(cwd)}#${which}`
      const isOpen = openQuote === which && argument.output !== undefined
      // A chip opens the call's lines only where they show more than the fact; else its name is plain, as a source that
      // fails loses its chip (#108). The claim is body text, so its chip keeps the link's full blue (#110's design review).
      const chip = argument.from === undefined ? '' : argument.output === undefined ? ` (${argument.from})` : ` ([${argument.from}](${href}))`
      return { node: (
        <Box key={`deck-${which}`} flexDirection="column" rowGap={1}>
          <Markdown key={`deck-${which}-claim`} text={`${argument.claim.replace(/[.!?]$/, '')}${chip}.`}
            pressableLinks={argument.output === undefined ? [] : [href]} onLinkPress={() => void update($, deckQuote, open => (open === which ? null : which))} />
          {/* Opened, a fact of lines gives way to the output around it, so no line shows twice. */}
          {isOpen ? tile(`deck-${which}-output`, numberedLines(argument.output!, `deck-${which}-out`)) : null}
          {argument.fact === undefined || (isOpen && argument.fact.shape === 'lines') ? null : tile(`deck-${which}-tile`, factNode(argument.fact, `deck-${which}-fact`))}
        </Box>
      ) }
    })
    // The band's grammar (#107): the question, then its options on dots, the recommended one first and green with its
    // reason under it. The answer is that option, so no line restates it (the owner, 2026-10-27: "Why is there two
    // things that basically say the same thing?").
    const decisionBlocks: Block[] = [
      { node: md('deck-question', `### ${held.headline}`) },
      { node: (
        <Box key="deck-options" flexDirection="column" paddingLeft={2}>
          {/* The reason hangs on the option's own text edge, in a column beside the dot. */}
          {/* The dot sits on the option's own line, not the middle of the option and its reason. */}
          <Box key="deck-recommended" flexDirection="row" columnGap={1} alignItems="flex-start">
            <Text color={RECOMMENDED}>●</Text>
            <Box flexDirection="column" flexShrink={1}>
              <Text wrap="wrap">{recommended}</Text>
              {/* With the arguments drawn, they are the reasons: a reason line would say them again (#110's design review). */}
              {held.reason === undefined || isFacts ? null : chipped('deck-reason', 'reason', held.reason)}
            </Box>
          </Box>
          {alternatives.map((option, i) => (
            <Box key={`deck-alt-${i}`} flexDirection="row" columnGap={1}>
              <Text dimColor>●</Text>
              <Text dimColor wrap="wrap">{option}</Text>
            </Box>
          ))}
        </Box>
      ) },
      // Why it matters follows the options, so nothing stands between the question and its answers.
      ...(isFacts ? argumentBlocks : held.why === undefined ? [] : [{ node: chipped('deck-why', 'why', held.why) }]),
      // What a yes starts, in place of a box that named the recommended option a second time (the owner, 2026-10-27, #107).
      ...(held.next === undefined ? [] : [{ node: (
        <Box key="deck-next" flexDirection="column">
          {/* Caption size, as a tile's title is drawn, so the label never reads as one more dim option. */}
          <Text dimColor {...(newProps ? { size: 'caption' as const } : {})}>Do this next</Text>
          <Text wrap="wrap">{held.next}</Text>
        </Box>
      ) }]),
      // The call's snapshot (issue 81): its options over the ADRs and code areas they touch; then the evidence.
      // The arguments are the call's evidence, so its snapshot and catalog pictures give way to them.
      ...(isFacts || shotBlock === null ? [] : [shotBlock]),
      ...(isFacts ? [] : pictureBlocks),
    ]
    // The tickets the reply names: a closed row each; ▸ opens its state, parent, labels and outline, ▸ again closes it.
    const ticketNode = (ticket: HumanQueueReplyTicket, state: HumanQueueTicketState | undefined, isOpen: boolean) => (
      <Box key={`deck-ticket:${ticket.key}`} flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Button
            key={`ticket-toggle:${ticket.key}`}
            plain
            dimColor
            label={`${isOpen ? '▾' : '▸'} ${ticket.label}`}
            onPress={() => void update($, ticketOpen, open => ({ ...open, [ticket.key]: open[ticket.key] !== true }))}
          />
          <Text wrap="wrap">{state?.card?.title ?? (state?.error ? 'could not be read' : 'reading…')}</Text>
        </Box>
        {isOpen && state !== undefined ? (
          <Box key={`deck-ticket-detail:${ticket.key}`} flexDirection="column" paddingLeft={4}>
            <Text dimColor wrap="wrap">{state.card?.detail ?? state.error ?? ''}</Text>
            {(state.card?.points ?? []).map((point, at) => (
              <Text key={`deck-ticket-point:${ticket.key}:${at}`} dimColor wrap="wrap">· {point}</Text>
            ))}
          </Box>
        ) : null}
      </Box>
    )
    const ticketBlocks: Block[] = replied.length === 0 ? [] : [
      { node: md('deck-tickets-head', `### ${replied.length === 1 ? '1 ticket' : `${replied.length} tickets`}`) },
      ...replied.map(ticket => {
        const state = cards[ticket.key]
        const isOpen = state !== undefined && openRows[ticket.key] === true
        return { node: ticketNode(ticket, state, isOpen) }
      }),
    ]
    // Each tab is one page that scrolls, never split into numbered pages (the owner, 2026-10-24).
    const sections = [
      { name: 'Decision', blocks: decisionBlocks },
      { name: 'Tickets', blocks: ticketBlocks },
    ].filter(section => section.blocks.length > 0)
    const pages = sections.map(section => ({ section: section.name, blocks: section.blocks }))
    const index = Math.max(0, Math.min(pages.length - 1, at.page))
    const page = pages[index]!
    const go = (i: number) => () => update($, deckPage, () => ({ page: Math.max(0, Math.min(pages.length - 1, i)), source: null }))
    return (
      <Box flexDirection="column" rowGap={1}>
        {/* A lone tab only repeats the pane's title: the row draws once there is a second to switch to (the owner, 2026-10-27). */}
        {sections.length < 2 ? null : (
          <Box key="deck-nav" flexDirection="row" columnGap={2} alignItems="center">
            {sections.map(section =>
              section.name === page.section
                ? <Box key={`deck-tab-${section.name}`}><Text color="suggestion">{section.name}</Text></Box>
                : <Button key={`deck-tab-${section.name}`} plain label={section.name} onPress={go(pages.findIndex(p => p.section === section.name))} />,
            )}
          </Box>
        )}
        <Box key={`deck-page-${index}`} flexDirection="column" rowGap={1}>{page.blocks.map(block => block.node)}</Box>
      </Box>
    )
  })

  // The Ticket pane: one issue, drawn as markdown, with a way out to GitHub.
  on('ui.render', { component: 'Pane', requestId: TICKET_PANE }, async ($, e) => {
    const { Box, Link, Markdown, Text } = $.ui.resolve(e)
    const page = await read($, ticketPage)
    if (page === null) return <Text dimColor>No ticket is open.</Text>
    const meta = [page.state.toLowerCase(), ...page.labels].filter(one => one !== '').join(' · ')
    const comments = page.comments
      .map(one => `---\n\n**${one.login === '' ? 'someone' : one.login}**\n\n${one.body.trim()}`)
      .join('\n\n')
    return (
      <Box flexDirection="column" rowGap={1}>
        <Box flexDirection="column">
          <Text bold color="suggestion" wrap="wrap">
            {shortKey(page.key)} {page.title}
          </Text>
          {meta === '' ? null : <Text dimColor>{meta}</Text>}
        </Box>
        <Markdown text={page.body.trim() === '' ? '_No description._' : page.body} />
        {comments === '' ? null : <Markdown text={comments} />}
        <Link href={page.url} label="Open on GitHub" />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const tree = await (async () => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Markdown, Text } = elements
    const Input = 'Input' in elements ? elements.Input : undefined
    const Client = 'Client' in elements ? elements.Client : undefined
    // The terminal's table answers 'Svg' too, with a stand-in that draws nothing, so the surface decides.
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined
    // The picture is 420 units wide and scales to the pane's width, so its height
    // in those units is the pane's height over its width, times 420, less what the
    // controls under it take. The pane reports only cells, so the cell's aspect is
    // measured off the owner's screenshots (about 2.4). A control row and its gap
    // take about 50 units, the comment field about 52 more.
    const CELL_ASPECT = 2.6
    const paneRows = Math.max(12, e.props.scroll.bodyRows)
    const pictureHeight = (reserve: number) => {
      const cols = Math.max(20, e.props.bodyColumns)
      return Math.round((420 * paneRows * CELL_ASPECT) / cols) - reserve - 8
    }
    // The screen is pinned to the pane's own rows: the controls below the picture
    // keep their height, and the picture's slot takes what is left and clips the
    // rest, so the pane never scrolls whatever the estimate above gets wrong. The
    // estimate leans tall on purpose; what it overshoots is open card, cut off.
    const picture = (screen: Screen, reserve: number, alt: string) =>
      Svg === undefined ? null : (
        <Box key="picture" flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden">
          <Svg key="screen" source={screenSvg(screen, pictureHeight(reserve))} alt={alt} />
        </Box>
      )
    const isPhone = e.surface === 'mobile'
    const hint = (key: string) => (isPhone ? '' : `  ${key}`)

    const body = await read($, text)
    const held = await read($, asks)
    const at = await read($, view)
    const now = await $.clock.now()
    const { open, request, item, index } = select(await openRequests($), at)
    const target = await read($, capture)
    const problem = await read($, github)
    const history = { undo: (await read($, undoStack)).length, redo: (await read($, redoStack)).length }
    const press = (action: Action) => (p: { surface: RenderSurface }) => act($, action, p.surface)
    const troubleText = problem === null ? null : `Issues labelled ${ASKS_LABEL} could not all be read: ${problem}`
    const trouble =
      troubleText === null ? null : (
        <Text key="github" dimColor>
          {troubleText}
        </Text>
      )
    // Answers on their way, or recently done, that are not pages of their own.
    const rows = Object.entries(held)
      .map(([key, ask]) => ({ key, ask, phase: phaseOf(key, ask, now) }))
      .filter(one => one.phase !== null && !WAITS_FOR_R.has(one.phase) && !(one.phase === 'done' && now - (one.ask.doneAt ?? 0) >= HIDE_MS))
    const submissions =
      rows.length === 0 ? null : (
        <Box flexDirection="column">
          {rows.map(one => (
            <Text key={`submission-${one.key}`} dimColor>
              {phaseLine(one.key, one.ask, one.phase as Phase)}
            </Text>
          ))}
        </Box>
      )
    const history_ = (
      <>
        <Button key="undo" label={`↶ Undo${hint('Q')}`} hotkey="q" dimColor={history.undo === 0} onPress={press('undo')} />
        <Button key="redo" label={`↷ Redo${hint('E')}`} hotkey="e" dimColor={history.redo === 0} onPress={press('redo')} />
      </>
    )

    if (request === undefined && Svg !== undefined) {
      return (
        <Box flexDirection="column" gap={1} height={paneRows}>
          {picture({ kind: 'empty', held: await undistilledCount($) }, 50, '✓ Nothing is waiting on you.')}
          <Box key="below" flexDirection="column" gap={1} flexShrink={0}>
            {submissions}
            {history.undo + history.redo === 0 ? null : <Box flexDirection="row" columnGap={1}>{history_}</Box>}
            {trouble}
          </Box>
        </Box>
      )
    }
    if (request === undefined) {
      const heldBackEmpty = await undistilledCount($)
      const isEmpty = body === '' && Object.keys(held).length === 0
      return (
        <Box flexDirection="column" gap={1}>
          {isEmpty ? (
            <>
              <Text bold>Nothing queued</Text>
              <Text dimColor>
                Agents add requests to {FILE} at the project root, or file issues labelled {ASKS_LABEL}. The
                vantage-point:ask skill shows them how.
              </Text>
            </>
          ) : (
            <>
              <Text bold color="success">
                ✓ Nothing is waiting on you.
              </Text>
              <Text dimColor>Finished requests stay in {FILE} as history; answered issues keep their rulings comment.</Text>
            </>
          )}
          {heldBackEmpty === 0 ? null : <Text dimColor>{`${heldBackEmpty} tickets held until an agent distills them into decisions.`}</Text>}
          {submissions}
          {history.undo + history.redo === 0 ? null : (
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {history_}
            </Box>
          )}
          {trouble}
        </Box>
      )
    }

    const project = await projectName($)
    const buckets = bucketsOf(open, project)
    // One repo's asks open on its first ask, but ← reaches the plate whatever the count.
    const onPlate = buckets.length > 0 && (at.zoom === 'plate' || (at.zoom === 'home' && buckets.length > 1))

    // The plate: zoomed out, one group per repo, each ask a click into it; nothing scrolls.
    if (onPlate && e.surface === 'desktop' && (await read($, cardMode)) === 'native' && Client !== undefined) {
      // Nothing scrolls: the groups get the pane's lines of text less the lines of notice and trouble, counted as they wrap.
      const plateRows = paneRows
      const now = await $.clock.now()
      const under = [...rows.map(one => phaseLine(one.key, one.ask, one.phase as Phase)), ...(troubleText === null ? [] : [troubleText])]
      return (
        <Box flexDirection="column" gap={1} height={plateRows}>
          {nativePlate(
            { Box, Text },
            {
              repos: buckets.map(bucket => ({
                name: bucket.name,
                asks: bucket.requests.map(r => ({
                  qid: qidOf(r),
                  id: r.issue !== undefined ? `#${r.issue.number}` : r.id === r.title ? '' : r.id,
                  title: plainQuote(r.title),
                  age: askAge(r.opened, now),
                  opened: r.opened,
                })),
              })),
              held: await undistilledCount($),
              waiting: await currentWaiting($),
              rows: plateRows - under.reduce((n, line) => n + lineRows(line, e.props.bodyColumns - 2) + 1, 0),
              columns: e.props.bodyColumns,
            },
            (key, props) => <Client key={key} width="100%" module="../panes/human-queue/plate-card.tsx" props={props} />,
            submissions,
            takesNewProps(await engineBase($)),
          )}
          {trouble}
        </Box>
      )
    }
    if (onPlate && Svg !== undefined) {
      return (
        <Box flexDirection="column" gap={1} height={paneRows}>
          {picture(
            {
              kind: 'plate',
              held: await undistilledCount($),
              buckets: buckets.map(bucket => ({
                name: bucket.name,
                asks: bucket.requests.length,
                next: plainQuote(bucket.requests[0]?.title ?? ''),
                done: bucket.requests.map(one => one.items.length > 0 && one.items.every(item => item.verdict !== null)),
              })),
            },
            50,
            `Your plate: ${open.length} ${open.length === 1 ? 'ask' : 'asks'} in ${buckets.length} ${buckets.length === 1 ? 'repo' : 'repos'}. ${buckets.map(bucket => `${bucket.name}: ${plainQuote(bucket.requests[0]?.title ?? '')}`).join('. ')}`,
          )}
          <Box key="below" flexDirection="column" gap={1} flexShrink={0}>
            <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
              {buckets.slice(0, 9).map((bucket, i) => (
                <Button
                  key={`bucket-${bucket.name}`}
                  label={`${i + 1} · ${bucket.name}`}
                  hotkey={String(i + 1)}
                  plain
                  onPress={() => showRequest($, qidOf(bucket.requests[0] as Request))}
                />
              ))}
            </Box>
            {submissions}
            {trouble}
          </Box>
        </Box>
      )
    }
    if (onPlate) {
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text bold>Your plate</Text>
            <Text dimColor>
              {`${open.length} ${open.length === 1 ? 'ask' : 'asks'} in ${buckets.length} ${buckets.length === 1 ? 'repo' : 'repos'}`}
            </Text>
          </Box>
          <Box flexDirection="column" gap={1}>
            {buckets.map((bucket, i) => (
              <Box key={`bucket-row-${bucket.name}`} flexDirection="row" alignItems="center" columnGap={1}>
                <Button
                  key={`bucket-${bucket.name}`}
                  label={i < 9 ? `${i + 1} · ${bucket.name}` : bucket.name}
                  hotkey={i < 9 ? String(i + 1) : undefined}
                  onPress={() => showRequest($, qidOf(bucket.requests[0] as Request))}
                />
                <Text backgroundColor="warning" color="inverseText" bold>
                  {` ${bucket.requests.length} `}
                </Text>
                <Text dimColor wrap="truncate-end">
                  {(bucket.requests[0] as Request).title.trim()}
                </Text>
              </Box>
            ))}
          </Box>
          {submissions}
          {trouble}
        </Box>
      )
    }

    const inBucket = buckets.length > 1 ? open.filter(r => bucketOf(r, project) === bucketOf(request, project)) : open
    const pages = Math.ceil(inBucket.length / PAGE_SIZE)
    const page = Math.min(Math.max(0, at.page ?? 0), pages - 1)
    const back =
      buckets.length > 0 ? (
        <Button
          key="plate"
          label={`‹ ${bucketOf(request, project)}${hint('Z')}`}
          hotkey="z"
          dimColor
          onPress={() => update($, view, v => ({ ...v, zoom: 'plate' as const }))}
        />
      ) : null
    const position = inBucket.findIndex(r => qidOf(r) === qidOf(request)) + 1
    const switcher = (
      <Box key="bar" flexDirection="column">
        <Box flexDirection="row" alignItems="center" columnGap={1}>
          {back}
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text dimColor wrap="truncate-end">{back === null ? bucketOf(request, project) : ''}</Text>
          </Box>
          <Text dimColor>{`${position} of ${inBucket.length}`}</Text>
        </Box>
        {inBucket.length > 1 ? (
          <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
            {inBucket.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r, i) => (
              <Button
                key={`request-${i + 1}`}
                label={String(page * PAGE_SIZE + i + 1)}
                hotkey={String(i + 1)}
                variant={qidOf(r) === qidOf(request) ? 'primary' : 'secondary'}
                onPress={() => showRequest($, qidOf(r))}
              />
            ))}
            {pages > 1 ? (
              <Button key="more" label={`more${hint('0')}`} hotkey="0" onPress={() => update($, view, v => ({ ...v, page: (page + 1) % pages }))} />
            ) : null}
          </Box>
        ) : null}
      </Box>
    )

    // A submitted issue waiting for R: where its answer stands, its rulings, and R.
    const ask = request.issue === undefined ? undefined : held[request.id]
    const phase = ask === undefined ? null : phaseOf(request.id, ask, now)
    if (ask !== undefined && phase !== null && WAITS_FOR_R.has(phase)) {
      const rulings = request.items
        .map(one => `- **${one.heading}**: ${one.verdict ?? '—'}${one.comment === null ? '' : ` — ${one.comment}`}`)
        .join('\n')
      return (
        <Box flexDirection="column" gap={1}>
          {switcher}
          <Box flexDirection="column">
            <Text bold>{label(request)}</Text>
            <Text key="phase" color="suggestion">
              {phaseLine(request.id, ask, phase)}
            </Text>
          </Box>
          {request.body === '' ? null : <Markdown text={request.body} dimColor />}
          {rulings === '' ? (request.note === null ? null : <Text italic>Note: {request.note}</Text>) : <Markdown text={rulings} />}
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            <Button
              key="send"
              label={`${phase === 'label' ? 'Retry the label' : phase === 'maybe' ? 'Check and send' : 'Send'}${hint('R')}`}
              hotkey="r"
              variant="primary"
              onPress={press('submit')}
            />
            {phase === 'unsent' ? <Button key="take-back" label="↶ Take back" onPress={() => takeBackUnsent($, request.id)} /> : null}
            {history_}
          </Box>
          {submissions}
          {trouble}
        </Box>
      )
    }

    if ((await read($, cardMode)) === 'native' && e.surface === 'desktop') {
      const target = draftKey({ request: qidOf(request), item: index, heading: item?.heading ?? null })
      const stored = (item === undefined ? request.note : item.comment) ?? ''
      const typing = await read($, commentTyping)
      // While you type, or while the field is empty, it is the desktop's own Input, drawn
      // straight in the pane, where it draws its own outline and full focus ring. The
      // desktop fixes its width (about 20 characters, whatever its container) and plugins
      // cannot change it. Its value is the stored comment, the same on every redraw, so a
      // redraw never moves the cursor; the draft lives in `drafts` until it is saved. A
      // saved comment at rest is text wrapped across the pane, and the Input keeps its
      // height on a click.
      // The rows a saved comment takes at rest, its frame's border included, which the
      // Input keeps on a click so the field never shrinks under the pointer.
      const restRows = stored === '' ? 1 : Math.min(6, Math.max(1, Math.ceil(stored.length / Math.max(1, (e.props.bodyColumns - 4) * 1.4)))) + 1
      const commentField =
        !typing && stored !== '' ? (
          Client === undefined ? null : <Client key="comment-rest" width="100%" module="../panes/human-queue/comment.tsx" props={{ text: stored }} />
        ) : Input === undefined ? null : (
          <Box key="comment-slot" minHeight={restRows}>
            <Input
              key="comment"
              placeholder={item === undefined ? 'Add a note for the agent' : 'Add a comment'}
              value={stored}
              submitLabel="Save"
              onInput={value => {
                drafts.set(target, value)
              }}
              onSubmit={async value => {
                // Enter saves the comment and hands the keys back to the verdicts.
                drafts.set(target, value)
                if (!(await flushDraft($))) return
                await update($, commentTyping, () => false)
                await $.ui.focus({ requestId: PANE, key: 'yes' }).catch(() => undefined)
              }}
            />
          </Box>
        )
      const card: NativeCard = {
        source: request.issue === undefined ? `${project} · ${FILE}` : `${request.issue.repo.split('/')[1] ?? request.issue.repo}#${request.issue.number}`,
        position: Math.max(1, position),
        of: inBucket.length,
        // An issue's key is its source line, so its title stands alone; a file request keeps its number.
        title: request.issue === undefined ? label(request) : request.title,
        setup: setupText(request),
        items: request.items.map(one => ({
          heading: one.heading,
          text: withoutPictures(one.body) || (picturesOf(one.body).length > 0 ? '' : '(empty item)'),
          verdict: one.verdict,
        })),
        index,
        columns: e.props.bodyColumns,
        rows: paneRows,
        resting: !typing && stored !== '',
        mono: takesNewProps(await engineBase($)),
      }
      // The card gets the rows the body leaves it: the back arrow and dots, the ask's title and setup above,
      // the comment and the buttons below. Lines are measured at about 7pt a character in the pane's width (#100).
      const lineRows = (text: string) => (text === '' ? 0 : Math.ceil((text.length * 7) / Math.max(140, (e.props.bodyColumns - 2) * 7.8)) + 1)
      // The item's pictures, under its text: the first drawn to the pane's width and at most
      // about half its height, the rest a count on the button that opens them all (issue 87).
      const shown = picturesFor(request, item)
      // A picture opens full size here, in the pane, never as a thumbnail or in another app (the owner, 2026-10-23, #102).
      const pictureKey = `${request.id}#${item?.index ?? 0}`
      const viewing = (await read($, composedView)).viewing
      const open = viewing?.item === pictureKey && viewing.index < shown.length ? viewing.index : null
      const view$ = (index: number | null) => void update($, composedView, v => ({ ...v, viewing: index === null ? null : { item: pictureKey, index } }))
      const root = await $.session.cwd()
      const states = shown.map(one => pictureOf($, one.url, root))
      const first = states[0]
      const room = Math.round(Math.max(20, e.props.bodyColumns - 2) * 7.8)
      // Every picture the item carries draws on the page, two to a row when there are several, so the
      // person sees them here rather than behind Open (the owner's ruling on #90, 2026-10-23).
      const across = shown.length > 1 ? 2 : 1
      const pictureRowsOf = Math.ceil(shown.length / across)
      const tall = Math.round((paneRows * 19 * 0.45) / Math.max(1, pictureRowsOf))
      const cell = across === 1 ? room : Math.floor((room - 10) / 2)
      const drawn = states.map(one => {
        if (typeof one === 'string') return null
        const size = fit(one.width, one.height, cell, tall)
        const source = pictureSvg(one.base64, size.width, size.height)
        return source === null ? null : { size, source }
      })
      // An image's alt text is its Svg's alone, never a caption under it; Full size shows it in the pane (#105).
      const fullSize = drawn.some(one => one !== null) ? <Button key="full-size" label="Full size" onPress={() => view$(Math.max(0, drawn.findIndex(one => one !== null)))} /> : null
      const pictureGrid =
        shown.length === 0 ? null : (
          <Box key="pictures" flexDirection="column" flexShrink={0} gap={1}>
            {Array.from({ length: pictureRowsOf }, (_, r) => (
              <Box key={`picture-row-${r}`} flexDirection="row" columnGap={1} alignItems="flex-start">
                {shown.slice(r * across, r * across + across).map((one, j) => {
                  const i = r * across + j
                  const d = drawn[i]
                  const state = states[i]
                  return (
                    <Box key={`picture-${i}`} flexDirection="column" width={across === 1 ? '100%' : '50%'} flexShrink={1}>
                      {d === null || d === undefined || Svg === undefined ? (
                        <Text key="picture-state" dimColor wrap="wrap">
                          {state === 'failed' ? `The picture could not load: ${one.alt || one.url}` : state === 'pending' ? 'Loading the picture…' : 'The picture is too large to draw here; Open shows it.'}
                        </Text>
                      ) : (
                        // The engine keeps no key on an Svg, so a Box carries it. A plain Svg, since an interactive one draws no bitmap.
                        <Box key="picture">
                          <Svg source={d.source} alt={one.alt} width={d.size.width} height={d.size.height} />
                        </Box>
                      )}
                      {/* Only a picture the pane cannot draw opens in another app; one it draws opens full size here (the owner, 2026-10-23). */}
                      {typeof state === 'object' && (d === null || d === undefined) ? (
                        <Box key="picture-open-row" flexDirection="row">
                          <Button key="picture-open" label="Open" onPress={() => void $.process.run(['open', state.file], { timeoutMs: 5000 }).catch(() => undefined)} />
                        </Box>
                      ) : null}
                    </Box>
                  )
                })}
              </Box>
            ))}
          </Box>
        )
      const composed = await composedOf($, e, item, 'desktop', pictureGrid === null ? null : { count: shown.length, node: pictureGrid }, fullSize)
      const body =
        Client === undefined ? null : composed === null ? (
          <Client key="body" width="100%" height="100%" module="../panes/human-queue/native-body.tsx" props={bodyProps(card)} />
        ) : (
          // The body keeps the dots alone; the composed card draws the item, with no title, ref or lead-in over it (#97, #105).
          <Client key="body" width="100%" module="../panes/human-queue/native-body.tsx" props={{ ...bodyProps(card), title: '', source: '', setup: '', heading: null, blocks: [] }} />
        )
      const pictureRow =
        pictureGrid === null || composed !== null ? null : (
          <Box key="pictures-slot" flexDirection="column" flexShrink={0} gap={1}>
            {pictureGrid}
            {fullSize === null ? null : (
              <Box key="picture-row" flexDirection="row">
                {fullSize}
              </Box>
            )}
          </Box>
        )
      const fullState = open === null ? undefined : states[open]
      const full =
        open === null || fullState === undefined || typeof fullState === 'string' || Svg === undefined
          ? null
          : (() => {
              const size = fit(fullState.width, fullState.height, room, Math.max(8, paneRows - (4 + lineRows(card.title) + 1 + lineRows(card.setup) + 5) - 4) * 19)
              const source = pictureSvg(fullState.base64, size.width, size.height)
              const step = (by: number) => () => view$((open + by + shown.length) % shown.length)
              return (
                <Box key="full-picture" flexDirection="column" flexShrink={0} gap={1}>
                  <Box key="full-nav" flexDirection="row" columnGap={1} alignItems="center">
                    <Button key="full-back" label="←" onPress={() => view$(null)} />
                    {shown.length > 1 ? <Button key="full-prev" label="◀" onPress={step(-1)} /> : null}
                    {shown.length > 1 ? <Button key="full-next" label="▶" onPress={step(1)} /> : null}
                    <Text key="full-of" dimColor>
                      {shown.length > 1 ? `${open + 1} of ${shown.length}` : ''}
                    </Text>
                  </Box>
                  {source === null ? (
                    <Text key="full-state" dimColor wrap="wrap">
                      The picture is too large to draw here.
                    </Text>
                  ) : (
                    <Box key="full-svg">
                      <Svg source={source} alt={shown[open]!.alt} width={size.width} height={size.height} />
                    </Box>
                  )}
                </Box>
              )
            })()
      const pressed = (action: Action) => (p: { surface: RenderSurface }) => void pressNative($, action, p.surface, 'button')
      return nativeCard(
        { Box, Text, Button },
        card,
        {
          yes: pressed('yes'),
          no: pressed('no'),
          r: pressed('submit'),
          back: pressed('prev'),
          next: pressed('next'),
          ...(buckets.length > 0 ? { plate: () => void update($, view, v => ({ ...v, zoom: 'plate' as const })) } : {}),
        },
        body,
        commentField,
        full ?? pictureRow,
        full === null ? composed : null,
      )
    }

    if (Svg !== undefined) {
      const screenRequest: ScreenRequest = {
        title: plainQuote(request.title),
        where: request.issue === undefined ? FILE : `${request.issue.repo.split('/')[1] ?? request.issue.repo}#${request.issue.number}`,
        setup: setupText(request),
        note: request.note,
        items: request.items.map(one => ({
          index: one.index,
          heading: one.heading,
          text: plainQuote(one.body.replace(/\s+/g, ' ').trim()) || '(empty item)',
          verdict: one.verdict,
          comment: one.comment,
        })),
      }
      const here: Target = { request: qidOf(request), item: index, heading: item?.heading ?? null }
      const slim = (key: string, label: string, hotkey: string, action: Action) => (
        <Button key={key} label={label} hotkey={hotkey} plain onPress={press(action)} />
      )
      const saved = (item === undefined ? request.note : item.comment) ?? ''
      const isDrafting = await read($, drafting)
      const isExpanded = isDrafting || saved !== ''
      const captureLine =
        target === null
          ? null
          : `Your next message becomes the comment on ${target.heading === null ? `request ${sourceOf(target.request).id}` : `${sourceOf(target.request).id} · item ${target.heading}`}.`
      // Back to the plate, as the native card leads back (issue 52), plain like the rest of this card's
      // controls; its row costs the picture one control row.
      const toPlate =
        buckets.length > 0 ? (
          <Box key="to-plate" flexShrink={0}>
            <Button key="plate" label="←" plain onPress={() => update($, view, v => ({ ...v, zoom: 'plate' as const }))} />
          </Box>
        ) : null
      // The phone draws an item with facts as its composed card, from what the phone can draw (#97).
      const phoneParts = isPhone ? await composedOf($, e, item, 'phone') : null
      const composedPhone = phoneParts
      return (
        <Box flexDirection="column" gap={1} height={paneRows}>
          {toPlate}
          {composedPhone !== null ? (
            <Box key="composed-slot" flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden">
              {composedPhone}
            </Box>
          ) : picture(
            {
              kind: 'ask',
              bucket: bucketOf(request, project),
              position: Math.max(1, inBucket.findIndex(r => qidOf(r) === qidOf(request)) + 1),
              of: inBucket.length,
              request: screenRequest,
              slide: index,
            },
            (Input === undefined ? 50 : 102) + (toPlate === null ? 0 : 50),
            `${label(request)}. ${item !== undefined ? `Item ${index} of ${counts(request).total} · ✓ ${counts(request).yes} · ✗ ${counts(request).no} · ${counts(request).unruled} left. ${screenRequest.setup} ${screenRequest.items[index - 1]?.text ?? ''}` : `Plain ask. ${screenRequest.setup}`}`,
          )}
          <Box key="below" flexDirection="column" gap={1} flexShrink={0}>
            {/* Two columns. The left stacks the comment field over the ruling row, and
                the ruling row sets its width: the field fills it (minWidth 100%, width 0
                so it adds nothing of its own), so save ends where Submit ends. While the
                field holds text the column grows to the pane's width. The right column
                holds undo and redo, level with the field. */}
            <Box key="controls" flexDirection="row" columnGap={2}>
              <Box key="controls-main" flexDirection="column" gap={1} flexGrow={isExpanded ? 1 : 0} flexShrink={1} minWidth={0}>
                {Input === undefined ? null : (
                  <Box key="comment-slot" width={0} minWidth="100%">
                    <Input
                      key="comment"
                      label={item === undefined ? 'Note' : 'Comment'}
                      placeholder="Tab to comment"
                      value={saved}
                      submitLabel="save"
                      onInput={value => {
                        const typing = value !== saved
                        if (typing !== isDrafting) void update($, drafting, () => typing)
                      }}
                      onSubmit={async value => {
                        await saveComment($, here, value).catch(error => {
                          if (!(error instanceof QueueError)) throw error
                          $.ui.toast(error.message)
                        })
                        await update($, drafting, () => false)
                        await $.ui.focus({ requestId: PANE, key: item === undefined ? 'done' : 'yes' }).catch(() => undefined)
                      }}
                    />
                  </Box>
                )}
                <Box key="slim" flexDirection="row" columnGap={1} alignItems="center">
                  {request.items.length === 0 ? slim('done', 'Done', 'w', 'yes') : null}
                  {request.items.length === 0 ? null : slim('no', 'No', 's', 'no')}
                  {request.items.length === 0 ? null : slim('yes', 'Yes', 'w', 'yes')}
                  {request.items.length === 0 ? null : slim('prev', '◀', 'a', 'prev')}
                  {request.items.length === 0 ? null : slim('next', '▶', 'd', 'next')}
                  {request.items.length === 0 ? null : slim('submit', 'Submit', 'r', 'submit')}
                  {isPhone ? <Button key="comment-button" label="Comment" onPress={press('comment')} /> : null}
                </Box>
              </Box>
              {isExpanded ? null : <Box key="controls-gap" flexGrow={1} />}
              <Box key="history" flexDirection="column" gap={1} flexShrink={0}>
                <Box key="history-row" flexDirection="row" columnGap={1} alignItems="center" flexGrow={1}>
                  {slim('undo', '↶', 'q', 'undo')}
                  {slim('redo', '↷', 'e', 'redo')}
                </Box>
                <Box key="history-under" height={1} />
              </Box>
            </Box>
            {captureLine === null ? null : (
              <Box flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
                <Text color="suggestion">{captureLine}</Text>
                <Button key="cancel-capture" label="Cancel" onPress={() => update($, capture, () => null)} />
              </Box>
            )}
            {submissions}
            {trouble}
          </Box>
        </Box>
      )
    }

    const tally = counts(request)
    const isLive = canSubmit(request, index)
    const where = request.issue === undefined ? FILE : `${request.issue.repo.split('/')[1] ?? request.issue.repo}#${request.issue.number}`
    const progress = (
      <Text key="progress" dimColor>
        {item === undefined
          ? [request.opened === null ? null : `Opened ${request.opened}`, 'Plain ask'].filter(Boolean).join(' · ')
          : `Item ${index} of ${tally.total} · ✓ ${tally.yes} · ✗ ${tally.no} · ${tally.unruled} left`}
      </Text>
    )
    const header = <Text bold wrap="truncate-end">{label(request)}</Text>
    const CARD_CHARS = 320
    const capped = (text: string) => (text.length > CARD_CHARS ? `${text.slice(0, CARD_CHARS).trimEnd()}…` : text)
    const cardText = capped(plainQuote(item !== undefined ? item.body || '(empty item)' : request.issue === undefined ? request.body : ''))
    const verdictColor = item?.verdict === 'yes' ? 'success' : item?.verdict === 'no' ? 'error' : 'subtle'
    const state = item === undefined ? 'To do' : item.verdict === 'yes' ? 'Yes' : item.verdict === 'no' ? 'No' : 'Not ruled'
    const card = (
      item === undefined && cardText === '' ? null : <Box key="card" flexDirection="column" height={9} overflow="hidden" borderStyle="round" borderColor={verdictColor} paddingX={1} gap={1}>
        <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
          <Text dimColor wrap="truncate-end">
            {item === undefined ? 'Plain ask' : `#${index} of ${tally.total}${item.heading === String(item.index) ? '' : ` · ${item.heading}`}`}
          </Text>
          <Text dimColor={verdictColor === 'subtle'} color={verdictColor === 'subtle' ? undefined : verdictColor}>
            {state}
          </Text>
        </Box>
        {Client !== undefined && item !== undefined ? (
          <Client key="card" module="../panes/human-queue/card.tsx" props={{ text: cardText }} />
        ) : (
          <Text wrap="wrap">{cardText}</Text>
        )}
        {item?.comment == null ? null : <Text italic dimColor>{`"${item.comment}"`}</Text>}
      </Box>
    )

    const here: Target = { request: qidOf(request), item: index, heading: item?.heading ?? null }
    const field =
      Input === undefined ? null : (
        <Input
          key="comment"
          label={item === undefined ? 'Note for the agent' : 'Comment'}
          placeholder={item === undefined ? 'Note for the agent. Enter saves.' : 'Why yes or no, or what to change. Enter saves.'}
          value={(item === undefined ? request.note : item.comment) ?? ''}
          submitLabel="save"
          onSubmit={async value => {
            await saveComment($, here, value).catch(error => {
              if (!(error instanceof QueueError)) throw error
              $.ui.toast(error.message)
            })
            await $.ui.focus({ requestId: PANE, key: item === undefined ? 'done' : 'yes' }).catch(() => undefined)
          }}
        />
      )

    const listening =
      target === null ? null : (
        <Box flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
          <Text color="suggestion">
            Your next message becomes the comment on{' '}
            {target.heading === null
              ? `request ${sourceOf(target.request).id}`
              : `${sourceOf(target.request).id} · item ${target.heading}`}
            .
          </Text>
          <Button key="cancel-capture" label="Cancel" onPress={() => update($, capture, () => null)} />
        </Box>
      )

    const nav = (key: string, text: string, hotkey: string, action: Action) => (
      <Button key={key} label={`${text}${hint(hotkey.toUpperCase())}`} hotkey={hotkey} plain dimColor onPress={press(action)} />
    )
    const actions = (
      <Box key="actions" flexDirection="row" flexWrap="wrap" columnGap={1} alignItems="center">
        {item === undefined ? (
          <Button key="done" label={`✓ Done${hint('W')}`} hotkey="w" variant="primary" onPress={press('yes')} />
        ) : (
          <>
            <Button key="no" label={`✗ No${hint('S')}`} hotkey="s" variant={item.verdict === 'no' ? 'primary' : 'secondary'} onPress={press('no')} />
            <Button key="yes" label={`✓ Yes${hint('W')}`} hotkey="w" variant={item.verdict === 'no' ? 'secondary' : 'primary'} onPress={press('yes')} />
            {nav('prev', '◀', 'a', 'prev')}
            {nav('next', '▶', 'd', 'next')}
          </>
        )}
        {nav('undo', 'Undo', 'q', 'undo')}
        {nav('redo', 'Redo', 'e', 'redo')}
        {isPhone ? <Button key="comment-button" label="Comment" dimColor onPress={press('comment')} /> : null}
        {item === undefined ? null : (
          <Button
            key="submit"
            label={isLive ? `Submit all${hint('R')}` : `Submit · ${tally.unruled} left${hint('R')}`}
            hotkey="r"
            variant={isLive ? 'primary' : 'secondary'}
            dimColor={!isLive}
            onPress={press('submit')}
          />
        )}
      </Box>
    )
    const heldBack = await undistilledCount($)

    return (
      <Box flexDirection="column" gap={1}>
        {switcher}
        {progress}
        {header}
        {card}
        {listening}
        {field}
        {actions}
        <Text dimColor wrap="truncate-end">{`Goes to ${where}${heldBack === 0 ? '' : ` · ${heldBack} tickets held until distilled`}`}</Text>
        {submissions}
        {trouble}
      </Box>
    )
    })()
    // A tree the desktop refuses is no failure the .catch below hears.
    const why = refusal(tree)
    return why === null ? tree : failedPane($, e, why)
  }).catch(($, e, next) => failedPane($, e, next.error.message ?? next.error.kind))
}

/**
 * The queue pane when it fails to draw, or draws a tree the desktop refuses: the
 * desktop would show its own "has not drawn" with no way out (spell-hotbar-ng#12),
 * so this says why and leads back to the overview.
 */
function failedPane($: $, e: RenderInput<'Pane'>, why: string) {
  const { Box, Button, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column" gap={1}>
      <Text key="failure" color="error" wrap="wrap">{`This ask could not be drawn: ${why}`}</Text>
      <Button key="plate" label="‹ Back to the overview" variant="primary" onPress={() => update($, view, v => ({ ...v, zoom: 'plate' as const }))} />
    </Box>
  )
}
