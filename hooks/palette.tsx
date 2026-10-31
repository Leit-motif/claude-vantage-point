// The public copy's palette. The palette is the plugin's own development tool
// (#118): `public/stubs/dev.ts` makes it unreachable here, and this page keeps the
// exports register.tsx imports, so register.tsx is the same file in both.
import type { ElementConstructor, RenderElement, TextProps } from 'claude-code'
import type { HumanQueuePalette, HumanQueuePalettePage } from '../types'

export const PAGES: readonly { key: HumanQueuePalettePage; name: string }[] = []

export const SCOPE = 'palette-scope'

export const PALETTE_START: HumanQueuePalette = { page: 'text', log: [], input: '', select: 'beta' }

export type PaletteActs = {
  page: (page: HumanQueuePalettePage) => Promise<void>
  log: (line: string) => Promise<void>
  input: (value: string) => Promise<void>
  select: (value: string) => Promise<void>
}

export function palette(el: { Text: ElementConstructor<TextProps> } & Record<string, unknown>, _held: HumanQueuePalette, _acts: PaletteActs, ..._rest: unknown[]): RenderElement {
  const { Text } = el
  return <Text>The palette is a tool of the plugin's own development and is not part of this copy.</Text>
}
