// The tour (`/vantage-point tour`, issue #113): what a new install needs to see
// first. It checks the setup the plugin leans on, then lists every feature with
// one button. A Try sends this session's agent a short prompt, so the feature
// runs for real on the person's own project and nothing on screen is staged; an
// Open opens a pane. It is a pane of its own, never the queue's. Never takes
// `$`: register.tsx hands it the elements, the setup it read, what was pressed,
// and the presses.
import type { BoxProps, ButtonProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'
import type { VantageTour, VantageTourSetup } from '../types'
import { QUIET, SIGNAL_YELLOW } from './signal'

export type TourKey = 'agent' | 'subagents' | 'decide' | 'queue' | 'reader' | 'caches' | 'palette'

/**
 * One stop: the feature's name, what it is, where to look once it runs, and
 * either the prompt a Try sends or the pane an Open opens. `readsNext` starts
 * the RSVP Reader on the reply the prompt brings.
 */
export type TourStop = { key: TourKey; name: string; does: string; look: string } & (
  | { act: 'send'; prompt: string; readsNext?: true }
  | { act: 'open' }
)

/** Every prompt says it is the tour's, so the agent keeps it small and makes no change it was not asked for. */
const TOUR = 'Vantage Point tour'

export const TOUR_STOPS: readonly TourStop[] = [
  {
    key: 'agent',
    name: 'Agent row',
    does: 'What the agent is on, from its task tool or the ticket its branch names, and its steps.',
    look: 'The blue row above the prompt; press its title for the steps.',
    act: 'send',
    prompt:
      `${TOUR}, the agent row: call the vantage-point task tool with a task of a few words about surveying this project, ` +
      'make a three-step plan with your task-list tool, work through it briefly by reading only the top-level files, ' +
      'then hand back with an empty task and a two-line summary. Change nothing.',
  },
  {
    key: 'subagents',
    name: 'Subagents row',
    does: 'Every subagent this session starts: its model, time, tokens and what it is doing now.',
    look: 'The subagents row counts them; press the counts for the list.',
    act: 'send',
    prompt:
      `${TOUR}, the subagents row: start three subagents in parallel on the cheapest model you have. ` +
      'Each lists one top-level folder of this project and names its three largest files. ' +
      'Then reply with one line per subagent. Change nothing.',
  },
  {
    key: 'decide',
    name: 'Reply row and decision deck',
    does: 'When a reply ends on a choice, the options sit above the prompt and the deck lays out why.',
    look: 'Press the headline for the deck, or an option to answer.',
    act: 'send',
    prompt:
      `${TOUR}, the decision deck: read this project's README, or its main entry file if it has none, and propose two ` +
      'concrete ways to improve it. Compare them on effort, risk and benefit using facts from the files, and cite the files. ' +
      'End by asking me to choose between the two, saying which you recommend. Change nothing yet.',
  },
  {
    key: 'queue',
    name: 'Human queue',
    does: 'Asks your agents leave for you, ruled yes or no with W and S, a comment with Tab, sent with R.',
    look: 'The amber row counts asks; press it for the queue. Writes human-queue.md here.',
    act: 'send',
    prompt:
      `${TOUR}, the human queue: following the vantage-point:ask skill, add a request to human-queue.md in this folder ` +
      'titled "Tour: three taglines", with three items, each a one-line tagline for this project that I rule yes or no. ' +
      'Then open it with the vantage-point review tool. When my rulings arrive, reply with one line naming the taglines I kept.',
  },
  {
    key: 'reader',
    name: 'RSVP Reader',
    does: 'A long reply played one word at a time, its gist first, the transcript dark while it reads.',
    look: 'It starts when the reply lands; 📖 at the agent row replays it.',
    act: 'send',
    readsNext: true,
    prompt:
      `${TOUR}, the RSVP Reader: explain in about 200 words what this project does and how its main parts fit together, ` +
      'as plain prose with no list, table or code. Change nothing.',
  },
  {
    key: 'caches',
    name: 'Caches',
    does: 'Every warm prompt cache on this machine, its minutes left and hit rate. Keep warm pings a cache while you are away, and spends usage while armed.',
    look: 'The footer shows this session’s; the pill opens them all.',
    act: 'open',
  },
  {
    key: 'palette',
    name: 'Palette',
    does: 'For mod builders: every element a mod can draw on the desktop, one page each.',
    look: 'Opens beside the chat.',
    act: 'open',
  },
]

/** What the plugin leans on, read when the tour opens. `null` login: gh is not signed in or not there. */
export type TourSetup = VantageTourSetup

/** When each stop was last pressed, epoch ms. */
export type TourState = VantageTour

export const TOUR_START: TourState = { pressed: {} }

/** The toast a fresh install shows once on this machine. */
export const FIRST_RUN = 'Vantage Point is on. /vantage-point tour shows what it does, and tries each feature here.'

export type TourElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

/** The setup lines: each a fact and what follows from it, amber only where the person has something to do. */
export function setupLines(setup: TourSetup): { key: string; name: string; fact: string; waits: boolean }[] {
  const gh =
    setup.gh === 'signed-in'
      ? { fact: `signed in as ${setup.login} · asks filed as issues are read from ${setup.login}'s repositories`, waits: false }
      : setup.gh === 'signed-out'
        ? { fact: 'signed out · run gh auth login to rule on asks filed as issues; human-queue.md works without it', waits: true }
        : setup.gh === 'missing'
          ? { fact: 'not installed · install the GitHub CLI for asks filed as issues; human-queue.md works without it', waits: true }
          : { fact: 'checking…', waits: false }
  const file = setup.queueFile
    ? { fact: 'in this folder · its open requests are in the queue', waits: false }
    : { fact: 'not in this folder yet · an agent writes it with its first ask', waits: false }
  return [
    { key: 'gh', name: 'gh', ...gh },
    { key: 'file', name: 'human-queue.md', ...file },
  ]
}

const clock = (at: number) => new Date(at).toTimeString().slice(0, 5)

/** The tour's page on the desktop. */
export function tour(el: TourElements, setup: TourSetup, held: TourState, press: (key: TourKey) => void): RenderElement {
  const { Box, Text, Button } = el
  return (
    <Box key="tour" flexDirection="column" rowGap={1} width="100%">
      <Text key="lead" dimColor>
        A HUD above your prompt, and panes beside the chat. Each Try sends this session's agent a short prompt, so the feature runs for real on this project.
      </Text>
      <Box key="setup" flexDirection="column">
        {setupLines(setup).map(line => (
          <Box key={`setup-${line.key}`} flexDirection="row" columnGap={1}>
            <Text color={line.waits ? SIGNAL_YELLOW : QUIET}>●</Text>
            <Box flexShrink={0}>
              <Text>{line.name}</Text>
            </Box>
            <Box key={`setup-${line.key}-fact`} flexGrow={1} flexShrink={1} minWidth={0}>
              <Text dimColor>{line.fact}</Text>
            </Box>
          </Box>
        ))}
      </Box>
      {TOUR_STOPS.map(stop => {
        const at = held.pressed[stop.key]
        return (
          <Box key={`stop-${stop.key}`} flexDirection="row" columnGap={2} width="100%">
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
              <Text>{stop.name}</Text>
              <Text dimColor>{stop.does}</Text>
              <Box key={`stop-${stop.key}-look`}>
                <Text dimColor>{at === undefined ? stop.look : `${stop.act === 'send' ? 'Sent' : 'Opened'} ${clock(at)} · ${stop.look}`}</Text>
              </Box>
            </Box>
            <Box flexShrink={0}>
              <Button key={`try-${stop.key}`} label={stop.act === 'send' ? 'Try' : 'Open'} onPress={() => press(stop.key)} />
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

/** Where the desktop's elements are not drawn: the same stops as plain lines. */
export function tourText(Text: ElementConstructor<TextProps>, setup: TourSetup): RenderElement {
  const lines = [
    ...setupLines(setup).map(line => `${line.name}: ${line.fact}`),
    '',
    ...TOUR_STOPS.map(stop => `${stop.name}: ${stop.does}`),
    '',
    'The tour runs in the Claude Code desktop app.',
  ]
  return <Text key="tour-text">{lines.join('\n')}</Text>
}
