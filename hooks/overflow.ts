// The overflow check (issue 175, spec 171): lays an argument's picture out in a headless browser,
// when one is on the machine, and says whether its content runs past its stated height. Never takes
// `$`: the caller hands it the calls it needs (`$.process.run`, `$.fs`). A check that cannot run
// says why and never passes. The card lab runs it from node, so its imports name their files.
import type { Run } from '../panes/human-queue/issues.ts'
import { fileUrlOf, layoutArgv, removeTreeArgv } from '../panes/host.ts'
import type { Host } from '../panes/host.ts'
import { DESIGN_WIDTH } from '../panes/visuals/picture.ts'
import type { PictureSpec } from '../panes/visuals/picture.ts'
import { measuringPage, readMeasure } from '../panes/visuals/overflow.ts'
import type { Overflow } from '../panes/visuals/overflow.ts'

export type { Overflow }

export type OverflowIO = {
  run: Run
  exists: (path: string) => Promise<boolean>
  /** Writes a file, making its folders. */
  write: (path: string, text: string) => Promise<void>
  /** A fresh, unguessable name of 8 to 64 letters and digits. */
  nonce: () => string
  /** Waits `ms` (`$.clock.sleep`: the mod has no timers of its own). */
  sleep: (ms: number) => Promise<void>
}

/** Where the check runs: the host, and the browsers that may be on it (`browserCandidates`), the first found used. */
export type OverflowSetup = { host: Host; browsers: readonly string[] }

/** How long the browser has to lay the picture out and print it. */
export const DEADLINE_MS = 5000

/**
 * Whether `spec` fits its stated height at `paneWidth` (the design width unless given): `fits`,
 * `overflows` by how many CSS pixels at the design width, `underfills` by how many with the height its
 * content reaches (rounded up), or `unchecked` and why.
 */
export async function checkOverflow(io: OverflowIO, setup: OverflowSetup, spec: PictureSpec, options: { paneWidth?: number; deadlineMs?: number } = {}): Promise<Overflow> {
  const paneWidth = options.paneWidth ?? DESIGN_WIDTH
  const deadlineMs = options.deadlineMs ?? DEADLINE_MS
  if (setup.host.cache === null) return { status: 'unchecked', why: 'the system names no cache folder to lay the picture out in' }
  let browser: string | null = null
  for (const one of setup.browsers) {
    if (await io.exists(one).catch(() => false)) {
      browser = one
      break
    }
  }
  if (browser === null) return { status: 'unchecked', why: 'no Chrome or Edge on this machine' }

  const nonce = io.nonce()
  const measured = measuringPage(spec, paneWidth, nonce)
  if ('refused' in measured) return { status: 'unchecked', why: `the picture is refused: ${measured.refused.join('; ')}` }

  const dir = `${setup.host.cache.replace(/[\\/]+$/, '')}/overflow-${nonce}`
  const page = `${dir}/page.html`
  try {
    await io.write(page, measured.page)
    const argv = layoutArgv(browser, `${dir}/profile`, fileUrlOf(page), measured.width, measured.height)
    const late = io.sleep(deadlineMs).then(() => 'late' as const)
    const done = await Promise.race([io.run(argv, { timeoutMs: deadlineMs }), late])
    if (done === 'late') return { status: 'unchecked', why: `the browser took over ${deadlineMs / 1000} s` }
    if (done.exitCode !== 0) return { status: 'unchecked', why: `the browser exited ${done.exitCode}${done.stderr.trim() === '' ? '' : `: ${done.stderr.trim().split('\n').at(-1)}`}` }
    return readMeasure(done.stdout, nonce, spec.height)
  } catch (error) {
    return { status: 'unchecked', why: `the browser did not run: ${error instanceof Error ? error.message : String(error)}` }
  } finally {
    await io.run(removeTreeArgv(setup.host, dir)).catch(() => undefined)
  }
}
