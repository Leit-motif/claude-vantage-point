// The visuals-grading pane (`/vantage-point grade`, #98): one ask at a time, drawn
// once per lead view its facts allow and once as the text card, stacked A, B, C…,
// each through the queue's own composed card, so the owner grades exactly what the
// queue would draw. A pick per ask; Send hands the picks to the session as a
// message. Never takes `$`: register.tsx hands it the elements, the state, the
// presses and the width.
import type { ElementConstructor, InputProps, RenderElement } from 'claude-code'
import type { HumanQueueGrading } from '../types'
import { TECHNIQUES } from '../panes/visuals/catalog'
import { gradeOptions, letter, NONE_OPTION, optionPlan, TEXT_OPTION, type GradeCase } from '../panes/visuals/grading'
import { composedCard, type ComposedElements } from './composed'

export type GradingElements = ComposedElements & { Input?: ElementConstructor<InputProps> }

export type GradingPresses = {
  pick: (id: string, option: string) => void
  comment: (id: string, text: string) => void
  go: (at: number) => void
  prose: (key: string) => void
  send: () => void
}

/** The pane: what is being graded and why, the ask's options stacked, its pick row, and the way through the round. */
export function grading(el: GradingElements, round: readonly GradeCase[], held: HumanQueueGrading, on: GradingPresses, room: number, chosenAt: number, newProps: boolean): RenderElement {
  const { Box, Text, Button } = el
  if (round.length === 0) return <Text dimColor>No ask in the evaluation set has a picture to grade.</Text>
  const at = Math.max(0, Math.min(round.length - 1, held.at))
  const one = round[at]!
  // The options are the ones the round was chosen with, whatever the pane's width now.
  const options = gradeOptions(one, chosenAt)
  const picked = held.picks[one.id]?.pick
  const done = round.filter(c => held.picks[c.id] !== undefined).length
  const name = (option: string) => (option === TEXT_OPTION ? 'Text only' : (TECHNIQUES.find(t => t.id === option)?.name ?? option))
  const card = (option: string, i: number) => {
    const key = `${one.id}:${option}`
    return (
      <Box key={`option-${option}`} flexDirection="column" gap={1}>
        <Text key="label" bold color={picked === option ? 'suggestion' : undefined}>
          {`${letter(i)}${picked === option ? '  ✓ your pick' : ''}`}
        </Text>
        {composedCard(
          el,
          { plan: optionPlan(one, option), surface: 'desktop', facts: one.facts, question: one.question, prose: one.prose, proseOpen: held.prose === key, room, scope: -1, newProps },
          { prose: () => on.prose(key), scope: () => undefined },
          null,
        )}
      </Box>
    )
  }
  return (
    <Box flexDirection="column" gap={1}>
      {/* What is graded and why, on every ask, so the round never depends on remembering an instruction. */}
      <Box key="what" flexDirection="column">
        <Text key="title" bold>{`Grading visuals · ask ${at + 1} of ${round.length} · ${done} picked`}</Text>
        <Text key="how" dimColor wrap="wrap">
          The same ask, drawn each way its numbers allow. Pick the one you would rule from fastest. Your picks teach the composer which picture to choose.
        </Text>
      </Box>
      <Box key="picks" flexDirection="row" columnGap={1} flexWrap="wrap">
        {[...options, NONE_OPTION].map((option, i) => (
          <Button key={`pick-${option}`} label={option === NONE_OPTION ? 'None fits' : `${letter(i)} · ${name(option)}`} variant={picked === option ? 'primary' : 'secondary'} onPress={() => on.pick(one.id, option)} />
        ))}
      </Box>
      {el.Input === undefined ? null : (
        <Box key="comment-slot">
          <el.Input key={`comment-${one.id}`} placeholder="Comment (optional)" value={held.picks[one.id]?.comment ?? ''} submitLabel="Save" onSubmit={value => on.comment(one.id, value)} />
        </Box>
      )}
      <Box key="nav" flexDirection="row" columnGap={1}>
        <Button key="prev" label="◀ Previous" onPress={() => on.go(at - 1)} />
        <Button key="next" label="Next ▶" onPress={() => on.go(at + 1)} />
        <Box flexGrow={1} />
        <Button key="send" label={held.sent ? 'Sent' : `Send ${done} picks`} variant={done === round.length && !held.sent ? 'primary' : 'secondary'} onPress={on.send} />
      </Box>
      {options.map(card)}
    </Box>
  )
}
