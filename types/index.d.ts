/**
 * Which request and item the pane shows, and which page of the request
 * buttons. Every request id the pane keeps is qualified by where the request
 * lives: `file:<id>` for human-queue.md, `issue:<owner/name#n>` for an issue.
 */
export type HumanQueueView = {
  request: string | null
  item: number
  page?: number
  /**
   * `plate`: the zoomed-out first page, one bucket per repo. `bucket`, or
   * absent: one request, among its own repo's. `home`: the plate when more
   * than one repo waits, else the bucket, decided as the asks are drawn.
   * /vantage-point and the band open home; the card's ← opens the plate
   * whatever the count; the review tool opens a request in its bucket.
   */
  zoom?: 'plate' | 'bucket' | 'home'
}

/** The item (or plain ask) the next chat message becomes the comment of. */
export type HumanQueueCapture = { request: string; item: number; heading: string | null } | null

/** The field lines a submit changes, as written (null: the line was absent). */
export type HumanQueueSubmitLines = { status: string | null; completed: string | null }

/** One change `Q` takes back and `E` puts again: the lines as they were and became. */
export type HumanQueueUndo =
  | { kind: 'ruling'; request: string; item: number; heading: string; before: string | null; after: string | null }
  | { kind: 'note'; request: string; before: string | null; after: string | null }
  | { kind: 'submit'; request: string; before: HumanQueueSubmitLines; after: HumanQueueSubmitLines }
  /** A to-do card's press (#147): handed to an agent, or closed as done; undo moves the issue back. */
  | { kind: 'todo'; request: string; move: 'agent' | 'done' }

/**
 * Matt Pocock's triage brief on an issue, read as loosely as it was written
 * (#147): a field the brief lacks is null or empty, never an error.
 */
export type HumanQueueBrief = {
  summary: string | null
  /** Why it needs a person, the brief's text alone, its first letter raised: `It is your voice, and no agent can record it.` */
  reason: string | null
  criteria: { text: string; done: boolean }[]
}

/** What an issue's to-do card draws (#147): its trusted brief, else its body's opening. */
export type HumanQueueTodo = { brief: HumanQueueBrief | null; opening: string }

/** What a request filed as an issue carries for grouping: the issue, its labels, its parent spec, its kind. */
export type HumanQueueIssueMeta = {
  /** `owner/name`. */
  repo: string
  number: number
  url: string
  /** Label names, as GitHub lists them. */
  labels: string[]
  /** The parent spec as `owner/name#n`, by the links the repository's conventions name: the sub-issue parent, else a trusted author's `Part of #n` line; null with neither. */
  parent: string | null
  /** `items` when an `## Asks` section holds items to rule on, `plain` when the issue is a plain ask. */
  kind: 'items' | 'plain'
  /** What its to-do card draws, when it has nothing that stands alone to rule on; absent on an ask held from before #147 until it is read again. */
  todo?: HumanQueueTodo
}

/** One open issue labelled ready-for-human, read as a request. */
export type HumanQueueIssue = {
  /** `owner/name#n`: the request's id. */
  key: string
  /** The issue's title, for the person: no agent hears it unless `trusted` (issue 149). */
  title: string
  /** Whether the issue's author passed `trusted`: only then do the body's asks count and the title reach an agent. */
  trusted: boolean
  /** GitHub's updatedAt; a change means the issue is read again. */
  updatedAt: string
  /** GitHub's createdAt: the pane lists issues oldest first. */
  createdAt: string | null
  /** The markdown shown above the items: the Asks section's prose, or the whole body of a plain ask. */
  instructions: string
  /** The request in the queue's grammar, unruled: the draft a refresh starts from. */
  base: string
  meta: HumanQueueIssueMeta
}

/**
 * One submit of an issue's rulings. Only the session where the person pressed
 * Submit sends it, once its undo window has passed; whatever that session
 * leaves unsent waits for the person to press Send in the pane. Nothing posts on its own.
 */
export type HumanQueueSubmission = {
  /** Stable for this submit; the comment carries it as a marker. */
  id: string
  /** `owner/name#n`. */
  target: string
  /** The gh login the person ruled as: the comment's only acceptable author. */
  login: string
  /** The ask's revision (title, prose and items) the rulings answer. */
  revision: string
  /** The comment, fixed at submit time. */
  body: string
  /** The session whose undo window this is. */
  session: string
  /** When that undo window ends. */
  dueAt: number
  /**
   * `waiting`: in its session's undo window. `sending`: its POST was under
   * way. `unsent`: never sent (its session ended, or a check before the POST
   * failed): Send posts it. `ambiguous`: the POST failed or its answer was lost,
   * so it may have landed: Check and send looks before posting. `posted`: on the issue.
   */
  state: 'waiting' | 'sending' | 'unsent' | 'ambiguous' | 'posted'
  /** When the POST was tried, for `sending` and `ambiguous`. */
  triedAt: number | null
  commentUrl: string | null
  /** `kept`: the ask changed after it was answered, so the repository's waiting label stays on. */
  label: 'pending' | 'removed' | 'kept'
  /** Once the waiting label is off by this submit: whether it was swapped for the ready label or removed, and `missing` the ready label the repository lacks. */
  moved?: { kind: 'swap'; waiting: string; ready: string } | { kind: 'remove'; waiting: string; missing: string | null }
  /** The last step's failure, shown until a step succeeds. */
  error: string | null
}

/** An issue request as the pane holds it and saves it to disk. */
export type HumanQueueAsk = {
  issue: HumanQueueIssue
  /** `issue.base` with the person's Ruling, Note, Status and Completed lines. */
  text: string
  /** Present from submit until the answer is done; null while the person rules. */
  submission: HumanQueueSubmission | null
  /** When the answer finished: the request stays hidden while search catches up. */
  doneAt: number | null
  /** Bumped by every save; a save lands only over the revision it read. */
  rev: number
}

/** The ticket this session's agent is building, read off the session's branch; null on any other branch. */
export type HumanQueueAgentNext = {
  key: string; kind: 'ticket' | 'spec'; title: string; gist: string; url: string
  stage: string | null
  status: 'Moving' | 'Waiting on you' | 'Paused' | 'Done' | null
  progress: { closed: number; total: number } | null
  /** The issue's native parent as `owner/name#n`; null when it has none. */
  parent: string | null
  /** Whether the signed-in login opened the issue: only then may its title reach an agent (issue 149). */
  isTrusted: boolean
} | null

/** The observed branch context: an unreadable ticket is not an Idle session. */
export type HumanQueueAgentBranch = { state: 'unknown' | 'none' | 'ticket'; key: string | null; branch: string | null }

/**
 * The Reader while it holds the band (issue #35): which read, whether it
 * plays, and the stretch of beats its picture animates. The beats themselves
 * stay in the hooks module under `id`.
 */
export type HumanQueueReading = {
  id: number
  phase: 'playing' | 'paused'
  /** The first beat on screen: the chunk's first while playing, the held word while paused. */
  from: number
  /** One past the chunk's last beat. */
  to: number
  /** The clock, in ms, when the chunk began to play. */
  at: number
  /** How many beats the read has. */
  count: number
  /** The pace the beats were timed at, in words a minute. */
  wpm: number
} | null

/** A cell's tone in a declared decision: advantage, a tradeoff, or neither. */
export type HumanQueueDecisionTone = 'advantage' | 'tradeoff' | 'neutral'

/** The decision this session's agent declared for the reply row. */
export type HumanQueueDecision = {
  headline: string
  ask: string
  options: string[]
  dimensions: string[]
  /** `cells[dimension][option]`. */
  cells: { value: string; tone: HumanQueueDecisionTone }[][]
  /** Index into `options`. */
  recommend: number
  /** What pressing each option sends as the person's prompt, by index; absent, the option's own words. */
  sends?: string[]
  /** A permission ask's call (`callKey`): pressing the first option lets it run once when the agent repeats it. */
  grant?: string
  /**
   * Each option's page in the Decision pane (#134), by option index: what the option is, then the
   * diagrams that make its case. Absent where the fork wrote none; that option's tab draws its cells.
   */
  pages?: (HumanQueueOptionPage | null)[]
  /** The fork's visuals for this asked question stopped short (#160); the pane says so. */
  visualsFailed?: boolean
}
/** One option's page (#134): a sentence on what it is, then its diagrams, each titled with the point it makes. */
export type HumanQueueOptionPage = { what: string; diagrams: HumanQueueDiagram[] }
/**
 * What a diagram argues: why (or why you'd pick it), how it works, who does the work, what the agent
 * controls, why the agent passed it over, or what could go wrong.
 */
export type HumanQueueDiagramPoint = 'why' | 'how' | 'work' | 'control' | 'passed' | 'risk'
/** One diagram: its title is the point it makes, `says` the sentence under it, `terms` the words it explains. */
export type HumanQueueDiagram = {
  point: HumanQueueDiagramPoint
  title: string
  draw: HumanQueueDiagramDraw
  says?: string
  terms?: { term: string; meaning: string }[]
}
/**
 * A diagram's picture. bars: values to compare, the one the point is about lit; route: stages left to
 * right, each one or more alternatives, the option's own path lit; work: the minutes each side spends;
 * lines: short statements; risk: what could go wrong and the fallback if it does.
 */
export type HumanQueueDiagramDraw =
  | { shape: 'bars'; rows: { label: string; value: number; unit?: string; lit?: boolean }[] }
  | { shape: 'route'; stages: { name: string; note?: string; lit?: boolean }[][] }
  | { shape: 'work'; rows: { who: 'me' | 'you'; minutes: number; plus?: string }[] }
  | { shape: 'lines'; lines: { text: string }[] }
  | { shape: 'risk'; risks: { risk: string; why?: string; fallback: string }[] }
/** The option tab the Decision pane shows, and the question it was picked on: another question opens on its recommendation. */
export type HumanQueueDeckPage = { tab: number; ask: string }
/** A successful GitHub observation and whether its latest refresh failed. Unknown is not zero. */
export type HumanQueueCountObservation = { value: number | null; at: number | null; stale: boolean }

/** The task this session's agent last declared through the task tool; shown when no ticket branch names one. */
export type HumanQueueTask = { title: string; detail: string } | null

/** One step of the agent's task list, as its update_plan calls left it (issue 104). */
export type HumanQueueStep = { text: string; status: 'pending' | 'in_progress' | 'completed' }

/** A page of the palette specimen (`/vantage-point palette`): one element of the desktop's table each. */
export type HumanQueuePalettePage = 'text' | 'type' | 'colour' | 'button' | 'field' | 'border' | 'hover' | 'svg' | 'rich' | 'pointer'

/** The palette specimen's pane: its page, and what was last pressed, typed or picked in it. */
export type HumanQueuePalette = { page: HumanQueuePalettePage; log: string[]; input: string; select: string }

/** A page of the mock album behind `/vantage-point album` (hooks/album.tsx). */
export type HumanQueueAlbumPage =
  | 'before' | 'tiles' | 'outcomes' | 'blocks' | 'mermaid-flow' | 'units' | 'threshold' | 'what-if' | 'tree' | 'sankey'
  | 'flow' | 'animated' | 'sequence' | 'timeline' | 'process' | 'reveal' | 'dumbbell' | 'table' | 'ledger' | 'sources' | 'glossary' | 'type' | 'cost'
  | 'graph' | 'floor' | 'card-2' | 'card-4' | 'context'

/** The mock album's page, and the window its what-if page scores on. */
export type HumanQueueAlbum = { page: HumanQueueAlbumPage; scenario: 'set-aside' | 'all' }

/** One of this session's subagents as the band's subagents row keeps it (issue #22). */
export type HumanQueueSubagent = { id: string; description: string; type: string; status: string; parentId?: string }

/** What the hooks saw of a subagent: its model and effort, its time, its tokens, its tool now. */
export type HumanQueueSubagentMeta = {
  model?: string
  effort?: string
  startedAt: number
  endedAt?: number
  outTokens: number
  context: number
  tool?: string
  toolAt?: number
}

/** One background task this session's agent started (issue 126): a backgrounded shell, a monitor, kept after it ends. */
export type HumanQueueBackground = { id: string; tool: string; description: string; command?: string; status: string; startedAt: number; endedAt?: number }

/**
 * A desktop session this session started (issue 129): its `local_<id>`, its title, its model when
 * known, whether its turn runs, and when it started and its transcript was last written.
 */
export type HumanQueueChildSession = { local: string; title: string; model?: string; status: 'running' | 'idle' | 'archived'; startedAt: number; touchedAt: number }

/** The ticket the Ticket pane shows, as gh read it when the pane opened. */
export type HumanQueueTicketPage = {
  key: string
  title: string
  url: string
  state: string
  labels: string[]
  body: string
  comments: { login: string; body: string }[]
} | null

/** The issues ready for an agent, as the agent's zoomed-out pane last read them; null before it opens. */
/** This project's frontier as last read: unknown before a read, failed with why, or read. */
export type HumanQueueFrontier =
  | { state: 'unknown' }
  | { state: 'failed'; reason: string }
  | { state: 'read'; repo: string; frontier: HumanQueueFrontierRead }
/** One frontier read; the same shape as hooks/frontier.ts's Frontier. */
export type HumanQueueFrontierRead = {
  items: { number: number; title: string; state: 'waiting' | 'accepting' | 'active' | 'ready' | 'blocked' | 'shaping' | 'parked' | 'open' }[]
}
export type HumanQueueReady = { key: string; repo: string; number: number; title: string; createdAt: string }[] | null

/** A ticket the session's last reply names in this project's repositories; `repo` is resolved, `label` is what the row says. */
export type HumanQueueReplyTicket = { key: string; repo: string; number: number; label: string }
/** A ticket as the deck draws it: its title, one detail line, and an outline of up to five points. */
export type HumanQueueTicketCard = { title: string; detail: string; points: string[] }
/** What the deck knows of one reply's ticket: its card, or why gh could not read it. */
export type HumanQueueTicketState = { card: HumanQueueTicketCard | null; error: string | null }

/** One transcript's prompt cache as the last scan of `~/.claude/projects` found it (issue #50). */
export type HumanQueueCache = {
  /** The transcript's path: the cache's identity. */
  file: string
  kind: 'session' | 'subagent'
  /** The folder's name, or `repo ⎇ worktree` for a worktree under `.claude/worktrees`. */
  project: string
  title: string
  /** The model without its `claude-` prefix. */
  model: string
  /** The TTL the last cache write took, as its usage reports it. */
  ttl: '5m' | '1h'
  /** The last request: the entry written before the last response, the prompt or tool result that sent it. */
  lastAt: number
  /** When the transcript was last written. */
  touchedAt: number
  expiresAt: number
  /** Tokens the next request sends: what re-caching would write once cold. */
  prefix: number
  /** Over every request in the transcript, the input tokens read from the cache. */
  read: number
  /** Over every request in the transcript, every input token sent: uncached, read and written. */
  sent: number
  /**
   * The desktop session that holds the transcript, or its parent's for a subagent (issue #62):
   * its `local_<id>`, whether it is archived, whether a pull request of its merged, and the
   * session that started it. Absent when the desktop knows none.
   */
  desk?: { local: string; archived: boolean; merged: boolean; parent?: string }
}

/**
 * An item's plan (#97), as panes/visuals/compose.ts's `Plan`: this contract
 * imports nothing, so the shape is repeated, and the atom's reads and writes in
 * register.tsx fail to type-check if the two drift.
 */
export type HumanQueuePlan = {
  item: string
  source: 'jev' | 'prior'
  model: string | null
  why: string | null
  views: { view: string; slot: 'lead' | 'support'; yes: number | null; score: number }[]
  answers: string[]
  textAlone: number | null
}

/** The composed card's state (#97): the item whose prose is open, null for none, and each item's what-if scope. */
/** The composed page's view: the item whose prose is open, each item's what-if scope, and the picture open full size, by item and index (#102). */
export type HumanQueueComposedView = { prose: string | null; scopes: Record<string, number>; viewing?: { item: string; index: number } | null }

/** The visuals-grading round (#98): the ask shown, each ask's pick and comment by case id, the option whose text is open, and whether the picks were sent. */
export type HumanQueueGrading = { at: number; picks: Record<string, { pick: string; comment?: string }>; prose: string | null; sent: boolean }

/**
 * What the tour's setup lines say: the system, gh with its login and version, and whether this folder has a
 * human-queue.md, and which conventions are in force. `platform` is `unknown` and `gh` is `unknown` until the tour has read them; `ghVersion`
 * is the `X.Y.Z` `gh --version` printed, null when it printed none.
 */
export type VantageTourSetup = {
  /** `windows-no-bash`: Windows without Git for Windows, which runs the large-transcript read and the picture fetch (issue 152). */
  platform: 'macos' | 'windows' | 'windows-no-bash' | 'other' | 'unknown'
  gh: 'signed-in' | 'signed-out' | 'missing' | 'unknown'
  ghVersion: string | null
  login: string | null
  queueFile: boolean
  /**
   * The conventions files in force for this folder's repository (issue 155), nearest first, and each field a
   * file set that failed its check; absent until the tour has read them, and in a setup an older build stored.
   */
  conventions?: { files: ('repo' | 'triage' | 'person')[]; problems: { file: 'repo' | 'person'; field: string; reason: string }[] }
}

/**
 * The session banner's state (issue 119), as panes/banner's `Edited`, `Governing` and `Placed`:
 * this contract imports nothing, so the shapes are repeated, and register.tsx fails to
 * type-check if they drift.
 */
export type HumanQueueEdited = { path: string; added: number; removed: number; lastAt: number }
/** `slug` and `accepted` are absent from an ADR a session recorded before the banner read them. */
export type HumanQueueGoverning = { n: number; key: string; slug?: string; title: string; accepted?: boolean }
export type HumanQueueBannerPlaced = { width: number; height: number; at: Record<string, { x: number; y: number; w: number; r: number }>; left: string[]; cols: [key: string, lo: number, hi: number][] }

/** The kinds of cache the Caches pane's filter can leave out. */
export type HumanQueueCacheFilter = { cold: boolean; children: boolean; merged: boolean; archived: boolean }

declare module 'claude-code' {
  interface PluginState {
    'vantage-point': {
      /** human-queue.md as last read; '' while it does not exist. */
      text: string
      view: HumanQueueView
      capture: HumanQueueCapture
      /** True while the comment field holds unsaved typing: the field widens for it. */
      drafting: boolean
      /** How the desktop draws the item: the SVG picture, or the native card prototype (issue #45). */
      cardMode: 'picture' | 'native'
      /** The keyboard is in the native card's comment field. */
      /** The sessions whose queue pane has its comment field open (each its own). */
      commentOpenIn: string[]
      undo: HumanQueueUndo[]
      /** What `Q` took back, for `E` to put again; a new change clears it. */
      redo: HumanQueueUndo[]
      /** Requests an agent opened through the review tool in this session; it is handed the rulings right after they post. */
      notify: string[]
      /** Fresh agents that took a cold session's rulings (issue 66): each one's report is dropped, not handed to the session. */
      fresh: string[]
      /** Open ready-for-human issues across the owner's repositories, by `owner/name#n`. */
      asks: Record<string, HumanQueueAsk>
      /** Why the last read of the issues failed (gh missing, signed out, offline); null when it worked. */
      github: string | null
      /** The ticket this session's agent is building; null off a ticket or spec branch, or when gh could not read it. */
      agent: HumanQueueAgentNext
      /** The branch's observed ticket identity; unknown until git can be read. */
      agentBranch: HumanQueueAgentBranch
      /** The session's repository as `owner/name`, read off its origin; null outside a GitHub checkout. */
      here: string | null
      /** The ready-for-agent issues the agent's pane lists; null before it first opens. */
      ready: HumanQueueReady
      /** This project's frontier (issue 115): every open issue here, each in one state. */
      frontierList: HumanQueueFrontier
      /** Whether the Frontier pane shows the issues past what waits on the person and what is next. */
      frontierRest: boolean
      /** Which scope the Frontier pane shows: this session's repository, or every repository of the owner's. */
      frontierScope: 'here' | 'all'
      /** The ticket the Ticket pane shows; null before one is opened. */
      ticketPage: HumanQueueTicketPage
      /** What this session's agent says it is doing now; null until it says, or once it clears it. */
      task: HumanQueueTask
      /** Which band card is open: the person's ask, the agent's work, or none. */
      peek: 'human' | 'agent' | null
      /** The Reader holding the band; null while the band shows its rows. */
      reading: HumanQueueReading
      /** The band folded to its one-row group (issue 162). */
      bandMinimized: boolean
      /** The waiting count last acknowledged: the baseline, an open, or an expired new-ask mark. */
      seenWaiting: number | null
      /** When the current rise started; null when the pill shows the steady count. */
      unseenSince: number | null
      /** The decision this session's agent declared; null when the reply row is hidden. */
      decision: HumanQueueDecision | null
      /** The session cards proposed in the turn the decision came from, and when it was made: starting one from its chip takes the step the decision recommends (#67). */
      decisionCards: { tasks: string[]; since: number }
      deckPage: HumanQueueDeckPage
      /** This session's subagents, kept after the engine drops them; [] before the first. */
      subagents: HumanQueueSubagent[]
      /** What the hooks saw of each subagent, by its id. */
      subagentMeta: Record<string, HumanQueueSubagentMeta>
      /** The clock at the last read while a subagent ran: the band's elapsed times redraw from it. */
      subagentNow: number
      /** This session's background tasks, kept after they end; [] before the first (issue 126). */
      backgrounds: HumanQueueBackground[]
      /** The desktop sessions this session started, as the last cache scan found them (issue 129). */
      childSessions: HumanQueueChildSession[]
      /** The idle child sessions `clear finished` hid; one that runs again shows again. */
      childCleared: string[]
      /** True while the subagents row is open. */
      subagentsOpen: boolean
      /** The subagent whose detail the open row shows; null for none. */
      subagentPick: string | null
      /** The agent's task list, as its update_plan calls left it; [] before the first (issue 104). */
      steps: HumanQueueStep[]
      /** True where the band draws this session's task list in place of the app's own. */
      stepsHere: boolean
      /** Every file this session's agents edited, subagents' too, with the lines they added and removed (issue 119). */
      bannerEdits: HumanQueueEdited[]
      /** The ADR each edited file answers to, by its absolute path; null where none binds it. */
      bannerAdrs: Record<string, HumanQueueGoverning | null>
      /** Where the banner placed its nodes, by the width it drew at (`w736`), so a redraw keeps them. */
      bannerPlaced: Record<string, HumanQueueBannerPlaced>
      /** True while this session shows the banner: the 👁 pill, `/vantage-point banner` or the show tool turn it on. */
      bannerOn: boolean
      /** Tickets the last reply names, in this project's repositories; cleared with the decision. */
      replyTickets: HumanQueueReplyTicket[]
      /** Each of those tickets' cards, or why it could not be read, by `owner/name#n`. */
      ticketStates: Record<string, HumanQueueTicketState>
      /** Which of those ticket rows are open, by `owner/name#n`. */
      ticketOpen: Record<string, boolean>
      /** The palette specimen behind `/vantage-point palette`. */
      palette: HumanQueuePalette
      /** The mock album behind `/vantage-point album`. */
      album: HumanQueueAlbum
      /** Each composed item's plan this session holds, by the item's id (#97): read from the store, or made here. */
      plans: Record<string, HumanQueuePlan>
      /** The composed card's own state: the item whose prose is open, and each item's what-if scope, by id. */
      composedView: HumanQueueComposedView
      /** The visuals-grading round behind `/vantage-point grade` (#98). */
      grading: HumanQueueGrading
      /** The setup the tour read when it last opened. */
      tourSetup: VantageTourSetup
      /** The last scan of every transcript's prompt cache, and when it ran; 0 before the first. */
      caches: { at: number; caches: HumanQueueCache[] }
      /** What the Caches pane's filter leaves out: each kind true while hidden. */
      cachesHidden: HumanQueueCacheFilter
      /** True while the Caches pane's filter menu is open. */
      cachesMenu: boolean
      /** The Caches row expanded to its card, by its transcript's path; null with none. */
      cachesExpanded: string | null
      /** Every session's Keep warm as the store last read it, by its transcript's id (issue #60). */
      warmths: Record<string, { armed: boolean; since: number; missed: boolean }>
      /** Global GitHub observations: keep the value and timestamp on failed refreshes. */
      observations: {
        waiting: HumanQueueCountObservation | null
        ready: HumanQueueCountObservation | null
      }
    }
  }
}
