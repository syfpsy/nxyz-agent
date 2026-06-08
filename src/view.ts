import { ItemView, WorkspaceLeaf, normalizePath } from "obsidian";
import type NxyzAgentPlugin from "./main";
import {
	listProjectCards,
	resolveProjectNonInteractive,
} from "./projectRegistry";
import { openFile } from "./fileUtils";

export const NXYZ_VIEW_TYPE = "nxyz-agent-view";

/**
 * Deterministic control panel (right sidebar). It passively reflects the
 * current project from the active note, offers one-click actions, and lists
 * project cards. No AI, no network — every button calls an existing plugin
 * command. The panel never forces a picker just to render.
 */
export class NxyzAgentView extends ItemView {
	constructor(leaf: WorkspaceLeaf, private readonly plugin: NxyzAgentPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return NXYZ_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "nxyz agent";
	}

	getIcon(): string {
		return "bot";
	}

	async onOpen(): Promise<void> {
		// Re-render on context changes…
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.render())
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => this.render())
		);
		// …and on registry-folder changes only (not every vault write).
		const touchesRegistry = (path: string): boolean => {
			const r = normalizePath(this.plugin.settings.projectRegistryFolder);
			const p = normalizePath(path);
			return p === r || p.startsWith(`${r}/`);
		};
		this.registerEvent(
			this.app.vault.on("create", (f) => {
				if (touchesRegistry(f.path)) this.render();
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (f) => {
				if (touchesRegistry(f.path)) this.render();
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (f, oldPath) => {
				if (touchesRegistry(f.path) || touchesRegistry(oldPath)) this.render();
			})
		);
		this.render();
	}

	/** Run an action, then re-render so the panel reflects any new state. */
	private async runAndRefresh(action: () => Promise<void>): Promise<void> {
		await action();
		this.render();
	}

	render(): void {
		const { plugin } = this;
		const root = this.contentEl;
		root.empty();
		root.addClass("nxyz-view");

		root.createEl("div", { cls: "nxyz-view-title", text: "nxyz agent" });

		const current = resolveProjectNonInteractive(this.app, plugin.settings);

		// Current project box.
		const box = root.createDiv({ cls: "nxyz-view-project" });
		if (current) {
			box.createEl("div", {
				cls: "nxyz-view-project-name",
				text: current.name,
			});
			const status = (current.meta.status as string) || "—";
			box.createEl("div", {
				cls: "nxyz-view-project-status",
				text: `status: ${status}`,
			});
			// Show extra card meta when present.
			const metaLines: string[] = [];
			if (current.meta.repo && typeof current.meta.repo === "string" && current.meta.repo.trim()) {
				metaLines.push(`repo: ${current.meta.repo.trim()}`);
			}
			if (current.meta.domain && typeof current.meta.domain === "string" && current.meta.domain.trim()) {
				metaLines.push(`domain: ${current.meta.domain.trim()}`);
			}
			const stack = current.meta.stack;
			const stackStr = Array.isArray(stack)
				? stack.filter((s): s is string => typeof s === "string" && s.trim() !== "").join(", ")
				: typeof stack === "string" ? stack.trim() : "";
			if (stackStr) metaLines.push(`stack: ${stackStr}`);
			if (metaLines.length > 0) {
				box.createEl("div", {
					cls: "nxyz-view-project-meta",
					text: metaLines.join(" · "),
				});
			}
		} else {
			box.createEl("div", {
				cls: "nxyz-view-project-empty",
				text: "No project from the active note. Open a card below — or an action will let you pick one.",
			});
		}

		// Actions.
		const actions = root.createDiv({ cls: "nxyz-view-actions" });
		const button = (label: string, action: () => Promise<void>): void => {
			const b = actions.createEl("button", {
				cls: "nxyz-view-btn",
				text: label,
			});
			b.addEventListener("click", () => this.runAndRefresh(action));
		};

		const proj = current ?? undefined;
		button("New project card", () => plugin.createProjectCard());
		button("Build context pack", () => plugin.buildContextPack(proj));
		button("Copy handoff prompt", () => plugin.copyHandoffPrompt(proj));
		button("Append work log", () => plugin.appendWorkLog(proj));
		button("Extract tasks", () => plugin.extractTasks(proj));
		button("Extract decisions", () => plugin.extractDecisions(proj));
		button("New build note", () => plugin.createBuildNote());
		button("Open AI chat", () => plugin.activateChatView());
		button("Compose page with AI", () => plugin.activateComposeView());

		// Project list.
		root.createEl("div", { cls: "nxyz-view-section", text: "Projects" });
		const list = root.createDiv({ cls: "nxyz-view-list" });
		const cards = listProjectCards(this.app, plugin.settings);
		if (cards.length === 0) {
			list.createEl("div", {
				cls: "nxyz-view-empty",
				text: "No project cards yet.",
			});
			return;
		}
		for (const card of cards) {
			const item = list.createEl("div", {
				cls: "nxyz-view-item",
				text: card.basename,
			});
			if (current && current.file.path === card.path) {
				item.addClass("is-active");
			}
			item.addEventListener("click", () => {
				void openFile(this.app, card);
			});
		}
	}
}
