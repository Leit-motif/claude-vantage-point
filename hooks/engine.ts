// What the running engine takes. Never takes `$`: register.tsx hands it the version.

/**
 * Whether the engine takes the props new in 2.1.299: Text's `size`, `weight`,
 * `mono` and `tabular`, and the spacing steps `xs` to `xl`. An older one refuses
 * the whole pane over one of them (docs/palette.md). `base` is
 * `$.session.version()`'s, absent when the version is not a release's.
 */
export function takesNewProps(base: string | undefined): boolean {
  const [, major = '', minor = '', patch = ''] = /^(\d+)\.(\d+)\.(\d+)/.exec(base ?? '') ?? []
  const at = (a: string, b: string, c: string) => Number(a) * 1e8 + Number(b) * 1e4 + Number(c)
  return major !== '' && at(major, minor, patch) >= at('2', '1', '299')
}
