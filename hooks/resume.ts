// The resume note scripts/desktop-restart.sh leaves when a session restarts the desktop app with
// --resume: the app comes back with every session idle, so the session that asked for the restart
// finds its note at start and submits it as its next prompt, and its work carries on unattended.
// The script writes the note under the engine's session id (CLAUDE_CODE_SESSION_ID, the transcript's
// name) and opens the session through its claude:// link, which starts it. Never takes `$`.

/** Where the notes live, under the home directory: one file per session, named by its id. */
export const RESUME_DIR = '.claude/vantage-point/resume'

/** How long after its start a session waits before submitting: the app is still settling. */
export const RESUME_DELAY_MS = 5_000

export const resumePath = (home: string, sessionId: string) => `${home}/${RESUME_DIR}/${sessionId}.md`

/** The prompt that carries the note back to the agent, or null for a note with nothing in it. */
export function resumePrompt(note: string): string | null {
  const text = note.trim()
  if (text === '') return null
  return `The desktop app has restarted, as you asked (scripts/desktop-restart.sh --resume). Carry on from your note:\n\n${text}`
}
