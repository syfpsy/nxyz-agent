# Changelog

All notable changes to **nxyz agent** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to [SemVer](https://semver.org/).

## [Unreleased]

### Added
- **AI chat panel (bring your own key)** — a right-sidebar chat that grounds the model in the current
  project (its handoff prompt is sent as the system message). Providers: **DeepSeek, OpenRouter,
  OpenAI** (all OpenAI-compatible). New settings: provider selector, an API key + model per provider.
  Requests go through Obsidian's `requestUrl` (no CORS, works on mobile); non-streaming. Opened via
  the new chat ribbon icon, the **Open AI chat** command, or the control panel button.
- `src/providers.ts` — one OpenAI-compatible client with per-provider base URL / key / model and
  clear error surfacing.
- **Streaming chat responses** (token-by-token) via `fetch`/SSE, with a **Stop** control and an
  automatic fallback to the non-streaming `requestUrl` path if streaming is blocked. New
  **Stream responses** setting (on by default).
- **Per-project chat history** — conversations are saved per project (keyed by slug) in the plugin's
  `data.json` and restored when you reopen the chat or reload its context.
- **Markdown-rendered chat replies** plus per-message **Copy** and **Save to log** actions (the latter
  appends the reply to the project work log, with headings demoted so they don't shadow the log outline).
- **Control panel** (right-sidebar `ItemView`): shows the current project + status, one-click buttons
  for all 7 actions, and a clickable list of project cards. Deterministic and local — no AI. Opened
  via the ribbon or the new **Open panel** command; it refreshes on context and registry changes.
- `resolveProjectNonInteractive` (tiers 1–2, no picker) so the panel reflects the active project
  passively.
- Ribbon icon shortcut and an **Open panel** command.
- Unit tests for the pure logic (slugify, truncate, ignore matching, task/decision extraction, date
  helpers) via a zero-dependency harness: esbuild bundles the tests against a small `obsidian` stub
  and Node's built-in `node:test` runner executes them. Run with `npm test`.
- `.gitattributes` to normalize line endings (LF in repo) and mark `main.js` as generated.

### Changed
- The ribbon icon now **opens the control panel** (which hosts every action) instead of directly
  building a context pack.
- Task extraction now preserves a checked source box (`- [x]`) as done in `TASKS.md` instead of
  rewriting it as an open task. Keyword lines (TODO/FIXME/…) are still written as open.
- Author/developer name set to `nxyz` in `manifest.json` and `package.json`.

### Security
- Model replies are sanitized before Markdown rendering: executable code fences
  (`dataviewjs`/`dataview`/`js-engine`/`templater`/`meta-bind`…) are relabelled inert and `![[…]]`
  transclusions are neutralized, so a reply can't run plugin code or inline arbitrary notes. Link
  resolution is anchored to the project card rather than the vault root.

### Fixed
- Symbol-only project / build-note names that slugify to an empty string now fall back to
  `untitled` / `build-note` instead of producing a hidden `.md` file.
- Chat: abort the in-flight request on panel close; don't re-render after unload; protect the
  conversation from being lost or mis-persisted if context is reloaded/cleared mid-stream; no
  message actions on the still-streaming placeholder.
- Chat CSS: code blocks preserve their whitespace (no longer collapsed to one line); Copy / Save
  actions are reachable on touch devices (not hover-only).

### Internal
- Removed an unused `asFile` helper from `fileUtils.ts`.
- Persistence restructured to `{ settings, chats }` in `data.json`, with a backward-compatible
  migration from the previous flat settings format (existing settings/keys are preserved).

## [0.1.0] — 2026-06-08

Initial local context-pack MVP.

### Added
- Plugin scaffold: `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`,
  `versions.json`, `version-bump.mjs`, `styles.css`.
- Settings tab with 9 persisted options (registry/context-pack/work-log folders, default status,
  ignored folders, max context characters, include linked notes / backlinks / active note).
- Command: **Create project card** — structured card in the registry folder; opens if it exists.
- Command: **Build context pack for current project** — character-budgeted assembly of the card plus
  optional active note, linked notes and backlinks; saves the pack, copies the agent prompt, opens it.
- Command: **Copy agent handoff prompt** — same prompt to the clipboard, with a save-to-file fallback.
- Command: **Append work log** — dated entry appended to `Work Logs/<slug>/log.md`.
- Command: **Create build note from current note** — structured build note from the active note.
- Command: **Extract tasks from current note** — checkboxes + TODO/FIXME/NEXT/Action/Follow-up lines
  appended to `Work Logs/<slug>/TASKS.md`.
- Command: **Extract decisions from current note** — decision-keyword lines appended to
  `Work Logs/<slug>/DECISIONS.md`.
- `src/fileUtils.ts` reusable helpers; shared context-assembly core in `src/contextPack.ts`.
- Documentation: `README.md`, `AGENTS.md`, `CLAUDE.md`, and `docs/` (product spec, architecture,
  memory schema, roadmap).

### Security
- Local-first by design: no network, no LLM, no embeddings, no shell, no whole-vault scans, and no
  destructive or overwriting writes (create-if-missing / append-only).
