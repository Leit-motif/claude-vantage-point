# Vantage Point

A heads-up display for Claude Code. It shows what your agent is doing above the prompt, lays out a decision when a reply asks you to choose, plays long replies one word at a time, tracks every warm prompt cache on your machine, and gives your agents a queue of asks you rule on with yes or no.

![The band above the Claude Code desktop prompt: subagents run and finish, the reply row offers the agent's question with the recommended option green, the decision deck opens beside the chat, and picking the option sends it as the reply](media/demo.gif)

It is a Claude Code **mod**: a plugin that draws in the desktop app. It is an early preview (0.x), so its formats may still change.

## Install

In a terminal:

```bash
claude plugin marketplace add Leit-motif/claude-vantage-point
```

```bash
claude plugin install vantage-point@claude-vantage-point
```

Or inside a Claude Code session: `/plugin marketplace add Leit-motif/claude-vantage-point`, then `/plugin install vantage-point@claude-vantage-point`, at user scope. A plugin installed at user scope also loads in the desktop app's Code tab. Restart the app once so it loads.

## Start with the tour

Run `/vantage-point tour`, or ask your agent to "open the Vantage Point tour". The tour pane checks your setup, then lists every feature with a button:

- **Try** sends this session's agent a short prompt, so the feature runs for real on your own project: subagents fan out, a reply ends on a choice and the deck fills, an ask lands in the queue, a long reply plays in the reader.
- **Open** opens a pane: the caches, or the palette for mod builders.

Each Try costs a few turns of your usual usage. Nothing else in the tour sends anything.

## What it draws

**The band**, above the prompt, one row per thing worth a glance:

- **Reply row.** When a reply ends by asking you to choose, its options sit on one line, the recommended one green. Press an option to answer with it; press the headline to open the decision deck.
- **Agent row.** What the agent is on: the task it declared with the `task` tool, or the ticket its `ticket/<n>-…` branch names. Press the title for its steps. The pill counts the issues labelled `ready-for-agent`. 📖 at the right opens the reader.
- **Subagents row.** Every subagent this session starts: counts, then each one's model, time, tokens and what it is doing now.
- **Your row.** This project's next ask, and how many wait on you across your repositories. Press it to open the queue.

**The decision deck**, beside the chat: the answer, why, the options compared, and numbered sources quoted from the files the agent read. A quote that is not in its file word for word is dropped, with every sentence that cites it.

**The RSVP reader.** Plays the reply's gist, then optionally the whole reply, one word at a time with a red anchor letter on a fixed focal point. The transcript goes dark while it reads. Speed steps of 50 words a minute.

**The cache label and the Caches pane.** The footer shows this session's prompt cache, `Cache 48m`, green while warm. Its pill opens every warm cache on this machine, with each one's size, hit rate and minutes left. **Keep warm** pings an armed session while you are away, until 6 hours after your last turn or midnight.

**The human queue.** Agents leave asks in `human-queue.md` at the project root, or as GitHub issues labelled `ready-for-human`. You rule each item yes or no, with an optional comment, from the keyboard:

| Key | Does |
|---|---|
| `W` / `S` | Yes / No, then the next item |
| `A` / `D` | Previous / next item |
| Tab | Comment |
| `Q` / `E` | Undo / redo |
| `R` | Submit |
| `1`–`9`, `Z` | Switch request, back to the overview |

The asking agent gets your rulings back as JSON; for an issue, they post as one comment. Agents learn the format from the bundled `vantage-point:ask` skill; an example is in `examples/human-queue.md`. On the phone, through Remote Control, the same pane takes taps, and 💬 turns your next chat message into the comment.

## What it runs, reads and sends

- **GitHub, through your `gh`.** Once a minute it reads the open issues labelled `ready-for-human` and `ready-for-agent` in the repositories of the account `gh` is signed in as. It posts only when you submit rulings on an issue: one comment, then it removes the label. Without `gh`, `human-queue.md` still works and the tour says what is missing.
- **Your transcripts, locally.** The Caches pane reads Claude Code's own transcripts under `~/.claude/projects` every 15 seconds. Nothing leaves the machine.
- **Model calls on your session's access, no API key.** When a reply asks you to choose, a Haiku call checks it really needs a decision, then a fork of the session (served from its prompt cache) writes the deck, and Haiku checks each sentence against its quotes.
- **Keep warm sends prompts.** While a session is armed it sends a short ping when its cache is about to go cold. It spends usage; it is off until you press it.
- **The system prompt.** It adds a line asking agents to call the `task` tool, and, with the `readerGist` setting on, to end a long reply with a short gist.
- **The task list.** In the desktop app the band shows the agent's task list in place of the app's own; `/vantage-point steps` gives it back to the app.

## Good to know

- **The band is shared.** Another mod that draws above the prompt may take its place.
- **Desktop first.** The band, panes and reader are drawn for the Claude Code desktop app. Cloud sessions on claude.ai draw no mods.
- **Commands.** `/vantage-point` opens the queue; `tour`, `caches`, `palette`, `keep-warm` and `steps` follow it.

## Development

```bash
claude plugin validate .
```

```bash
claude --plugin-dir .
```

The mod API is early and changes between Claude Code releases; the engine lays its types in `.claude-plugin/types/` at load. Issues and ideas are welcome.

## License

MIT
