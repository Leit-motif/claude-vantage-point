// Why the desktop would refuse a drawing, before it is handed over. A refused tree
// is not a failure the hook's `.catch` hears: the engine draws its own "has not
// drawn" in the pane, with no control to leave it (spell-hotbar-ng#12, an Svg past
// its cap). So the pane checks its own tree for the refusals found so far and draws
// a way back instead. Pure.

import { SVG_MAX } from '../panes/human-queue/pictures'

/** The first reason the desktop would refuse `node`, or null when none is known. */
export function refusal(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const why = refusal(child)
      if (why !== null) return why
    }
    return null
  }
  if (typeof node !== 'object' || node === null) return null
  const { type, props, children } = node as { type?: unknown; props?: Record<string, unknown>; children?: unknown }
  for (const [name, value] of Object.entries(props ?? {})) {
    // The decision deck's widths once came out as Math.max(...[]), -Infinity.
    if (typeof value === 'number' && !Number.isFinite(value)) return `${String(type)} ${name} is ${value}`
  }
  const source = props?.source
  if (type === 'Svg' && typeof source === 'string' && source.length > SVG_MAX) {
    return `a picture of ${source.length} characters, past the ${SVG_MAX} the desktop takes`
  }
  return refusal(children ?? props?.children)
}
