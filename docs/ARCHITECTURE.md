# 02 — Architecture

## Module breakdown

```
src/
  types.ts            types + DEFAULT_SETTINGS (no logic, dependency floor)
  fileUtils.ts        reusable I/O / path / string / date helpers (the leaf)
  templates.ts        pure Markdown string builders
  modals.ts           text prompt + fuzzy project picker (input only)
  projectRegistry.ts  project resolution, card creation, writers, parsers
  contextPack.ts      shared context assembly + pack/prompt builders + saver
  settings.ts         NxyzAgentSettingTab (settings UI)
  view.ts             NxyzAgentView — right-sidebar control panel (ItemView)
  providers.ts        OpenAI-compatible chat client (DeepSeek/OpenRouter/OpenAI)
  chatView.ts         NxyzAgentChatView — AI chat panel (ItemView)
  main.ts             plugin lifecycle + command wiring (thin callbacks)
```

The control panel (`view.ts`) is a thin launcher: it reads the current project via
`resolveProjectNonInteractive` (tiers 1–2, never a picker), lists cards via `listProjectCards`, and
its buttons call the plugin's public command methods — passing the panel's current project so they
skip re-resolution. It holds no business logic and re-renders on `active-leaf-change`, `file-open`,
and vault create/delete/rename.

## Dependency graph (acyclic)

```
types  ◄── fileUtils
types  ◄── templates
types, fileUtils, templates  ◄── projectRegistry
types, fileUtils, templates  ◄── contextPack
all of the above  ◄── modals, settings, main
```

`settings.ts` imports the plugin only as a **type** (`import type NxyzAgentPlugin`), so the
`main ↔ settings` relationship erases at compile time and there is no runtime cycle.

## Command flow

Every command in `main.ts` is a thin callback following the same shape:

```
resolve (if project-scoped) ──► modal (if input needed) ──► domain function ──► Notice
```

No business logic lives in `main.ts` beyond wiring and `Notice` messaging. The domain functions live
in `projectRegistry.ts` and `contextPack.ts`.

### `resolveCurrentProject` — the one resolver

Used by build-context-pack, copy-handoff-prompt, append-work-log, extract-tasks, extract-decisions.
Three tiers, in order:

1. The **active file** if its frontmatter `type` is `project`.
2. A **registry card whose basename equals the active note's title**.
3. A **fuzzy picker** over all cards in the registry folder.

Returns `null` only when there are no cards, or the picker is cancelled. Every caller treats `null`
as "show a `Notice`, abort". Result: `{ file, slug = file.basename, meta, name }`.

### Shared context core

`assembleContext` gathers the card content plus the optional active note, linked notes and backlinks
(honouring the `include*` toggles and `ignoredFolders`). It reads **only** the card and its resolved
links — never the whole vault. `buildContextPack` and `buildHandoffPrompt` both call `assembleContext`
then `condenseContext` (priority order: card → active → linked → backlinks) with `truncateToLimit`
applied to honour `maxContextChars`. This is why the two prompt commands never drift apart.

## Data flow

```
project card (+ resolved links)
   ─► assembleContext ─► ContextAssembly
        ─► condenseContext (budget) ─► condensed text
             ─► agentPromptTemplate  ─► prompt  ─► clipboard
             ─► contextPackTemplate  ─► doc     ─► saveContextPack ─► file ─► openFile
```

## File-write safety

- All writes funnel through `fileUtils`: `ensureFolder` (idempotent, nested), `createFileIfMissing`
  (never overwrites; returns `{file, created}`), `appendToFile` (create-if-missing then append).
- Cards and build notes are **create-if-missing**; logs, tasks and decisions are **append-only**.
- Context packs use a datetime-suffixed filename; on the rare collision a `-2`, `-3` … suffix is added.
- Missing folders are created on demand; nothing is ever deleted or overwritten.

## AI provider layer

`providers.ts` is a single OpenAI-compatible chat client. DeepSeek, OpenRouter and OpenAI share the
`/chat/completions` shape, so `resolveProvider(settings)` picks the base URL / key / model for the
selected provider and `chatComplete(config, messages)` issues the call via Obsidian's `requestUrl`
(no CORS, mobile-safe), surfacing API errors with the provider name. `chatView.ts` builds its system
message by reusing `assembleContext` + `buildHandoffPrompt`, so the chat is grounded in exactly the
same context pack the deterministic commands produce — there is no second context path.

AI is **opt-in and isolated**: nothing is sent anywhere unless a key is set and the chat is used. The
deterministic core (commands, control panel, file I/O) has no dependency on `providers.ts`. A future
step can reuse `chatComplete` to, e.g., summarize context inside `condenseContext` — without touching
commands or I/O.

## Recorded decisions

- **Added `src/fileUtils.ts`** (an 8th source file beyond the spec's 7) as a dependency-free leaf so
  the helpers have one home and command logic stays free of duplication.
- **Slug = card filename** (`ResolvedProject.slug = file.basename`) — stable and re-derivable without
  re-reading frontmatter.
- **Grouped per-project layout**: `Work Logs/<slug>/log.md`, `TASKS.md`, `DECISIONS.md` live together;
  build notes under `Work Logs/build-notes/`.
- **Datetime-suffixed context-pack filenames** keep a history of handoffs.
- **Lean dependencies**: only `obsidian`, `typescript`, `esbuild`, `@types/node`. ESLint deferred.
