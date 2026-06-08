# Changelog

All notable changes to **nxyz agent** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to [SemVer](https://semver.org/).

## [Unreleased]

### Added
- **Compose: 7 instruction presets** — a "— Presets —" dropdown fills the instruction field with a
  ready-to-edit starter for common page types: Meeting notes, Design document, Sprint retrospective,
  Project brief, Blog post, README, Daily note. The preset resets after selection so it can be
  reused.
- **Control panel: last-reviewed age** — shows "last reviewed: N days/weeks/months ago" for the
  current project, derived from `last_reviewed` frontmatter. Turns warning-colored after 30 days.
- **Settings: key-set indicator** — the description of each API key field now shows "✓ Key is set."
  when a key is already saved, so you can see at a glance which providers are wired up.
- **Compose: "Load active note" button** — populates the source pane with the active note's content
  in one click, without touching the AI. Useful for manual editing or to include the note in an
  instruction (e.g. "clean up the grammar in this page").
- **Compose: live character count** — the footer now shows the source pane length in real time so
  you can see how large the generated page is.
- **Compose: auto-suggest note name from first heading** — the "Save page as" dialog is pre-filled
  with the first `#` heading found in the generated content; edit or accept.
- **Temperature setting** — the LLM temperature (0 = deterministic, 1 = creative) is now a slider
  in **Settings → nxyz agent → AI → Temperature** (default 0.3). Previously hardcoded.

### Fixed
- **Compose diff now compares against live (unsaved) editor content** — previously the overwrite diff
  read the saved disk version, so edits you'd made in the editor but not yet saved would look like
  additions from the AI. Now it reads the live editor value when the note is open.
- `saveContextPack` datetime stamps now strip spaces as well as colons (the file was named
  `my-project-2026-06-08 14-30.md`; now correctly `my-project-2026-06-08-14-30.md`).

### Added (batch 6)
- **Work log in context** — the project work log (`log.md`) is now included in the context pack and
  chat context by default. It slots in immediately after the project card (highest priority after the
  card itself) so the AI always sees recent project history. Toggled by the new **Include work log**
  setting (default on). The context pack document shows it under "Additional context" → Work log.
- **Project card template: AI override hints** — new cards now include commented-out `ai_provider`
  and `ai_model` frontmatter lines so users know the per-project override fields exist.
- README settings table updated to document the new toggle.

### Added (batch 5)
- **Control panel: "Mark reviewed today" button** — stamps `last_reviewed` to today's date in the
  project card frontmatter with one click (updates or inserts the field). The stale-indicator added
  in the previous batch now has a matching reset action.
- **Control panel: project list status dots** — a coloured dot (green = active, orange = paused,
  blue = done, gray = archived/unknown) appears before each project name in the card list.
- **Chat: "Add tasks" per-message action** — a third action button on assistant replies (alongside
  Copy and Save to log) runs `extractTasksFromContent` on the reply and appends any found tasks to
  the project `TASKS.md`. Requires a bound project.

### Added (batch 3)
- **Chat: Export conversation** — "Export" button saves the full chat as a Markdown file in the
  project work-log folder (`chat-export-<stamp>.md`), then opens it.
- **Chat: no-key hint** — the empty-state message now includes a "Open settings" link when no API
  key is configured for the active provider.
- **Chat: auto-grow input** — the input textarea expands as you type (capped by CSS `max-height`).
- **Chat/Compose: Ctrl+Enter** — Ctrl+Enter (Cmd+Enter on Mac) sends a chat message or triggers
  Compose generation from the instruction field.
- **Compose: word count** — the footer now shows `N chars · N words` (alongside the char count).
- **Control panel: extra project meta** — repo, domain, and stack from the card frontmatter are
  shown below the project status when present.

### Internal
- `extractFirstHeading` helper in `templates.ts`; `initialValue` option in `promptForText`.
- Temperature is threaded through `streamOrComplete` opts instead of being a separate argument.
- Chat imports `createFileIfMissing`, `getCurrentDateTimeString`, `openFile` for conversation export.

---

### Fixed (from previous pass — included in this release)
- Compose: a stream→non-streaming fallback could duplicate the partially-streamed text; the final
  content is now taken from the authoritative full reply.
- Heading demotion when saving a chat reply to the work log no longer rewrites `#` comment lines
  inside fenced code blocks.
- Streaming: a final SSE event arriving without a trailing newline is no longer dropped.
- `truncateForCompose` now respects its character cap (it could exceed it by the marker length).
- Ignored-folder matching now also matches multi-segment fragments (e.g. `a/b`), not just single segments.
- Build notes are stamped to the minute, so capturing the same note twice in a day no longer no-ops.
- Chat error replies are surfaced via Notice only — they are no longer persisted to history or
  re-sent to the provider on the next turn.

### Changed (from previous pass)
- Chat: when streaming is off (uncancellable), the send button shows a disabled "Working…" instead of
  a "Stop" that did nothing.
- Control panel re-renders only on changes inside the registry folder, not on every vault write.
- README corrected: the Commands and Privacy sections no longer imply the plugin has no AI/network use.

### Internal (from previous pass)
- Shared `streamOrComplete`, `errorMessage`, and `activeMarkdownFile` helpers remove duplicated
  streaming/error/active-file logic across the chat, compose, and main modules.
- Use `cachedRead` for context assembly; drop dead CSS, an unused modal option, a redundant re-export,
  and an inline style (moved to a CSS class).

## [0.1.1] — 2026-06-08

### Changed
- **Default folders are now plugin-named** (`nxyz agent`, `nxyz agent/Context Packs`,
  `nxyz agent/Work Logs`) instead of `09 Repo Registry…`, so a fresh install never lands its project
  cards in an unrelated PARA-style folder. Existing installs keep their saved folders — change them in
  **Settings → nxyz agent** if you want the new layout.

### Internal
- Added `docs/DISTRIBUTION.md` (install / BRAT / release flow / public-readiness).

## [0.1.0] — 2026-06-08

First release. A local-first project-memory and agent-handoff plugin with an **opt-in AI layer**
(chat) and an **AI page-authoring centerpiece** (Compose).

### Added

**Core (deterministic, local, no LLM):**
- Settings tab with 9 persisted options (registry / context-pack / work-log folders, default status,
  ignored folders, max context characters, include linked notes / backlinks / active note).
- **Create project card** — structured card in the registry folder; opens it if it already exists.
- **Build context pack for current project** — character-budgeted assembly of the card plus optional
  active note, linked notes and backlinks; saves the pack, copies the agent prompt, opens it.
- **Copy agent handoff prompt** — the same prompt to the clipboard, with a save-to-file fallback.
- **Append work log** — dated entry appended to `Work Logs/<slug>/log.md`.
- **Create build note from current note** — structured build note from the active note.
- **Extract tasks** / **Extract decisions** — append parsed items to per-project `TASKS.md` /
  `DECISIONS.md` (tasks preserve `- [x]` done state; each item is source-linked).
- **Control panel** (right-sidebar view): current project + status, one-click buttons for every
  action, and a clickable list of project cards. Opened via the bot ribbon or the **Open panel** command.
- Reusable helpers in `src/fileUtils.ts`; shared context-assembly core in `src/contextPack.ts`;
  `resolveProjectNonInteractive` for passive project detection.
- Zero-dependency unit tests (esbuild + Node `node:test` against an `obsidian` stub) — run `npm test`.
- Documentation: `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/` (product spec, architecture, memory
  schema, roadmap); `.gitattributes`.

**AI (opt-in, bring your own key):**
- **AI chat panel** over **DeepSeek / OpenRouter / OpenAI** (one OpenAI-compatible client in
  `src/providers.ts`). Settings: provider selector, per-provider API key + model, stream toggle.
- **Streaming** responses (fetch/SSE) with a **Stop** control and a non-streaming `requestUrl`
  fallback; **Continue** to extend a reply/page truncated at the model's length limit.
- Chat is grounded in the **current project and the live open note** (works with no project too);
  **Markdown-rendered** replies with per-message **Copy** / **Save to log**; **per-project chat
  history** persisted in `data.json`; **quick-action prompts** (Summarize / Next step / Tasks /
  Risks); **per-project model override** via card frontmatter (`ai_provider` / `ai_model`).
- **Compose — AI page authoring/editing (centerpiece).** Describe a page or rewrite the open note; the
  agent authors rich Obsidian Markdown (callouts, Mermaid, math, tables, task lists, links/embeds,
  footnotes, Dataview/Templater when installed). Editable source + live sanitized preview; **Apply**
  creates a new note (never overwrites) or replaces the active note after a **line-diff confirm**; the
  edit target is pinned to the generation and new-note names are sanitized; **Continue** for long pages.

### Security
- Local-first core: no network, no whole-vault scans, and no destructive/overwriting writes
  (create-if-missing / append-only) — the one exception is an explicit Compose **Apply** (preview +
  diff/confirm first).
- The AI layer is opt-in: nothing leaves the device unless a key is set and you use the chat/Compose.
  Keys live in `data.json` (git-ignored) and are sent only to the selected provider.
- Rendered model output is sanitized: executable code fences
  (`dataviewjs`/`dataview`/`js-engine`/`templater`/`meta-bind`…) — including those nested inside
  callouts/blockquotes — are relabelled inert and `![[…]]` transclusions neutralized. Compose places
  untrusted card/note content in the user turn as delimited data, not the system role.
