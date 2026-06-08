# nxyz agent

A lean, **local-first** Obsidian plugin that turns your vault into structured project memory and an
AI-agent handoff system. For each project it keeps a Markdown **project card**, builds a focused
**context pack**, and prepares a clean **agent prompt** you can paste into Claude Code, Codex, Cursor,
ChatGPT, or any coding agent. It also includes an **optional, bring-your-own-key AI layer** — a chat
and an AI page-authoring view (**Compose**).

It is **not** a generic "chat with my notes" plugin. The core (cards, context packs, work logs,
task/decision extraction, control panel) is fully local and makes **no** network requests.

> **Network use.** The optional AI features (chat and Compose) send the current note/project context
> and your messages to the **LLM provider you choose** (DeepSeek, OpenRouter, or OpenAI) — and only
> then. Nothing is sent unless you add an API key and use those features. Your key is stored locally
> in the plugin's `data.json`. No telemetry, no cloud backend, no other network access.

## What it does

- **Create project cards** — one structured card per project (repo, stack, status, decisions, log).
- **Build context packs** — gather the card + optional active note, linked notes and backlinks into a
  single, character-budgeted document with a copy-paste-ready agent prompt.
- **Copy agent handoff prompts** — the same prompt, straight to your clipboard, no file written.
- **Append work logs** — dated entries appended to a per-project log.
- **Create build notes** — capture the current note as a structured build note.
- **Extract tasks & decisions** — pull checkboxes / TODO-style lines and decision statements out of a
  note into per-project `TASKS.md` / `DECISIONS.md` (append-only, never overwritten).
- **Control panel** — a right-sidebar view with the current project, one-click actions, and your card list.
- **AI chat** *(optional, BYOK)* — a project-grounded chat; see "AI chat" below.
- **Compose** *(optional, BYOK)* — author or rewrite rich Obsidian pages with AI; see "Compose" below.

## What it does NOT do

No embeddings · no vector DB · no PDF/image parsing · no autonomous agent runtime · no shell
execution · no telemetry · no cloud backend · no login/accounts · no whole-vault scans. The
deterministic core never overwrites a note; the only write that replaces a file is an explicit
**Compose → Apply** (shown as a diff, with confirmation). See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Install (local development)

1. `npm install`
2. `npm run dev` (watch) or `npm run build` (one-off production bundle → `main.js`).
3. Copy or symlink `main.js`, `manifest.json` and `styles.css` into
   `<YourVault>/.obsidian/plugins/nxyz-agent/`.
   - PowerShell symlink (Developer Mode or admin):
     ```powershell
     New-Item -ItemType SymbolicLink -Path "C:\YourVault\.obsidian\plugins\nxyz-agent" -Target "C:\Repos\nxyz_obsidian"
     ```
4. Obsidian → Settings → Community plugins → enable **nxyz agent**.

## Commands

In the command palette they appear prefixed with `nxyz agent:`. The ribbon icon (the bot) opens the
**control panel**, a right-sidebar view with the current project, one-click buttons for every action,
and a clickable list of your project cards. Everything is local and deterministic — there is no chat
or AI in this version.

| Command | What it does |
| --- | --- |
| Open panel | Open the control panel in the right sidebar. |
| Create project card | Prompt for a name, create a card in the registry folder (opens it if it exists). |
| Build context pack for current project | Assemble a context pack, save it, copy the prompt, open it. |
| Copy agent handoff prompt | Build the agent prompt and copy it to the clipboard (no file). |
| Append work log | Prompt for an entry and append a dated section to the project log. |
| Create build note from current note | Capture the active note as a structured build note. |
| Extract tasks from current note | Append checkboxes / TODO-style lines to the project `TASKS.md`. |
| Extract decisions from current note | Append decision statements to the project `DECISIONS.md`. |

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| Project registry folder | `nxyz agent` | Where project cards live. |
| Context pack output folder | `nxyz agent/Context Packs` | Where context packs are written. |
| Work log folder | `nxyz agent/Work Logs` | Per-project logs, tasks, decisions, build notes. |
| Default project status | `active` | Status stamped into a new card. |
| Ignored folders | `.obsidian, .git, node_modules, dist, build` | Skipped when reading linked notes / backlinks. |
| Maximum context characters | `24000` | Hard ceiling on the assembled agent context. |
| Include linked notes | `true` | Include notes the card links out to. |
| Include backlinks | `false` | Include notes that link back to the card. |
| Include current active note | `true` | Include the currently open note. |

## Recommended vault structure

```
nxyz agent/
  my-project.md                       ← project card
  Context Packs/
    my-project-2026-06-08 14-30.md    ← generated packs
  Work Logs/
    my-project/
      log.md                          ← dated work log
      TASKS.md                        ← extracted tasks
      DECISIONS.md                    ← extracted decisions
    build-notes/
      <note-title>-2026-06-08.md      ← build notes
```

## Compose — AI page authoring (centerpiece)

Open **Compose** (the wand ribbon icon, the *Compose page with AI* command, or the control-panel
button) to have the agent write rich Obsidian pages for you:

- Choose **New note** or **Edit active note**, describe the page (or how to rewrite the open one), and
  **Generate**. The agent uses Obsidian-flavored Markdown — callouts, Mermaid diagrams, math, tables,
  task lists, internal links/embeds, footnotes, and Dataview/Templater blocks when those plugins are
  installed — guided by a built-in features guide.
- **Editable source on the left, live preview on the right.** The preview is sanitized (Mermaid/math/
  callouts render; LLM plugin code stays inert until you save and open the real note).
- **Apply** creates a new note (never overwrites) or replaces the active note **after a confirmation**.
  The saved file keeps the full raw Markdown with all features. Nothing is written without your Apply.

## AI chat (bring your own key)

Optional. Open the **AI chat** panel (chat ribbon icon, the *Open AI chat* command, or the control
panel button) to talk to a model grounded in the current project — its handoff prompt (constraints +
condensed context) is sent as the system message.

- Providers: **DeepSeek**, **OpenRouter**, **OpenAI** (all OpenAI-compatible). Pick one and paste its
  key under **Settings → nxyz agent → AI (bring your own key)**, with an optional model override.
- Keys are stored locally in the plugin's `data.json` and are sent only to the provider you select,
  and only when you use the chat.
- Replies **stream** token-by-token (toggle in settings); a **Stop** button cancels a stream, and the
  client falls back to a single non-streamed response if streaming is blocked. Each project's
  conversation is **saved per project** and restored when you reopen the chat.
- **Per-project override:** add `ai_provider:` and/or `ai_model:` to a project card's frontmatter to
  make that project's chat use a different provider/model than the global default. The chat header
  shows the effective provider · model.

## Privacy model

The deterministic core is fully local: it only reads/writes files in your vault via the Obsidian API
and copies prompts to your clipboard — no telemetry, no network. **The AI chat is the only feature
that leaves your machine:** when you send a message, the selected provider receives your current
project's context and your messages. If you never enter a key or use the chat, nothing is sent
anywhere. Your API keys live in `data.json` inside the plugin folder (not in your notes).

## Roadmap

`v0.1` local context-pack MVP (this release) → `v0.2` lightweight AI provider → `v0.3` project
dashboard → `v0.4` Claude Code / Codex handoff adapters → `v0.5` embeddings (only after the basics are
solid). Full detail in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## License

MIT.
