# CLAUDE.md — nxyz agent

Operating rules for Claude (or any agent) working in this repo. Start with [`AGENTS.md`](AGENTS.md)
for the module map, then the numbered [`docs/`](docs/).

Always take concise notes of what you do, so we have an efficient and reliable code history memory.

## Operating principles

- Think before coding; inspect before editing; prefer the simplest working solution.
- Make small, surgical changes. No speculative rewrites, no new abstractions unless clearly needed.
- Preserve the existing architecture, naming style, file structure, and design language.
- Solve the actual requested problem, not adjacent imagined ones.

## Repo-specific rules

- **Never overwrite a user's note.** Every write is create-if-missing or append-only. The plugin's
  whole value is trustworthy, non-destructive memory — keep it that way.
- **No whole-vault scans.** Context is built only from the project card and its resolved links /
  backlinks. Do not introduce `vault.getMarkdownFiles()` loops for context gathering.
- **`fileUtils.ts` is the single source of truth for I/O**; `templates.ts` for strings;
  `resolveCurrentProject` for project selection. Do not duplicate that logic in command callbacks.
- **Notice on every outcome.** Success, empty result, and error each get a `new Notice(...)`.
- **Stay within v0.1 scope.** No LLM, embeddings, vector DB, PDF/image parsing, agent runtime, shell
  execution, cloud backend, or accounts. See `docs/ROADMAP.md` before adding anything AI-related.
- Use the public Obsidian API; avoid deprecated `activeLeaf` / `openLinkText` and the semi-private
  `getBacklinksForFile` (invert `resolvedLinks`).

## Before declaring work complete

- Run `npm run build` (`tsc -noEmit` typecheck + esbuild). It must pass with zero errors.
- If a check fails, report it honestly — do not claim completion on a failed verification.
- Update `CHANGELOG.md` and the relevant `docs/` file in the same change when behavior changes.
- Do not commit, tag, or push unless explicitly asked.

Always take concise notes of what you do, so we have an efficient and reliable code history memory.
