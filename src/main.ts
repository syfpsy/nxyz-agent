import { Notice, Plugin, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import {
	ChatMessage,
	DEFAULT_SETTINGS,
	NxyzAgentSettings,
	ResolvedProject,
} from "./types";
import { NxyzAgentSettingTab } from "./settings";
import { NXYZ_VIEW_TYPE, NxyzAgentView } from "./view";
import { NXYZ_CHAT_VIEW_TYPE, NxyzAgentChatView } from "./chatView";
import {
	createFileIfMissing,
	getCurrentDateTimeString,
	getFrontmatter,
	openFile,
	slugifyProjectName,
} from "./fileUtils";
import {
	appendDecisions,
	appendTasks,
	appendWorkLog,
	createBuildNote,
	createProjectCard,
	extractDecisionsFromContent,
	extractTasksFromContent,
	resolveCurrentProject,
} from "./projectRegistry";
import {
	assembleContext,
	buildContextPack,
	buildHandoffPrompt,
	saveContextPack,
} from "./contextPack";
import { promptForText } from "./modals";

/** Copy text to the clipboard, falling back to Electron on desktop. */
async function copyToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const electron = (window as unknown as {
				require?: (m: string) => { clipboard?: { writeText(t: string): void } };
			}).require?.("electron");
			if (electron?.clipboard?.writeText) {
				electron.clipboard.writeText(text);
				return true;
			}
		} catch {
			// fall through
		}
		return false;
	}
}

export default class NxyzAgentPlugin extends Plugin {
	settings!: NxyzAgentSettings;
	private chats: Record<string, ChatMessage[]> = {};

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new NxyzAgentSettingTab(this.app, this));

		this.registerView(
			NXYZ_VIEW_TYPE,
			(leaf) => new NxyzAgentView(leaf, this)
		);
		this.registerView(
			NXYZ_CHAT_VIEW_TYPE,
			(leaf) => new NxyzAgentChatView(leaf, this)
		);

		// The ribbon opens the control panel, which hosts every action.
		this.addRibbonIcon("bot", "nxyz agent: open panel", () =>
			this.activateView()
		);
		this.addRibbonIcon("message-circle", "nxyz agent: open AI chat", () =>
			this.activateChatView()
		);

		this.addCommand({
			id: "open-panel",
			name: "Open panel",
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: "open-chat",
			name: "Open AI chat",
			callback: () => this.activateChatView(),
		});

		this.addCommand({
			id: "create-project-card",
			name: "Create project card",
			callback: () => this.createProjectCard(),
		});

		this.addCommand({
			id: "build-context-pack",
			name: "Build context pack for current project",
			callback: () => this.buildContextPack(),
		});

		this.addCommand({
			id: "copy-agent-handoff-prompt",
			name: "Copy agent handoff prompt",
			callback: () => this.copyHandoffPrompt(),
		});

		this.addCommand({
			id: "append-work-log",
			name: "Append work log",
			callback: () => this.appendWorkLog(),
		});

		this.addCommand({
			id: "create-build-note",
			name: "Create build note from current note",
			callback: () => this.createBuildNote(),
		});

		this.addCommand({
			id: "extract-tasks",
			name: "Extract tasks from current note",
			callback: () => this.extractTasks(),
		});

		this.addCommand({
			id: "extract-decisions",
			name: "Extract decisions from current note",
			callback: () => this.extractDecisions(),
		});
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as unknown;
		if (data && typeof data === "object" && "settings" in data) {
			const d = data as {
				settings?: Partial<NxyzAgentSettings>;
				chats?: Record<string, ChatMessage[]>;
			};
			this.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings);
			this.chats = d.chats ?? {};
		} else {
			// Legacy flat format (settings stored at top level) or first run.
			this.settings = Object.assign(
				{},
				DEFAULT_SETTINGS,
				(data as Partial<NxyzAgentSettings>) ?? {}
			);
			this.chats = {};
		}
	}

	async saveSettings(): Promise<void> {
		await this.persist();
	}

	private async persist(): Promise<void> {
		await this.saveData({ settings: this.settings, chats: this.chats });
	}

	/** Per-project chat history (keyed by project slug, or "_general"). */
	getChat(key: string): ChatMessage[] {
		return this.chats[key] ?? [];
	}

	async setChat(key: string, messages: ChatMessage[]): Promise<void> {
		// Cap stored history so data.json stays small.
		this.chats[key] = messages.slice(-100);
		await this.persist();
	}

	/** Open (or reveal) a sidebar view of the given type. */
	private async revealView(type: string): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null =
			workspace.getLeavesOfType(type)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type, active: true });
			}
		}
		if (leaf) workspace.revealLeaf(leaf);
	}

	/** Open (or reveal) the control panel in the right sidebar. */
	async activateView(): Promise<void> {
		await this.revealView(NXYZ_VIEW_TYPE);
	}

	/** Open (or reveal) the AI chat panel in the right sidebar. */
	async activateChatView(): Promise<void> {
		await this.revealView(NXYZ_CHAT_VIEW_TYPE);
	}

	/** The active file if it is a Markdown note, else null. */
	private activeMarkdownFile(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		return file && file.extension === "md" ? file : null;
	}

	// --- Command 1 ---------------------------------------------------------
	async createProjectCard(): Promise<void> {
		const name = await promptForText(this.app, {
			title: "Create project card",
			placeholder: "Project name",
			cta: "Create",
		});
		if (!name || name.trim() === "") return;

		try {
			const { file, created } = await createProjectCard(
				this.app,
				this.settings,
				name.trim()
			);
			await openFile(this.app, file);
			new Notice(
				created
					? `Created project card: ${file.basename}`
					: `Project already exists — opened: ${file.basename}`
			);
		} catch (e) {
			new Notice(`Could not create project card: ${errorMessage(e)}`);
		}
	}

	// --- Command 2 ---------------------------------------------------------
	async buildContextPack(preselected?: ResolvedProject): Promise<void> {
		const project =
			preselected ?? (await resolveCurrentProject(this.app, this.settings));
		if (!project) {
			new Notice("No project found — create a project card first.");
			return;
		}
		try {
			const assembly = await assembleContext(this.app, this.settings, project);
			const { doc, prompt, truncated } = buildContextPack(
				assembly,
				this.settings.maxContextChars
			);
			const file = await saveContextPack(
				this.app,
				this.settings,
				project,
				doc
			);
			const copied = await copyToClipboard(prompt);
			await openFile(this.app, file);
			new Notice(
				`Context pack built${truncated ? " (truncated to fit limit)" : ""}.` +
					(copied ? " Prompt copied to clipboard." : " Clipboard unavailable.")
			);
		} catch (e) {
			new Notice(`Could not build context pack: ${errorMessage(e)}`);
		}
	}

	// --- Command 3 ---------------------------------------------------------
	async copyHandoffPrompt(preselected?: ResolvedProject): Promise<void> {
		const project =
			preselected ?? (await resolveCurrentProject(this.app, this.settings));
		if (!project) {
			new Notice("No project found — create a project card first.");
			return;
		}
		try {
			const assembly = await assembleContext(this.app, this.settings, project);
			const { prompt } = buildHandoffPrompt(
				assembly,
				this.settings.maxContextChars
			);
			const copied = await copyToClipboard(prompt);
			if (copied) {
				new Notice("Agent handoff prompt copied.");
				return;
			}
			// Fallback: persist the prompt so it is never lost.
			const stamp = getCurrentDateTimeString().replace(/:/g, "-");
			const path = normalizePath(
				`${this.settings.contextPackFolder}/_handoff-${project.slug}-${stamp}.md`
			);
			const { file } = await createFileIfMissing(this.app, path, prompt);
			await openFile(this.app, file);
			new Notice(`Clipboard unavailable — prompt saved to ${file.path}.`);
		} catch (e) {
			new Notice(`Could not build handoff prompt: ${errorMessage(e)}`);
		}
	}

	// --- Command 4 ---------------------------------------------------------
	async appendWorkLog(preselected?: ResolvedProject): Promise<void> {
		const project =
			preselected ?? (await resolveCurrentProject(this.app, this.settings));
		if (!project) {
			new Notice("No project found — create a project card first.");
			return;
		}
		const entry = await promptForText(this.app, {
			title: `Work log — ${project.name}`,
			placeholder: "What did you do?",
			cta: "Append",
			multiline: true,
		});
		if (!entry || entry.trim() === "") return;

		try {
			const file = await appendWorkLog(
				this.app,
				this.settings,
				project,
				entry
			);
			new Notice(`Work log updated: ${file.path}`);
		} catch (e) {
			new Notice(`Could not append work log: ${errorMessage(e)}`);
		}
	}

	// --- Command 5 ---------------------------------------------------------
	async createBuildNote(): Promise<void> {
		const active = this.activeMarkdownFile();
		if (!active) {
			new Notice("Open a note first to create a build note.");
			return;
		}
		try {
			const content = await this.app.vault.read(active);
			const meta = getFrontmatter(this.app, active);
			const projectSlug =
				meta?.type === "project"
					? active.basename
					: slugifyProjectName(active.basename);
			const { file, created } = await createBuildNote(
				this.app,
				this.settings,
				active,
				content,
				projectSlug
			);
			await openFile(this.app, file);
			new Notice(
				created
					? `Build note created: ${file.basename}`
					: `Build note already exists — opened: ${file.basename}`
			);
		} catch (e) {
			new Notice(`Could not create build note: ${errorMessage(e)}`);
		}
	}

	// --- Command 6 ---------------------------------------------------------
	async extractTasks(preselected?: ResolvedProject): Promise<void> {
		const active = this.activeMarkdownFile();
		if (!active) {
			new Notice("Open a note first to extract tasks.");
			return;
		}
		const project =
			preselected ?? (await resolveCurrentProject(this.app, this.settings));
		if (!project) {
			new Notice("No project found to file tasks into.");
			return;
		}
		try {
			const content = await this.app.vault.read(active);
			const tasks = extractTasksFromContent(content);
			if (tasks.length === 0) {
				new Notice("No tasks found in this note.");
				return;
			}
			const sourceLink = `[[${active.basename}]]`;
			const count = await appendTasks(
				this.app,
				this.settings,
				project,
				tasks,
				sourceLink
			);
			new Notice(`Appended ${count} task${count === 1 ? "" : "s"}.`);
		} catch (e) {
			new Notice(`Could not extract tasks: ${errorMessage(e)}`);
		}
	}

	// --- Command 7 ---------------------------------------------------------
	async extractDecisions(preselected?: ResolvedProject): Promise<void> {
		const active = this.activeMarkdownFile();
		if (!active) {
			new Notice("Open a note first to extract decisions.");
			return;
		}
		const project =
			preselected ?? (await resolveCurrentProject(this.app, this.settings));
		if (!project) {
			new Notice("No project found to file decisions into.");
			return;
		}
		try {
			const content = await this.app.vault.read(active);
			const decisions = extractDecisionsFromContent(content);
			if (decisions.length === 0) {
				new Notice("No decisions found in this note.");
				return;
			}
			const sourceLink = `[[${active.basename}]]`;
			const count = await appendDecisions(
				this.app,
				this.settings,
				project,
				decisions,
				sourceLink
			);
			new Notice(`Appended ${count} decision${count === 1 ? "" : "s"}.`);
		} catch (e) {
			new Notice(`Could not extract decisions: ${errorMessage(e)}`);
		}
	}
}

/** Safe error-to-string for Notice messages. */
function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
