# Changelog

All notable changes to **nxyz agent** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to [SemVer](https://semver.org/).

## [Unreleased]

### Fixed
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

### Changed
- Chat: when streaming is off (uncancellable), the send button shows a disabled "Working…" instead of
  a "Stop" that did nothing.
- Control panel re-renders only on changes inside the registry folder, not on every vault write.
- README corrected: the Commands and Privacy sections no longer imply the plugin has no AI/network use.

### Internal
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
