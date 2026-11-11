// The one module that knows which system Vantage Point runs on (issue 152), all pure. The mod API
// names no platform, so register.tsx reads a few environment variables once and hands them to
// `hostOf`; every other module asks the Host it gets back, never the system. On macOS each call
// keeps the argv it had before Windows support, which scripts/host.test.mts pins.

export type Os = 'macos' | 'windows'

/** The environment variables a Host is read from; each is absent where the system does not set it. */
export type HostEnv = {
  OS?: string
  HOME?: string
  USERPROFILE?: string
  APPDATA?: string
  LOCALAPPDATA?: string
  ProgramFiles?: string
  CLAUDE_CODE_GIT_BASH_PATH?: string
}

export type Host = {
  os: Os
  /** The person's home folder, or null when the system names none. */
  home: string | null
  /**
   * The argv that runs a POSIX sh script, the script next: `/bin/sh -c` on macOS, Git for Windows'
   * bash on Windows, null where none was found (Claude Code runs without Git for Windows since April 2026).
   */
  shell: readonly string[] | null
  /** Where the desktop app keeps one file per Code session, or null with no home. */
  desktopSessions: string | null
  /** Vantage Point's own log folder, or null with no home. */
  logs: string | null
  /** Vantage Point's cache folder, holding `pictures/` and `videos/`, or null with no home. */
  cache: string | null
}

/** Whether `env` is Windows': Windows sets `OS` to `Windows_NT` in every process, and macOS never sets it. */
export const isWindows = (env: HostEnv): boolean => env.OS === 'Windows_NT'

/** Where Git for Windows' bash may be, most specific first: Claude Code's own setting, then the installer's default. */
export function bashCandidates(env: HostEnv): string[] {
  if (!isWindows(env)) return []
  const found = [env.CLAUDE_CODE_GIT_BASH_PATH, env.ProgramFiles && `${env.ProgramFiles}\\Git\\bin\\bash.exe`, env.LOCALAPPDATA && `${env.LOCALAPPDATA}\\Programs\\Git\\bin\\bash.exe`]
  return [...new Set(found.filter((one): one is string => typeof one === 'string' && one !== ''))]
}

/** The Host `env` describes; `bash` is the first of `bashCandidates(env)` that exists, or null. */
export function hostOf(env: HostEnv, bash: string | null = null): Host {
  if (!isWindows(env)) {
    const home = env.HOME || env.USERPROFILE || null
    return {
      os: 'macos',
      home,
      shell: ['/bin/sh', '-c'],
      desktopSessions: home && `${home}/Library/Application Support/Claude/claude-code-sessions`,
      logs: home && `${home}/Library/Logs/vantage-point`,
      cache: home && `${home}/Library/Caches/vantage-point`,
    }
  }
  const home = env.USERPROFILE || env.HOME || null
  const roaming = env.APPDATA || (home && `${home}\\AppData\\Roaming`)
  const local = env.LOCALAPPDATA || (home && `${home}\\AppData\\Local`)
  return {
    os: 'windows',
    home,
    shell: bash === null ? null : [bash, '-c'],
    desktopSessions: roaming && `${roaming}\\Claude\\claude-code-sessions`,
    logs: local && `${local}\\vantage-point\\logs`,
    cache: local && `${local}\\vantage-point`,
  }
}

/** The argv that runs the sh `script` with `args` as `$1` onward, or null where the host has no shell. */
export function shArgv(host: Host, script: string, ...args: string[]): string[] | null {
  return host.shell === null ? null : [...host.shell, script, 'sh', ...args]
}

/**
 * The argv that opens a link or file the way a double click does. On Windows it is the URL
 * protocol handler, not `cmd /c start`: cmd would split a link at its `&`.
 */
export function openArgv(host: Host, target: string): string[] {
  return host.os === 'windows' ? ['rundll32', 'url.dll,FileProtocolHandler', target] : ['open', target]
}

/** The argv that deletes a file, and succeeds when there is none: the mod API cannot delete. */
export function removeArgv(host: Host, path: string): string[] {
  // del reads a `/` as the start of a switch, so the path goes with Windows' own separators.
  return host.os === 'windows' ? ['cmd', '/d', '/c', 'del', '/f', '/q', path.replace(/\//g, '\\')] : ['rm', '-f', path]
}

/** The argv that prints the person's local date as YYYY-MM-DD, or null where nothing can. */
export function dateArgv(host: Host): string[] | null {
  return host.os === 'windows' ? shArgv(host, 'date +%F') : ['date', '+%F']
}

/** The argv that prints a file's last `bytes`, or null where nothing can. */
export function tailArgv(host: Host, path: string, bytes: number): string[] | null {
  return host.os === 'windows' ? shArgv(host, 'tail -c "$1" "$2"', String(bytes), path) : ['tail', '-c', String(bytes), path]
}

/** Whether `path` names its place outright: `/x` on macOS, `C:\x`, `C:/x` or a `\\share` on Windows. */
export const isAbsolute = (path: string): boolean => path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || /^[\\/]{2}[^\\/]/.test(path)

/** `named` as an absolute path: itself when it is one, else under `dir`. */
export const resolveIn = (dir: string, named: string): string => (isAbsolute(named) ? named : `${dir.replace(/[\\/]+$/, '')}/${named}`)

/** The last name in `path`, split on either separator. */
export const baseName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

/** The folder that holds `path`, keeping a root as that root (`/`, `C:\`). */
export function dirName(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (cut < 0) return '.'
  const head = path.slice(0, cut)
  return head === '' || /^[A-Za-z]:$/.test(head) ? path.slice(0, cut + 1) : head
}

/** `path` with every separator a `/` and its drive letter capital, so two spellings of one Windows path compare equal (git answers `C:/x`, a tool may say `c:\x`). */
export const slashed = (path: string): string => path.replace(/\\/g, '/').replace(/^[a-z]:/, drive => drive.toUpperCase())
