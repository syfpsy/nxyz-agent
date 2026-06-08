# Changelog

All notable changes to **nxyz agent** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to [SemVer](https://semver.org/).

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
