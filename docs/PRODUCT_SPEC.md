# 01 — Product Spec

## Positioning

**nxyz agent** turns an Obsidian vault into structured project memory and an AI-agent handoff system.
It is local-first and deterministic: it produces clean Markdown and copy-paste prompts, not chat.

It is explicitly **not** a "chat with my notes" plugin and not a clone of existing AI-in-Obsidian
tools. The closest mental model is a simple, hand-rolled context-pack / MCP workflow, implemented as
native Obsidian commands and UI.

## Target user

A builder juggling many apps, repos, products and ideas who:

- lives in Obsidian for notes and planning,
- hands work off to coding agents (Claude Code, Codex, Cursor, ChatGPT) repeatedly,
- wants a fast, repeatable way to package "here's the project, here's the state, here's the next step"
  without leaking unrelated context or scanning the whole vault.

## Core workflow

1. **Create a project card** — one structured note per project (repo, stack, status, decisions, log).
2. **Work in the vault** — keep notes; append work-log entries as you go.
3. **Build a context pack** when handing off — the plugin gathers the card (and optionally the active
   note, linked notes, backlinks), trims to a character budget, and writes a pack plus a ready prompt.
4. **Copy the agent prompt** into your coding agent and continue. The agent is told to make small,
   focused changes and to keep concise notes.
5. **Extract tasks / decisions** from working notes into per-project `TASKS.md` / `DECISIONS.md`.
6. **Capture build notes** from any note for a durable record of a unit of work.

## v1 scope (v0.1)

- Settings tab with 9 persisted options.
- 7 commands: create project card, build context pack, copy handoff prompt, append work log, create
  build note, extract tasks, extract decisions (the settings tab is the 8th registration).
- Rule-based extraction only (Markdown checkboxes + keyword lines; decision keyword lines).
- Character-budgeted context assembly that reads only the card and its resolved links.
- Safe, non-destructive writes: create-if-missing and append-only, with `Notice` feedback.

## Non-goals (v0.1)

No embeddings · no vector database · no PDF/image parsing · no autonomous agent runtime · no shell
command execution · no cloud backend · no login/account system · no marketplace licensing · no
destructive file operations · no automatic overwrite of user notes · no whole-vault scanning.

These are deliberate. The plugin must be **stable and trustworthy before any AI features** are added;
see [`ROADMAP.md`](ROADMAP.md) for the staged path to lightweight AI support.
