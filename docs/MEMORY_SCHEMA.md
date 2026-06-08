# 03 — Memory Schema

The on-disk Markdown formats nxyz agent reads and writes. All paths are relative to the configured
folders (defaults shown). Everything is plain Markdown — readable and editable by hand.

## Folder tree

```
nxyz agent/                               (project registry folder)
  <slug>.md                               project cards
  Context Packs/                          (context pack output folder)
    <slug>-<YYYY-MM-DD HH-mm>.md          one pack per build
  Work Logs/                              (work log folder)
    <slug>/
      log.md                              dated work-log sections (append-only)
      TASKS.md                            extracted tasks (append-only)
      DECISIONS.md                        extracted decisions (append-only)
    build-notes/
      <note-title>-<YYYY-MM-DD>.md        build notes
```

`<slug>` is the project card's filename (lowercase, hyphenated).

## Project card

```markdown
---
type: project
status: active
repo: ""
domain: ""
stack: []
tags: [project, nxyz-agent]
last_reviewed: YYYY-MM-DD
agent_scope: one-repo-at-a-time
---

# Project Name

## One-line purpose
## Status
active
## Repo / links
## Stack
## Current problem
## Important decisions
## Recent work log
## Agent instructions

Always take concise notes of what you do, so we have an efficient and reliable code history memory.

## Notes
```

`type: project` is what `resolveCurrentProject` keys on. Created only if missing — an existing card is
opened, never overwritten.

Optional AI overrides may be added to a card's frontmatter to make the chat use a different
provider/model for that project (otherwise the global settings apply):

```yaml
ai_provider: openrouter        # deepseek | openrouter | openai (invalid values ignored)
ai_model: anthropic/claude-3.5-sonnet
```

## Context pack

```markdown
# Context Pack — Project Name

Generated: YYYY-MM-DD HH:mm

## Purpose
Prepare focused context for an AI coding or writing agent.

## Project summary
[full project card content]

## Additional context
[current note, linked notes, optional backlinks]

## Settings summary
[which include* toggles, char limit and ignored folders applied]

## Constraints
* Work one project at a time.
* … (see CONTEXT_CONSTRAINTS in templates.ts)

## Agent prompt
[ready-to-paste prompt, ending with the condensed Context block]
```

The condensed context inside the agent prompt is trimmed to `maxContextChars` (a truncation marker is
inserted and the document notes it).

## Work log (`Work Logs/<slug>/log.md`)

Append-only. Each entry:

```markdown
## YYYY-MM-DD HH:mm

### Note
[user note]

### Source
* Added from nxyz agent Obsidian plugin.
```

## Build note (`Work Logs/build-notes/<title>.md`)

```markdown
---
type: build-note
project: <slug>
date: YYYY-MM-DD
source: current-note
---

# Build Note — <title>

## Request
## Context used
Source note: [[<source note>]]
[source note content]
## Actions taken
## Files changed
## Verification
## Next steps
```

## Tasks (`Work Logs/<slug>/TASKS.md`)

Header written once on creation, then append-only lines. Sources: Markdown checkboxes (`- [ ]`,
`- [x]`) and lines containing `TODO`, `FIXME`, `NEXT`, `Action`, or `Follow-up`. A checked source
box (`- [x]`) is preserved as done; keyword lines are written as open.

```markdown
# Tasks — <slug>

- [ ] <task text>  (from [[source note]])
- [x] <already-done task>  (from [[source note]])
```

## Decisions (`Work Logs/<slug>/DECISIONS.md`)

Header written once, then append-only. Sources: lines / headings containing `Decision`, `Decided`,
`We decided`, `Final choice`, or `Chosen approach`.

```markdown
# Decisions — <slug>

- <decision text>  (from [[source note]])
```
