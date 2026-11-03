---
name: set-conventions
description: Teach Vantage Point a repository's workflow, its labels, branch names, ADR folders and tracker, by proposing each convention it reads differently, filing the proposal as one ask for the person to rule on, and writing the conventions file from the rulings. Use when a person asks Vantage Point to read their workflow, when the tour's conventions stop runs it, or when the band or Frontier misreads a repository's labels or branches.
---

# Set conventions

Vantage Point reads a repository's workflow from one **conventions** value: the label each of Matt Pocock's triage roles goes by, further labels and what each means, the branch names that point at an issue, the ADR folders, the parent links, the tracker, and what submitting rulings does to the waiting label. Each field comes from the first layer that sets it:

1. the repository's `.claude/vantage-point.json`;
2. its `docs/agents/triage-labels.md` (role labels only);
3. the person's `~/.claude/vantage-point.json`, for every repository they open;
4. the defaults: Matt's canonical labels, branch forms `*/{n}-*` and `*/{n}`, no spec form, ADR folders `docs/adr` and `docs/decisions`, both parent links, GitHub, and after rulings `ready` where the repository has a `triage-labels.md`, else `unlabel`.

This skill finds where the repository's own evidence disagrees with what Vantage Point resolves now, proposes exactly those fields, and writes only what the person rules yes. It is a **diff**, never a survey: a field Vantage Point already reads right is never proposed, so a run on an unchanged repository proposes nothing.

## Find the plugin's script

Reading what Vantage Point resolves, and writing the file, go through `scripts/conventions.mts` in this plugin, which checks every field with the parser the plugin reads it with. Find the plugin's folder (the installed copy, else a shallow clone in your scratch directory):

```bash
plugin=$(find ~/.claude/plugins/marketplaces "<scratch dir>" -maxdepth 3 -path '*/scripts/conventions.mts' 2>/dev/null | head -1)
plugin=${plugin%/scripts/conventions.mts}
[ -n "$plugin" ] || { plugin="<scratch dir>/vantage-point"; git clone --depth 1 https://github.com/Leit-motif/claude-vantage-point "$plugin"; }
echo "$plugin"
```

It needs Node 22.6 or newer. Write the folder it prints in place of `$plugin` below.

## 1. Read what Vantage Point resolves now

From the repository's root:

```bash
node --experimental-strip-types "$plugin/scripts/conventions.mts" read
```

It prints `conventions` (the value in force), `from` (the layer each field came from: `repo`, `triage`, `person` or `default`), `problems` (fields a file set that failed their check, which Vantage Point ignored) and `files`. This is the **baseline**. Done when you hold its output.

## 2. Gather the repository's evidence

Read, from the repository's root:

- `CLAUDE.md`, `AGENTS.md` and every file in `docs/agents/` (Matt's setup writes `triage-labels.md` and `issue-tracker.md` there);
- the labels: `gh label list --limit 200 --json name,description`, and how often each is used, in one call: `gh issue list --state all --limit 500 --json labels`;
- the branch names: `git branch -a --format='%(refname:short)'`;
- the ADR folders present: `find . -maxdepth 4 -type d \( -iname 'adr' -o -iname 'adrs' -o -iname 'decisions' \) -not -path './node_modules/*' -not -path './.git/*'`, keeping a folder only when it holds numbered decision records;
- `human-queue.md`, for an earlier conventions request (titled "Vantage Point conventions") and its rulings.

Done when you have read each source, or know it is absent.

## 3. Decide each proposal

For each field below, compare the evidence with the baseline. Propose a value only when the evidence names something the baseline gets wrong or leaves out, and drop any value the person already ruled no on in an earlier conventions request. Write down the source of each proposal (the file and line, the label and its count, the branch names).

| Field | Propose when | Value |
|---|---|---|
| `roles.<role>` (`waiting`, `ready`, `triage`, `info`, `parked`) | The repository plainly uses another label for one of Matt's roles (its agent rules say so, or the label list has its own name and lacks Matt's), and `triage-labels.md` does not already say so: Vantage Point reads that file itself. | The repository's label name. |
| `labels` | A label the repository uses, beyond the role labels, that its agent rules or descriptions give a workflow meaning: a stage, a pause, a parking lot. | `{ label, state, stage }`, `state` one of `waiting`, `accepting`, `active`, `ready`, `blocked`, `shaping`, `parked`; `stage` the name the agent card shows, or `null` for a label that sets work aside without being a stage. |
| `branches.ticket` | Branches name issues in a form `*/{n}-*` and `*/{n}` miss (`155-fix`, `feat-155`). | Templates: `{n}` once for the issue number, `*` at most twice, each within one path segment except a trailing one. Never a regular expression. |
| `branches.spec` | Branches name a spec, a parent issue that tickets merge into, in a form of their own (`spec/145-macos-release`), and the rules say so. | Templates as above, such as `spec/{n}-*` and `spec/{n}`. A spec form is matched before the ticket forms. |
| `adrDirs` | ADRs live in a folder other than `docs/adr` and `docs/decisions`. | Folders inside the repository, relative to its root. |
| `parent` | The rules forbid one of the two parent links: GitHub's sub-issue parent (`native`) or a `Part of #n` line (`part-of`). | The links used, each once. |
| `tracker` | `issue-tracker.md` or the rules put issues in GitLab or in local files. | `gitlab` or `local`. |
| `afterRulings` | The rules say what happens to the waiting label once the person has answered, and it differs from the baseline. | `ready` (swap the waiting label for the ready label) or `unlabel` (take it off). |

`labels`, `adrDirs`, `parent` and each branch list are whole-list fields: the first layer that sets one hides the lists below it. A proposed list therefore carries the baseline's entries plus the new ones, never the new ones alone. Each label to add or change is still its own item, so the person rules on each.

If nothing is proposed, reply in one line that Vantage Point already reads this repository's workflow, naming where its labels and branch forms come from (the `from` of step 1), and stop. File nothing and write nothing.

## 4. File the proposal as one ask

Follow the `vantage-point:ask` skill (the human queue) for the format and the hand-over. File it in `human-queue.md`, not as an issue: it is about how the person's tooling reads the repository, which belongs in no project's tracker.

- One request titled "Vantage Point conventions for <owner/repo>". Its lead-in says what conventions are, in a sentence, and that nothing is written until the rulings come back.
- One item per proposal: one per role, one per label, one per branch list, one each for ADR folders, parent links, tracker and after rulings. The question is the change, written as what you recommend, so Yes takes it ("Count stage:build as work in progress?"). The prose says what the repository shows, what Vantage Point does now, and what a yes changes; the exact value goes in a fenced `json` block, and the file and field names go on a `Refs:` line, since the card holds back an item whose prose leans on paths. Its `vantage-facts` carries `answers` and one picture: `evidence` with a `weight` for counted sources (labels in use, branches), or `steps` or `terms` where a count says nothing.
- One last item for where to write: "Write these to this repository's settings?" Recommend yes when the evidence came from this repository; recommend writing to the person's own file, by asking "Write these to your settings for every repository?", when the person said this is how they work everywhere. Its picture is `impact`: who reads the fields under each answer, and how to undo it.

Open it with the review tool and end your turn. Done when the review tool has accepted the request; if it refuses one, fix what it names and open it again.

## 5. Write from the rulings

When the rulings arrive, build one JSON object of the fields ruled yes, whole lists rebuilt from the baseline plus the yes items only, and write it to the file the last item chose:

```bash
node --experimental-strip-types "$plugin/scripts/conventions.mts" write repo --fields <fields.json>    # this repository's file
node --experimental-strip-types "$plugin/scripts/conventions.mts" write person --fields <fields.json>  # the person's file
```

It keeps every other key already in the file, and refuses a field that fails its check, naming it; fix the value and run it again, never hand-edit around it. A no on the where item writes to the other file. With no field ruled yes, write nothing. Then run step 1 again: every written field now reads `from` the file you wrote. Reply with the fields written and the file, and leave the repository's file uncommitted unless the person asks: committing it shares the conventions with everyone who clones the repository.

## Worked examples

**Vantage Point's own repository, with its owner's file present.** The owner's `~/.claude/vantage-point.json` sets agent-config's labels (`stage:backlog` parked, `stage:align` shaping, `stage:build` and `stage:ship` active, `stage:verify` accepting, `paused` and `deferred` parked with no stage), the spec forms `spec/{n}-*` and `spec/{n}`, and `unlabel`. The repository uses those labels, names branches `ticket/<n>-<slug>` (the default ticket forms) and `spec/<n>-<slug>`, keeps ADRs in `docs/adr`, and tracks issues on GitHub. Every field matches the baseline, so it proposes nothing and files nothing. Without the owner's file it would propose the seven labels, one item each, and the spec forms, with the where item recommending the person's file, since agent-config's workflow is how the owner works everywhere.

**A fresh repository set up with Matt's skills.** `docs/agents/triage-labels.md` maps his roles, the labels are his, branches are whatever the person cuts, and issues are on GitHub. Vantage Point reads the triage file itself and swaps the waiting label for the ready label after rulings, as his workflow does, so it proposes nothing beyond his defaults.

**A repository whose rules name a stage label Vantage Point does not read.** One item of the request, as it lands in `human-queue.md`, beside the where item:

````markdown
## 0012 Vantage Point conventions for acme/widgets

Status: Open
Opened: 2026-11-03 by set-conventions

Vantage Point reads each repository's labels and branch names through its conventions. These are the ones this repository shows that Vantage Point reads differently now. Nothing is written until you rule.

### Count stage:build as work in progress?

This repository's GitHub labels include stage:build, on 6 open issues, and its agent rules call Build the stage where code is written. Vantage Point gives the label no meaning now, so those issues show as plain open work with no stage on the agent card. Yes adds it to the labels Vantage Point reads, as work in progress named Build. No leaves it unread.

```json
{ "label": "stage:build", "state": "active", "stage": "Build" }
```

Refs: labels in .claude/vantage-point.json, AGENTS.md

```vantage-facts
{
  "evidence": [
    { "label": "GitHub labels", "says": "stage:build on 6 open issues", "trust": "measured", "weight": 6, "unit": "open issues", "favours": "yes" },
    { "label": "agent rules", "says": "Build is the stage where code is written", "trust": "reported", "favours": "yes" }
  ],
  "answers": {
    "yes": [{ "does": "read stage:build as work in progress" }],
    "no": [{ "does": "leave stage:build unread" }],
    "recommend": "yes"
  }
}
```

### Write these to this repository's settings?

Yes writes the fields you rule yes into a settings file inside this repository, which only this repository reads, and which everyone who clones it reads once you commit it. No writes them to your own settings file instead, which every repository you open reads unless its own file says otherwise. The label came from this repository, so this repository's file is the right home.

Refs: .claude/vantage-point.json, ~/.claude/vantage-point.json

```vantage-facts
{
  "impact": {
    "yes": [{ "what": "only this repository reads them", "reach": "small", "undo": "delete the fields from its file" }],
    "no": [{ "what": "every repository you open reads them", "reach": "wide", "undo": "delete the fields from your file" }]
  },
  "answers": {
    "yes": [{ "does": "write to this repository's settings file" }],
    "no": [{ "does": "write to your own settings file" }],
    "recommend": "yes"
  }
}
```
````

Ruled yes on both, step 5 writes `{ "labels": [<the baseline's labels>, { "label": "stage:build", "state": "active", "stage": "Build" }] }` with `write repo`, and a second run proposes nothing.
