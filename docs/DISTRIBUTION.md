# 05 — Distribution & Releasing

How to install, release, and (if/when chosen) publish **nxyz agent**. The repo is currently
**private** (`syfpsy/nxyz-agent`).

## Install methods

### Manual (any vault)
1. Download `main.js`, `manifest.json`, `styles.css` from a [release](https://github.com/syfpsy/nxyz-agent/releases).
2. Copy them into `<vault>/.obsidian/plugins/nxyz-agent/`.
3. Obsidian → **Settings → Community plugins** → enable **nxyz agent**.

### BRAT — beta installs, works with a PRIVATE repo
BRAT (Beta Reviewers Auto-update Tool) installs/updates a plugin straight from GitHub releases.
1. Install the **BRAT** community plugin.
2. **Private repo:** BRAT settings → add a **GitHub personal access token** with read access to the
   repo (classic token with `repo` scope, or a fine-grained token scoped to `syfpsy/nxyz-agent`
   contents:read). Without it BRAT can't see a private repo's releases.
3. BRAT → **Add beta plugin** → enter `syfpsy/nxyz-agent` → it pulls the latest release assets.
4. Updates: BRAT auto-checks on launch; or run **Check for updates**.

### Dev (live iteration)
Junction the plugin folder at the repo root, then `npm run dev` (rebuilds `main.js` on save);
reload with `Ctrl+R` or the Hot-Reload plugin.
```
cmd /c mklink /J "<vault>\.obsidian\plugins\nxyz-agent" "C:\Repos\nxyz_obsidian"
```

## Cutting a release
1. Update `CHANGELOG.md`.
2. Bump the version (updates `manifest.json` + `versions.json` via `version-bump.mjs`):
   `npm version patch | minor | major`.
3. `npm run build` (production `main.js`).
4. Create the release with the three assets:
   `gh release create <version> --title "nxyz agent <version>" --notes-file NOTES.md main.js manifest.json styles.css`
5. **The tag must equal the manifest version with NO `v` prefix** (e.g. `0.2.0`, not `v0.2.0`) —
   Obsidian/BRAT match on this.

> Deploy discipline: never publish a release or flip visibility without explicit owner confirmation.

## Going public — checklist (one-way decision)
Security is already clean: `data.json` (API keys) was never committed, no secrets in history, commits
use the GitHub noreply email, no personal paths/names in tracked files. The decision is **strategic**,
not a leak risk. Public is effectively irreversible (clones/forks/caches persist).

- [ ] **License intent.** Repo is **MIT** → anyone may fork, rebrand, or sell with attribution.
      Decide deliberately; keep private to stay proprietary.
- [ ] **Prominent network/data disclosure** in `README.md`: the AI features send the current
      note/project context and your messages to the **selected LLM provider** (BYOK); keys are stored
      locally in `data.json`; nothing is sent unless a key is set and you use chat/Compose.
- [ ] **No telemetry / no hidden network** beyond the user-triggered provider calls (true today).
- [ ] Re-confirm history is clean before flipping (it is).
- [ ] Flip: `gh repo edit syfpsy/nxyz-agent --visibility public` (confirm with owner first).

## Obsidian community catalog (optional — requires public + OSS)
Public listing in Obsidian's in-app browser requires a public, OSS repo and a one-time submission.
- **Requirements:** public repo; OSS license; a GitHub release whose tag == `manifest.version`
  (no `v`) with `main.js` + `manifest.json` + `styles.css` attached; clear `description`; reviewers
  are strict about **network-use disclosure** and no undisclosed telemetry.
- **Submit:** PR to `obsidianmd/obsidian-releases` adding an entry to `community-plugins.json`
  (`id: nxyz-agent`, `name`, `author`, `description`, `repo: syfpsy/nxyz-agent`). Automated checks +
  manual review follow.
- **After merge:** the plugin appears under **Community plugins → Browse** for all users.

Always take concise notes of what you do, so we have an efficient and reliable code history memory.
