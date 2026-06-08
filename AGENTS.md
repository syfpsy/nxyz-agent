# AGENTS.md — nxyz agent

Entry point for any AI agent or contributor working in this repo. Read this first, then the numbered
knowledge base in [`docs/`](docs/): `PRODUCT_SPEC` → `ARCHITECTURE` → `MEMORY_SCHEMA` → `ROADMAP`.

Always take concise notes of what you do, so we have an efficient and reliable code history memory.

## What this is

A lean, local-first Obsidian plugin (id `nxyz-agent`) for project memory and AI-agent handoff:
project cards, context packs, agent prompts, work logs, build notes, and task/decision extraction.
**No LLM, no embeddings, no network, no shell, no whole-vault scans, no destructive writes** in v0.1.

## Module map (`src/`)

| File | Responsibility |
| --- | --- |
| `types.ts` | Types + `DEFAULT_SETTINGS`. Zero logic, the dependency floor. |
| `fileUtils.ts` | The reusable helpers (folder/file/path/string/date, linked notes, backlinks, truncation). |
| `templates.ts` | Pure Markdown string builders for every file body and prompt. |
| `modals.ts` | Input-only UI: text prompt + fuzzy project picker. |
| `projectRegistry.ts` | Project resolution, card creation, work-log/build-note/task/decision writers, parsers. |
| `contextPack.ts` | Shared assembly core: `assembleContext` + `buildContextPack`/`buildHandoffPrompt` + `saveContextPack`. |
| `settings.ts` | `NxyzAgentSettingTab` — the settings UI. |
| `main.ts` | Plugin lifecycle + the 8 command wirings. Thin callbacks only. |

## The one rule that keeps this clean

**`fileUtils.ts` is the leaf. Every file write goes through it; every output string goes through
`templates.ts`; every "which project?" goes through `resolveCurrentProject`.** Do not duplicate file
or string logic in command callbacks. The dependency graph is acyclic:
`types` ← `fileUtils`/`templates` ← `projectRegistry`/`contextPack` ← `modals`/`settings`/`main`.

## How to add a command

1. Add the writer/parser to `projectRegistry.ts` (or assembly logic to `contextPack.ts`), using
   `fileUtils` for I/O and `templates` for strings.
2. Register it in `main.ts onload()` with a plain `name` (Obsidian adds the `nxyz agent:` prefix —
   do not prefix it yourself) and a thin callback: resolve → modal → domain fn → `Notice`.
3. Show a `Notice` on **every** terminal outcome (success, empty result, and error).
4. Never overwrite an existing user note — create-if-missing or append only.

## Build & verify

- `npm install`
- `npm run build` — must pass `tsc -noEmit` with zero errors and emit `main.js`.
- `npm run dev` — esbuild watch for live iteration in a dev vault.

## Conventions

- Surgical changes; preserve the existing architecture, naming and file structure.
- Local dates via `getCurrentDateString`/`getCurrentDateTimeString` (not `toISOString`) for filenames.
- Use the public Obsidian API; avoid deprecated `activeLeaf`/`openLinkText` and semi-private
  `getBacklinksForFile` (invert `resolvedLinks` instead).
- Update `CHANGELOG.md` and `docs/` in the same change as the code when behavior changes.

Always take concise notes of what you do, so we have an efficient and reliable code history memory.
