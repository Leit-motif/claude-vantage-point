// A background task's name when its call gave none (issue 126): the one step of its command
// that does the work, named by a table of rules. Pure and deterministic; no model reads it.
import { shortTitle } from './title.ts'

/** Steps that set up, report or filter, and never name what a command is for. */
const SETUP = new Set([
  'cd', 'pushd', 'popd', 'export', 'source', '.', 'set', 'unset', 'mkdir', 'echo', 'printf', 'sleep', 'cat', 'head', 'tail',
  'grep', 'egrep', 'rg', 'wc', 'sort', 'uniq', 'jq', 'tee', 'true', 'false', 'date', 'ls', 'rm', 'touch', 'wait', 'pmset', 'test', '[', '[[',
  'exit', 'trap', 'read', 'break', 'continue', 'case', 'esac', ':', 'return', 'local', 'let', 'osascript', 'say', 'open', 'basename', 'dirname', 'pwd', 'which', 'type', 'kill', 'pkill', 'chmod', 'awk', 'sed', 'cut', 'tr', 'xargs',
])

/** Words that run the next one: `time swift test` is a swift test. */
const WRAPPERS = new Set(['time', 'nice', 'nohup', 'env', 'caffeinate', 'command', 'exec', 'sudo', 'stdbuf', 'timeout', '!', 'then', 'do', 'else'])

/** Interpreters whose first argument is the script that names the step. */
const INTERPRETERS = new Set(['python', 'python3', 'node', 'bun', 'deno', 'ruby', 'bash', 'sh', 'zsh', 'swift', 'perl', 'npx', 'tsx'])

/** Build tools named with their subcommand: `Swift test`, `Cargo install wasm-bindgen-cli`. */
const BUILDERS: Record<string, string> = {
  swift: 'Swift', cargo: 'Cargo', npm: 'npm', pnpm: 'pnpm', yarn: 'Yarn', go: 'Go', make: 'Make', xcodebuild: 'Xcode', gradlew: 'Gradle', gradle: 'Gradle', docker: 'Docker', uv: 'uv', pip: 'pip', brew: 'Brew',
}

/** The command with each heredoc's body taken out, so its lines read as no steps. */
const dropHeredocs = (command: string) =>
  command.replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n\s*\2(?=\n|$)/g, (_, _q, _tag, rest: string) => rest)

/** The command's steps, split on `&&`, `||`, `;`, `|`, newlines and brackets outside quotes and `$( )`. */
export function steps(command: string): string[][] {
  const text = dropHeredocs(command)
  const out: string[][] = []
  let words: string[] = []
  let word = ''
  let quote = ''
  let depth = 0
  const endWord = () => {
    if (word !== '') words.push(word)
    word = ''
  }
  const endStep = () => {
    endWord()
    if (words.length > 0) out.push(words)
    words = []
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string
    if (quote !== '') {
      if (c === quote) quote = ''
      else word += c
    } else if (depth > 0) {
      word += c
      if (c === '(') depth++
      else if (c === ')') depth--
    } else if (c === '$' && text[i + 1] === '(') {
      word += '$('
      depth = 1
      i++
    } else if (c === "'" || c === '"') quote = c
    else if (c === '\\' && text[i + 1] === '\n') i++
    else if (c === '&' && (text[i - 1] === '>' || text[i + 1] === '>')) word += c
    else if (/[;&|\n(){}]/.test(c)) endStep()
    else if (/\s/.test(c)) endWord()
    else word += c
  }
  endStep()
  return out
}

const base = (path: string) => (path.split('/').filter(Boolean).at(-1) ?? path).replace(/\.(sh|py|mjs|mts|cjs|js|ts|rb|swift)$/, '')

/** The step's words without its assignments, wrappers and redirections. */
function core(words: readonly string[]): string[] {
  let i = 0
  while (i < words.length && (/^\w+=/.test(words[i] as string) || WRAPPERS.has(words[i] as string))) i++
  const rest = words.slice(i)
  const cut = rest.findIndex(w => /^(\d*>>?|\d*<|&>|<<<?)/.test(w))
  return cut === -1 ? rest : rest.slice(0, cut)
}

/** The first argument that is a word, not a flag, a long flag's value, a path or a variable: `accuracy`, `status`. */
const firstArg = (args: readonly string[]) =>
  args.find((a, i) => /^[\w.:@-]{1,24}$/.test(a) && !a.startsWith('-') && /[a-z]/i.test(a) && !/^--[^=]+$/.test(args[i - 1] ?? ''))

/** Git commands that read, which prepare a command's work more often than they are it. */
const GIT_READS = new Set(['diff', 'show', 'rev-parse', 'log', 'status', 'ls-files', 'branch', 'remote', 'config'])

/** One step's name, or null when the step only sets up; `weak` also names the steps that only read. */
function nameStep(words: readonly string[], weak: boolean, vars: ReadonlyMap<string, string>): string | null {
  const [raw = '', ...args] = core(words)
  // `$(cmd)` in a condition is named by what it runs; `$P script.py` by what the command set `P` to.
  if (raw.startsWith('$(')) return commandName(raw.slice(2, -1))
  const cmd = raw.replace(/^\$\{?(\w+)\}?/, (whole, name: string) => vars.get(name) ?? whole)
  if (cmd.startsWith('$') && !cmd.includes('/')) return null
  if ((cmd === 'tail' || cmd === 'less') && args.some(a => /^-\w*[fF]/.test(a))) {
    const file = args.filter(a => !a.startsWith('-') && !/^\d+$/.test(a)).at(-1)
    return file === undefined ? 'Follow a log' : `Follow ${base(file)}`
  }
  // A loop waits on its condition: `until ! pgrep -f x`, `while [ ! -f done ]`.
  if ((cmd === 'while' || cmd === 'until') && /^(true|:|false)$/.test(args[0] ?? '')) return null
  if (cmd === 'until' || cmd === 'while') return `Wait for ${waitedOn(cmd, args)}`
  if (cmd === 'for' || cmd === 'if' || cmd === 'done' || cmd === 'fi' || cmd === '') return null
  const tool = base(cmd)
  if (SETUP.has(cmd) || (/^\/(usr\/)?s?bin\//.test(cmd) && SETUP.has(tool))) return null
  if (tool === 'ssh' || tool === 'mosh') {
    let i = 0
    while (i < args.length && (args[i] as string).startsWith('-')) i += /^-[oipJlFLRD]$/.test(args[i] as string) ? 2 : 1
    const host = args[i]
    const inner = args.slice(i + 1).join(' ')
    const named = inner === '' ? null : commandName(inner)
    return named === null ? `Shell on ${host ?? 'remote'}` : `${named} on ${host}`
  }
  if (tool === 'gh') {
    const [sub, verb] = args
    if (sub === 'run') return verb === 'watch' || verb === 'view' || verb === 'list' ? 'Watch CI run' : `CI run ${verb ?? ''}`.trim()
    if (sub === 'pr' && verb === 'checks') return 'Watch PR checks'
    return `GitHub ${[sub, verb].filter(Boolean).join(' ')}`
  }
  if (tool === 'git') {
    const rest = args.filter((a, i) => !a.startsWith('-') && args[i - 1] !== '-C' && args[i - 1] !== '-c')
    return !weak && GIT_READS.has(rest[0] ?? '') ? null : `Git ${rest[0] ?? ''}`.trim()
  }
  if (tool === 'log' && (args[0] === 'show' || args[0] === 'stream')) {
    const process = /process\s*==\s*"?([\w.-]+)/.exec(args.join(' '))?.[1]
    return process === undefined ? 'Watch the system log' : `Watch ${process}'s log`
  }
  if (tool === 'rsync' || tool === 'cp' || tool === 'scp') {
    const from = args.find(a => !a.startsWith('-'))
    return from === undefined ? 'Copy files' : `Copy ${base(from.replace(/^[\w.-]+:/, ''))}`
  }
  if (tool === 'curl' || tool === 'wget') {
    const host = args.map(a => /^https?:\/\/([^/]+)/.exec(a)?.[1]).find(Boolean)
    return host === undefined ? 'Fetch a URL' : `Fetch ${host}`
  }
  const builder = BUILDERS[tool]
  if (builder !== undefined && !(INTERPRETERS.has(tool) && args[0] !== undefined && /\.\w+$/.test(args[0]))) {
    const sub = firstArg(args)
    const what = sub === 'install' || sub === 'add' ? firstArg(args.slice(args.indexOf(sub) + 1)) : undefined
    return [builder, sub, what].filter(Boolean).join(' ')
  }
  if (INTERPRETERS.has(tool)) {
    const script = args.find(a => !a.startsWith('-'))
    if (script === undefined || script === '-' || args.includes('-c') || args.includes('-e')) return `${tool.replace(/\d+$/, '').replace(/^\w/, c => c.toUpperCase())} script`
    const arg = firstArg(args.slice(args.indexOf(script) + 1))
    return [base(script), arg].filter(Boolean).join(' ')
  }
  // A script or program: its name, and its first plain argument (`exp021-run accuracy`, `deploy status`).
  const arg = firstArg(args)
  return [tool, arg].filter(Boolean).join(' ')
}

/** What a loop waits on, from its condition's words, with `$( )` and a remote command opened. */
function waitedOn(loop: string, cond: readonly string[]): string {
  const opened = cond.flatMap(w => (w.startsWith('$(') ? steps(w.slice(2, -1)).flat() : [w]))
  const words = opened.some(w => base(w) === 'ssh') ? steps(opened.join(' ')).flat() : opened
  const pg = words.indexOf('pgrep')
  if (pg !== -1) {
    const negated = words.slice(0, pg).includes('!')
    const pattern = words.slice(pg + 1).find(a => !a.startsWith('-')) ?? ''
    const named = pattern.split(/[^\w./-]+/).map(p => base(p.replace(/\.+$/, ''))).find(p => /[a-z]/i.test(p) && !INTERPRETERS.has(p))
    // `until ! pgrep` and `while pgrep` wait for it to end; `until pgrep` for it to start.
    return `${named ?? 'a process'} to ${(loop === 'until') === negated ? 'end' : 'start'}`
  }
  const file = words.some(w => w === '[' || w === '[[' || w === 'test') ? words.findIndex(w => /^-[fsde]$/.test(w)) : -1
  if (file !== -1 && words[file + 1] !== undefined) return (words[file + 1] as string).startsWith('$') ? 'a file' : base(words[file + 1] as string)
  const joined = words.join(' ')
  if (/\bgh run\b/.test(joined)) return 'CI run'
  if (/\blog (show|stream)\b/.test(joined)) return 'a log line'
  // `until grep -q '^exit' run.log`: the pattern in the file, or the file when the pattern is long.
  const g = words.indexOf('grep')
  if (g !== -1) {
    const [pattern, file] = words.slice(g + 1).filter(a => !a.startsWith('-'))
    const shown = pattern?.replace(/^\^|\$$/g, '')
    if (file !== undefined && !file.startsWith('$')) return shown !== undefined && /^[\w =:.-]{1,16}$/.test(shown) ? `${shown} in ${base(file)}` : base(file)
    if (shown !== undefined && /^[\w =:.-]{1,24}$/.test(shown)) return shown
  }
  const inner = commandName(cond.filter(w => w !== '!' && w !== '[' && w !== '[[' && w !== ']' && w !== ']]').join(' '))
  return inner === null || inner.startsWith('Wait') ? 'a condition' : inner.replace(/^Fetch /, '').replace(/^(?=[A-Z][a-z])\w/, c => c.toLowerCase())
}

/**
 * A short name for a shell command, from the step that does its work, or null when every step only
 * sets up. `cd ~/w && scripts/exp021-run.sh accuracy > log` is `exp021-run accuracy`; a remote one is
 * named for its host, `deploy status on mac-mini`; a loop for what it waits on.
 */
export function commandName(command: string): string | null {
  const all = steps(command)
  const vars = new Map(all.flatMap(words => {
    const set = /^(\w+)=(.*)$/.exec(words[0] ?? '')
    return set === null || words.length > 1 || (set[2] as string).startsWith('$(') ? [] : [[set[1] as string, set[2] as string] as const]
  }))
  for (const weak of [false, true]) {
    for (const words of all) {
      const named = nameStep(words, weak, vars)
      if (named !== null) return shortTitle(named, 6, 40)
    }
  }
  // Only setup steps: a lone `X=$(cmd)` is named by the command it runs.
  for (const words of all) {
    const sub = /^\w+=\$\(([\s\S]*)\)$/.exec(words[0] ?? '')?.[1]
    const named = sub === undefined ? null : commandName(sub)
    if (named !== null) return named
  }
  // Only a wait: `sleep 25; echo reloaded`.
  const sleep = all.find(words => words[0] === 'sleep' && /^\d+$/.test(words[1] ?? ''))?.[1]
  return sleep === undefined ? null : `Wait ${clockOf(Number(sleep))}`
}

const clockOf = (s: number) => (s < 60 ? `${s}s` : s % 60 === 0 ? `${s / 60}m` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`)
