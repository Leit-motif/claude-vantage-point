// The public copy's grading round. It is the plugin's own development tool
// (#118): `public/stubs/dev.ts` makes it unreachable here, and this page keeps the
// export register.tsx imports, so register.tsx is the same file in both.
import type { ElementConstructor, RenderElement, TextProps } from 'claude-code'
import type { HumanQueueGrading } from '../types'
import type { GradeCase } from '../panes/visuals/grading'

export type GradingPresses = {
  pick: (id: string, option: string) => void
  comment: (id: string, text: string) => void
  go: (at: number) => void
  prose: (key: string) => void
  send: () => void
}

export function grading(el: { Text: ElementConstructor<TextProps> } & Record<string, unknown>, _round: readonly GradeCase[], _held: HumanQueueGrading, _on: GradingPresses, ..._rest: unknown[]): RenderElement {
  const { Text } = el
  return <Text>The grading round is a tool of the plugin's own development and is not part of this copy.</Text>
}
