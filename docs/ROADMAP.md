# 04 — Roadmap

Staged so the plugin stays stable and trustworthy before any AI features land. Each version lists its
scope and explicit non-goals.

## v0.1 — Local context-pack MVP (current)

- Settings tab (9 persisted options).
- Project cards, context packs, agent handoff prompts.
- Work logs, build notes.
- Rule-based task & decision extraction (no LLM).
- Character-budgeted assembly that reads only the card and its resolved links.
- Safe, non-destructive writes with `Notice` feedback.

**Non-goals:** any LLM call, embeddings, vector DB, PDF/image parsing, agent runtime, shell, network.

## v0.2 — Lightweight AI provider support

- Optional, pluggable provider interface consumed by `contextPack.ts` (e.g. `summarize(text)`), used
  only to condense context. **Off by default**; bring-your-own key; local-friendly.
- No autonomous behavior — the user still triggers every action.

**Non-goals:** autonomous agents, background calls, sending data anywhere without explicit opt-in.

## v0.3 — Project dashboard

- A read-only view listing projects with status, last reviewed, and quick actions (build pack, open
  log). Built on the existing registry; no new data model.

**Non-goals:** editing project data from the dashboard beyond what commands already do.

## v0.4 — Claude Code / Codex handoff adapters

- Targeted prompt/format adapters per agent (Claude Code, Codex, Cursor), plus convenience export of
  the pack in agent-specific layouts.

**Non-goals:** invoking those agents directly or shelling out to CLIs.

## v0.5 — Embeddings (only after the basics are solid)

- Optional local/remote embeddings to improve linked-note selection and retrieval, strictly opt-in.

**Non-goals:** making embeddings mandatory or the default; replacing the deterministic core.

---

Guiding rule for every version: **lean, local-first, non-destructive, user-triggered.** Stability of
the core comes before breadth of features.
