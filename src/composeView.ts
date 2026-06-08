import {
	Component,
	ItemView,
	MarkdownRenderer,
	MarkdownView,
	Notice,
	TFile,
	TFolder,
	WorkspaceLeaf,
	normalizePath,
} from "obsidian";
import type NxyzAgentPlugin from "./main";
import type { ChatMessage } from "./types";
import { resolveProjectNonInteractive } from "./projectRegistry";
import {
	CONTINUE_INSTRUCTION,
	buildComposePrompt,
	extractFirstHeading,
	sanitizeNoteBaseName,
	sanitizeReplyMarkdown,
	truncateForCompose,
	unwrapCodeFence,
} from "./templates";
import {
	activeMarkdownFile,
	copyToClipboard,
	createFileIfMissing,
	errorMessage,
	openFile,
	overwriteFile,
} from "./fileUtils";
import { confirm, confirmReplaceWithDiff, promptForText } from "./modals";
import { lineDiff } from "./diff";
import {
	ProviderOverride,
	effectiveProviderModel,
	providerLabel,
	resolveProvider,
	streamOrComplete,
} from "./providers";

export const NXYZ_COMPOSE_VIEW_TYPE = "nxyz-agent-compose-view";

/** One-click instruction starters for common page types. */
const COMPOSE_PRESETS: ReadonlyArray<{ label: string; instruction: string }> = [
	{
		label: "Meeting notes",
		instruction:
			"Write a complete meeting notes page. Include sections: Date & Attendees, Agenda, Key Discussion Points, Decisions Made, and Action Items (with owners and due dates). Use task-list checkboxes for action items.",
	},
	{
		label: "Design document",
		instruction:
			"Write a technical design document. Include sections: Problem Statement, Goals, Non-Goals, Proposed Solution, Architecture (with a Mermaid diagram if helpful), Trade-offs, Alternatives Considered, Risks, and Implementation Plan.",
	},
	{
		label: "Sprint retrospective",
		instruction:
			"Write a sprint retrospective page. Include sections: What Went Well, What Could Be Improved, Root Causes, Action Items for Next Sprint (checkboxes), and a brief Team Metrics summary.",
	},
	{
		label: "Project brief",
		instruction:
			"Write a project brief. Include sections: Background & Context, Objectives, Scope (In Scope / Out of Scope), Success Metrics, Timeline, Stakeholders, and Open Questions.",
	},
	{
		label: "Blog post",
		instruction:
			"Write a structured blog post. Include a compelling title, an introduction hook, 3–5 main sections with examples or callouts for key points, a conclusion, and a call-to-action.",
	},
	{
		label: "README",
		instruction:
			"Write a README for a software project. Include sections: Project name & one-line description, Features, Prerequisites, Installation (code blocks), Usage with examples, Configuration, Contributing, and License.",
	},
	{
		label: "Daily note",
		instruction:
			"Write a structured daily note template. Include sections: Today's Focus (top 3 priorities as checkboxes), Schedule / Time blocks, Notes & Observations, Wins, Blockers, and Tomorrow's Top Task.",
	},
];

/** Community plugins whose authoring syntax the model may use, if installed. */
const KNOWN_PLUGINS: ReadonlyArray<readonly [string, string]> = [
	["dataview", "Dataview (```dataview DQL / ```dataviewjs)"],
	["obsidian-charts", "Charts (```chart)"],
	["obsidian-excalidraw-plugin", "Excalidraw"],
	["templater-obsidian", "Templater"],
];

/**
 * The Compose surface: describe a page (or rewrite the open one) and the agent
 * authors rich Obsidian Markdown. Editable source on the left, live (sanitized)
 * preview on the right. Writing is always preview-then-confirm: a new note never
 * overwrites; editing the active note requires explicit confirmation.
 */
export class NxyzAgentComposeView extends ItemView {
	private mode: "new" | "edit" = "new";
	private baseFile: TFile | null = null;
	/** The note a generation was authored against (pinned for Apply). */
	private generatedForFile: TFile | null = null;
	private override: ProviderOverride = {};
	private projectContext = "";
	private generating = false;
	private closed = false;
	private truncated = false;
	private composeBase: ChatMessage[] = [];
	private abortController?: AbortController;
	private renderChild?: Component;
	private previewTimer = 0;

	private instructionEl!: HTMLTextAreaElement;
	private modeEl!: HTMLSelectElement;
	private presetEl!: HTMLSelectElement;
	private genBtn!: HTMLButtonElement;
	private loadNoteBtn!: HTMLButtonElement;
	private sourceEl!: HTMLTextAreaElement;
	private previewEl!: HTMLElement;
	private applyBtn!: HTMLButtonElement;
	private copyBtn!: HTMLButtonElement;
	private clearBtn!: HTMLButtonElement;
	private continueBtn!: HTMLButtonElement;
	private charCountEl!: HTMLElement;
	private metaEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: NxyzAgentPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return NXYZ_COMPOSE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "nxyz agent compose";
	}

	getIcon(): string {
		return "wand-2";
	}

	async onOpen(): Promise<void> {
		// Default to editing whatever note is open, else authoring a new one.
		this.mode = activeMarkdownFile(this.app) ? "edit" : "new";
		this.renderShell();
		// Keep the edit target + label tracking the open note.
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				if (!this.generating) this.refreshContext();
			})
		);
		this.refreshContext();
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.abortController?.abort();
		window.clearTimeout(this.previewTimer);
	}

	private pluginHint(): string {
		const enabled = (
			this.app as unknown as { plugins?: { enabledPlugins?: Set<string> } }
		).plugins?.enabledPlugins;
		if (!enabled) return "";
		return KNOWN_PLUGINS.filter(([id]) => enabled.has(id))
			.map(([, label]) => label)
			.join(", ");
	}

	/** Update the override + edit target + label from the current context. */
	private refreshContext(): void {
		const project = resolveProjectNonInteractive(
			this.app,
			this.plugin.settings
		);
		this.override = project
			? { provider: project.meta.ai_provider, model: project.meta.ai_model }
			: {};
		if (this.mode === "edit") this.baseFile = activeMarkdownFile(this.app);
		this.updateMeta();
	}

	/** Read the project card content for grounding (fresh, at generate time). */
	private async loadProjectContext(): Promise<void> {
		const project = resolveProjectNonInteractive(
			this.app,
			this.plugin.settings
		);
		if (!project) {
			this.projectContext = "";
			return;
		}
		try {
			this.projectContext = truncateForCompose(
				await this.app.vault.cachedRead(project.file),
				4000
			);
		} catch {
			this.projectContext = "";
		}
	}

	private renderShell(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("nxyz-compose");

		const bar = root.createDiv({ cls: "nxyz-compose-bar" });
		const row = bar.createDiv({ cls: "nxyz-compose-row" });
		this.modeEl = row.createEl("select", { cls: "nxyz-compose-mode dropdown" });
		this.modeEl.createEl("option", { value: "new", text: "New note" });
		this.modeEl.createEl("option", {
			value: "edit",
			text: "Edit active note",
		});
		this.modeEl.value = this.mode;
		this.modeEl.addEventListener("change", () => {
			this.mode = this.modeEl.value === "edit" ? "edit" : "new";
			this.refreshContext();
		});
		this.metaEl = row.createDiv({ cls: "nxyz-compose-meta" });

		this.instructionEl = bar.createEl("textarea", {
			cls: "nxyz-compose-instruction",
		});
		this.instructionEl.placeholder =
			"Describe the page to create, or how to rewrite the open note…  (Ctrl+Enter to generate)";
		this.instructionEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				void this.generate();
			}
		});

		// Preset selector — fills the instruction textarea with a starter prompt.
		const presetRow = bar.createDiv({ cls: "nxyz-compose-preset-row" });
		this.presetEl = presetRow.createEl("select", {
			cls: "nxyz-compose-preset dropdown",
		});
		this.presetEl.createEl("option", { value: "", text: "— Presets —" });
		for (const p of COMPOSE_PRESETS) {
			this.presetEl.createEl("option", { value: p.instruction, text: p.label });
		}
		this.presetEl.addEventListener("change", () => {
			const val = this.presetEl.value;
			if (val) {
				this.instructionEl.value = val;
				this.instructionEl.focus();
				this.presetEl.value = ""; // reset so it can be reselected
			}
		});

		const actions = bar.createDiv({ cls: "nxyz-compose-actions" });
		this.genBtn = actions.createEl("button", {
			cls: "nxyz-compose-gen mod-cta",
			text: "Generate",
		});
		this.genBtn.addEventListener("click", () => void this.generate());
		this.loadNoteBtn = actions.createEl("button", {
			cls: "nxyz-compose-load-note",
			text: "Load active note",
		});
		this.loadNoteBtn.title =
			"Paste the active note's content into the source pane for manual editing or to include in your instruction.";
		this.loadNoteBtn.addEventListener("click", () => void this.loadActiveNote());

		const body = root.createDiv({ cls: "nxyz-compose-body" });
		const left = body.createDiv({ cls: "nxyz-compose-pane" });
		left.createDiv({ cls: "nxyz-compose-pane-title", text: "Source" });
		this.sourceEl = left.createEl("textarea", { cls: "nxyz-compose-source" });
		this.sourceEl.placeholder = "Generated Markdown appears here — editable.";
		this.sourceEl.addEventListener("input", () => {
			this.schedulePreview();
			this.updateCharCount();
		});

		const right = body.createDiv({ cls: "nxyz-compose-pane" });
		right.createDiv({ cls: "nxyz-compose-pane-title", text: "Preview" });
		this.previewEl = right.createDiv({ cls: "nxyz-compose-preview" });

		const footer = root.createDiv({ cls: "nxyz-compose-footer" });
		this.applyBtn = footer.createEl("button", {
			cls: "nxyz-compose-apply mod-cta",
			text: "Apply",
		});
		this.applyBtn.addEventListener("click", () => void this.apply());
		this.copyBtn = footer.createEl("button", { text: "Copy" });
		this.copyBtn.addEventListener("click", async () => {
			const ok = await copyToClipboard(this.sourceEl.value);
			new Notice(ok ? "Copied." : "Clipboard unavailable.");
		});
		this.clearBtn = footer.createEl("button", { text: "Clear" });
		this.clearBtn.addEventListener("click", () => {
			this.sourceEl.value = "";
			this.generatedForFile = null;
			this.truncated = false;
			this.updateCharCount();
			this.updateContinueVisibility();
			this.renderPreview();
		});
		this.charCountEl = footer.createSpan({ cls: "nxyz-compose-charcount" });
		this.continueBtn = footer.createEl("button", {
			cls: "nxyz-compose-continue",
			text: "Continue",
		});
		this.continueBtn.addEventListener("click", () => void this.continue());
		this.continueBtn.hide();

		this.updateCharCount();
		this.renderPreview();
	}

	private updateCharCount(): void {
		if (!this.charCountEl) return;
		const text = this.sourceEl.value;
		if (text.length === 0) {
			this.charCountEl.setText("");
			return;
		}
		const chars = text.length.toLocaleString();
		const words = text.trim().split(/\s+/).filter(Boolean).length.toLocaleString();
		this.charCountEl.setText(`${chars} chars · ${words} words`);
	}

	/** Load the active note content into the source pane for manual editing. */
	private async loadActiveNote(): Promise<void> {
		const file = activeMarkdownFile(this.app);
		if (!file) {
			new Notice("No active note to load.");
			return;
		}
		try {
			// Prefer the live (unsaved) editor content when the note is open.
			const liveView = this.app.workspace.getActiveViewOfType(MarkdownView);
			const content =
				liveView?.file?.path === file.path
					? liveView.editor.getValue()
					: await this.app.vault.cachedRead(file);
			this.sourceEl.value = content;
			this.updateCharCount();
			this.schedulePreview();
			new Notice(`Loaded "${file.basename}" into source.`);
		} catch (e) {
			new Notice(`Could not load note: ${errorMessage(e)}`);
		}
	}

	private updateMeta(): void {
		if (!this.metaEl) return;
		const { provider, model } = effectiveProviderModel(
			this.plugin.settings,
			this.override
		);
		const editTarget = this.generatedForFile ?? this.baseFile;
		const target =
			this.mode === "edit"
				? editTarget
					? `→ ${editTarget.basename}`
					: "→ (no active note)"
				: "→ new note";
		this.metaEl.setText(`${target} · ${providerLabel(provider)} · ${model}`);
	}

	private schedulePreview(): void {
		window.clearTimeout(this.previewTimer);
		this.previewTimer = window.setTimeout(() => this.renderPreview(), 300);
	}

	private resetRenderChild(): void {
		if (this.renderChild) this.removeChild(this.renderChild);
		this.renderChild = new Component();
		this.addChild(this.renderChild);
	}

	private renderPreview(): void {
		this.resetRenderChild();
		this.previewEl.empty();
		const md = this.sourceEl.value;
		if (md.trim() === "") {
			this.previewEl.createDiv({
				cls: "nxyz-compose-empty",
				text: "Preview will appear here. Plugin code (e.g. dataviewjs) is shown inert until you save and open the note.",
			});
			return;
		}
		void MarkdownRenderer.render(
			this.app,
			sanitizeReplyMarkdown(md),
			this.previewEl,
			this.baseFile?.path ?? "",
			this.renderChild ?? this
		);
	}

	private setGenerating(generating: boolean): void {
		this.generating = generating;
		// Only the streaming path is cancellable (requestUrl can't abort).
		const cancellable = this.plugin.settings.aiStream;
		this.genBtn.setText(
			generating ? (cancellable ? "Stop" : "Generating…") : "Generate"
		);
		this.genBtn.toggleClass("mod-warning", generating && cancellable);
		this.genBtn.disabled = generating && !cancellable;
		this.modeEl.disabled = generating;
		this.presetEl.disabled = generating;
		this.loadNoteBtn.disabled = generating;
		this.applyBtn.disabled = generating;
		this.copyBtn.disabled = generating;
		this.clearBtn.disabled = generating;
		this.continueBtn.disabled = generating;
	}

	/** Show the Continue button only when the last generation was truncated. */
	private updateContinueVisibility(): void {
		if (this.truncated && this.sourceEl.value.trim() !== "") {
			this.continueBtn.show();
		} else {
			this.continueBtn.hide();
		}
	}

	private async generate(): Promise<void> {
		if (this.generating) {
			this.abortController?.abort();
			return;
		}
		const instruction = this.instructionEl.value.trim();
		if (instruction === "") {
			new Notice("Describe the page first.");
			return;
		}
		this.refreshContext();
		await this.loadProjectContext();

		let baseContent = "";
		if (this.mode === "edit") {
			if (!this.baseFile) {
				new Notice("Open a note to edit, or switch to New note.");
				return;
			}
			try {
				baseContent = await this.app.vault.read(this.baseFile);
			} catch {
				baseContent = "";
			}
		}
		// Pin the target so Apply writes to the note this was authored against,
		// even if the user navigates away afterwards.
		this.generatedForFile = this.mode === "edit" ? this.baseFile : null;

		const { system, user } = buildComposePrompt({
			instruction,
			mode: this.mode,
			baseContent,
			projectContext: this.projectContext,
			pluginHint: this.pluginHint(),
		});
		// Remember the base turns so Continue can extend from them.
		this.composeBase = [
			{ role: "system", content: system },
			{ role: "user", content: user },
		];
		await this.runGeneration(this.composeBase, false);
	}

	/** Extend a truncated page from where it left off. */
	private async continue(): Promise<void> {
		if (this.generating) return;
		if (!this.truncated || this.composeBase.length === 0) return;
		const payload: ChatMessage[] = [
			...this.composeBase,
			{ role: "assistant", content: this.sourceEl.value },
			{ role: "user", content: CONTINUE_INSTRUCTION },
		];
		await this.runGeneration(payload, true);
	}

	/** Run a generation, appending or replacing the source; tracks truncation. */
	private async runGeneration(
		payload: ChatMessage[],
		append: boolean
	): Promise<void> {
		const resolved = resolveProvider(this.plugin.settings, this.override);
		if (!resolved.ok) {
			new Notice(resolved.error);
			return;
		}
		window.clearTimeout(this.previewTimer); // don't let a pending render race
		if (!append) this.sourceEl.value = "";
		// Baseline = everything before this run (empty for a fresh generation, the
		// existing source for a continue). The final source is set from the
		// authoritative reply so a stream→complete fallback can't duplicate text.
		const baseline = this.sourceEl.value;
		this.setGenerating(true);
		this.abortController = new AbortController();
		let truncated = false;
		try {
			const result = await streamOrComplete(resolved.config, payload, {
				stream: this.plugin.settings.aiStream,
				temperature: this.plugin.settings.aiTemperature,
				onDelta: (delta) => {
					this.sourceEl.value += delta;
					this.sourceEl.scrollTop = this.sourceEl.scrollHeight;
				},
				signal: this.abortController.signal,
			});
			this.sourceEl.value = baseline + result.text;
			truncated = result.truncated;
		} catch (e) {
			if (!this.abortController.signal.aborted) {
				new Notice(errorMessage(e));
			}
		} finally {
			this.abortController = undefined;
			if (!this.closed) {
				// Only unwrap an enclosing fence on a fresh generation.
				if (!append) {
					this.sourceEl.value = unwrapCodeFence(this.sourceEl.value);
				}
				this.truncated = truncated;
				this.updateCharCount();
				this.setGenerating(false);
				this.updateContinueVisibility();
				this.renderPreview();
			}
		}
	}

	private async apply(): Promise<void> {
		const content = this.sourceEl.value;
		if (content.trim() === "") {
			new Notice("Nothing to apply — generate a page first.");
			return;
		}

		if (this.mode === "edit") {
			// Prefer the pinned generation target; fall back to the active note
			// for hand-typed source. Re-validate it still exists.
			const target = this.generatedForFile ?? this.baseFile;
			const file =
				target &&
				this.app.vault.getAbstractFileByPath(target.path) instanceof TFile
					? target
					: null;
			if (!file) {
				new Notice("The note this was written for is no longer available.");
				return;
			}
			let current = "";
			try {
				// Use live (unsaved) editor content so the diff reflects any edits the
				// user made in the editor after the last save — not the stale disk copy.
				const liveView = this.app.workspace.getActiveViewOfType(MarkdownView);
				current =
					liveView?.file?.path === file.path
						? liveView.editor.getValue()
						: await this.app.vault.read(file);
			} catch {
				current = "";
			}
			if (current === content) {
				new Notice("No changes to apply.");
				return;
			}
			// Show a line diff before the destructive overwrite (fall back to a
			// plain confirm if the file is too large to diff cheaply).
			const diff = lineDiff(current, content);
			const ok = diff
				? await confirmReplaceWithDiff(this.app, file.basename, diff)
				: await confirm(this.app, {
						title: "Replace note contents?",
						message: `This replaces the entire contents of "${file.basename}". If Obsidian's File Recovery core plugin is enabled you may be able to restore the previous version.`,
						cta: "Replace",
						danger: true,
					});
			if (!ok) return;
			try {
				await overwriteFile(this.app, file, content);
				await openFile(this.app, file);
				new Notice(`Updated ${file.path}`);
			} catch (e) {
				new Notice(`Could not update: ${errorMessage(e)}`);
			}
			return;
		}

		// New note — pre-fill the dialog with the first heading from the generated content.
		const suggested = sanitizeNoteBaseName(
			extractFirstHeading(content) ?? ""
		);
		const name = await promptForText(this.app, {
			title: "Save page as",
			placeholder: "Note name",
			cta: "Save",
			initialValue: suggested,
		});
		if (!name || name.trim() === "") return;
		const base = sanitizeNoteBaseName(name);
		if (base === "") {
			new Notice("That name has no usable characters — try another.");
			return;
		}
		const folder = this.activeFolderPath();
		const path = normalizePath(folder ? `${folder}/${base}.md` : `${base}.md`);
		try {
			const { file, created } = await createFileIfMissing(
				this.app,
				path,
				content
			);
			if (!created) {
				new Notice(`"${file.basename}" already exists — choose another name.`);
				return;
			}
			await openFile(this.app, file);
			new Notice(`Created ${file.path}`);
		} catch (e) {
			new Notice(`Could not save: ${errorMessage(e)}`);
		}
	}

	/** Folder of the active note (so new pages land near their context). */
	private activeFolderPath(): string {
		const parent = this.app.workspace.getActiveFile()?.parent;
		return parent instanceof TFolder ? parent.path : "";
	}
}
