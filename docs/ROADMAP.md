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

- **Delivered (Unreleased):** bring-your-own-key chat over DeepSeek / OpenRouter / OpenAI
  (`providers.ts`), an AI chat panel (`chatView.ts`) grounded in the current project's context,
  **streaming responses** with a non-streaming fallback, and **per-project chat history** persisted
  in `data.json`. Opt-in; nothing is sent unless a key is set and the chat is used.
- Also delivered: Markdown-rendered replies with Copy / Save-to-log actions, and a **per-project
  provider/model override** via project-card frontmatter (`ai_provider` / `ai_model`).
- Remaining: using `chatComplete` to optionally summarize context inside `condenseContext`;
  conversation export; optional encryption of stored keys.

**Non-goals:** autonomous agents, background calls, sending data anywhere without explicit opt-in.

## v0.3 — Project dashboard

- **Partially delivered early** (Unreleased): a right-sidebar control panel (`view.ts`) lists project
  cards with the current project + status and one-click actions.
- Remaining: surface `last_reviewed` and richer per-project state in the list; inline open of the
  work log; light sorting/filtering. Built on the existing registry; no new data model.

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
