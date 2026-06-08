import {
	Component,
	ItemView,
	MarkdownRenderer,
	Notice,
	WorkspaceLeaf,
} from "obsidian";
import type NxyzAgentPlugin from "./main";
import type { ChatMessage, ResolvedProject } from "./types";
import {
	appendWorkLogEntry,
	resolveProjectNonInteractive,
} from "./projectRegistry";
import {
	assembleContext,
	buildActiveNotePrompt,
	buildHandoffPrompt,
} from "./contextPack";
import {
	activeMarkdownFile,
	copyToClipboard,
	errorMessage,
} from "./fileUtils";
import {
	CONTINUE_INSTRUCTION,
	demoteMarkdownHeadings,
	sanitizeReplyMarkdown,
} from "./templates";
import {
	ProviderOverride,
	effectiveProviderModel,
	providerLabel,
	resolveProvider,
	streamOrComplete,
} from "./providers";

export const NXYZ_CHAT_VIEW_TYPE = "nxyz-agent-chat-view";

const GENERAL_KEY = "_general";

/** One-click prompts grounded in the current note/project context. */
const QUICK_PROMPTS: ReadonlyArray<readonly [string, string]> = [
	["Summarize", "Summarize the current context (note/project) in 5 concise bullet points."],
	[
		"Next step",
		"What is the single smallest useful next step here? Be specific and concrete.",
	],
	[
		"Tasks",
		"List the concrete open tasks or TODOs implied by this context as a Markdown checklist.",
	],
	["Risks", "What are the main risks, gaps, or unknowns in the current context?"],
];

/**
 * AI chat panel. The current project's handoff prompt (constraints + condensed
 * context) is sent as the system message, so the model answers grounded in the
 * project. Bring-your-own-key; streaming via `fetch`/SSE with a non-streaming
 * fallback. Assistant replies render as (sanitized) Markdown; each message can
 * be copied or saved to the project work log. History persists per project.
 */
export class NxyzAgentChatView extends ItemView {
	private messages: ChatMessage[] = [];
	private systemContext = "";
	private boundProject: ResolvedProject | null = null;
	private projectName: string | null = null;
	private activeNoteName: string | null = null;
	private currentKey = GENERAL_KEY;
	private sourcePath = "";
	private override: ProviderOverride = {};
	private sending = false;
	private closed = false;
	private lastTruncated = false;
	private abortController?: AbortController;

	/** Child component that owns the Markdown renders (unloaded on re-render). */
	private renderChild?: Component;

	private logEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private contextEl!: HTMLElement;
	private sendBtn!: HTMLButtonElement;
	private reloadBtn!: HTMLButtonElement;
	private clearBtn!: HTMLButtonElement;
	private continueBtn!: HTMLButtonElement;
	private quickBtns: HTMLButtonElement[] = [];

	constructor(leaf: WorkspaceLeaf, private readonly plugin: NxyzAgentPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return NXYZ_CHAT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "nxyz agent chat";
	}

	getIcon(): string {
		return "message-circle";
	}

	async onOpen(): Promise<void> {
		this.renderShell();
		// Keep context in sync with whatever note the user opens.
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				if (!this.sending) void this.refreshContext();
			})
		);
		await this.loadContext();
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.abortController?.abort();
	}

	/** Bind the project + load its history, then build the live context. */
	private async loadContext(): Promise<void> {
		if (this.sending) {
			new Notice("Stop or finish the current reply first.");
			return;
		}
		this.boundProject = resolveProjectNonInteractive(
			this.app,
			this.plugin.settings
		);
		this.currentKey = this.boundProject?.slug ?? GENERAL_KEY;
		this.messages = this.plugin.getChat(this.currentKey).slice();
		await this.refreshContext();
		this.renderMessages();
	}

	/**
	 * Rebuild the system context from the bound project plus the LIVE active
	 * note, so the chat always reflects the note the user currently has open
	 * (even when there is no project). Does not touch history.
	 */
	private async refreshContext(): Promise<void> {
		const project = this.boundProject;
		const active = activeMarkdownFile(this.app);
		const maxChars = this.plugin.settings.maxContextChars;

		if (project) {
			this.projectName = project.name;
			this.sourcePath = project.file.path;
			this.override = {
				provider: project.meta.ai_provider,
				model: project.meta.ai_model,
			};
			this.activeNoteName =
				active && active.path !== project.file.path ? active.basename : null;
			try {
				// Force-include the active note so the chat always sees the open doc.
				const assembly = await assembleContext(
					this.app,
					{ ...this.plugin.settings, includeActiveNote: true },
					project
				);
				this.systemContext = buildHandoffPrompt(assembly, maxChars).prompt;
			} catch {
				this.systemContext = "";
			}
		} else if (active) {
			this.projectName = null;
			this.sourcePath = active.path;
			this.override = {};
			this.activeNoteName = active.basename;
			try {
				const content = await this.app.vault.cachedRead(active);
				this.systemContext = buildActiveNotePrompt(
					active.basename,
					content,
					maxChars
				);
			} catch {
				this.systemContext = "";
			}
		} else {
			this.projectName = null;
			this.sourcePath = "";
			this.override = {};
			this.activeNoteName = null;
			this.systemContext = "";
		}
		this.updateContextLabel();
	}

	private renderShell(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("nxyz-chat");

		const header = root.createDiv({ cls: "nxyz-chat-header" });
		this.contextEl = header.createDiv({ cls: "nxyz-chat-context" });
		this.reloadBtn = header.createEl("button", {
			cls: "nxyz-chat-btn",
			text: "Reload context",
		});
		this.reloadBtn.addEventListener("click", () => void this.loadContext());
		this.clearBtn = header.createEl("button", {
			cls: "nxyz-chat-btn",
			text: "Clear",
		});
		this.clearBtn.addEventListener("click", () => void this.clear());
		this.continueBtn = header.createEl("button", {
			cls: "nxyz-chat-btn nxyz-chat-continue",
			text: "Continue",
		});
		this.continueBtn.addEventListener(
			"click",
			() => void this.send(CONTINUE_INSTRUCTION)
		);
		this.continueBtn.hide();

		this.logEl = root.createDiv({ cls: "nxyz-chat-log" });

		const quick = root.createDiv({ cls: "nxyz-chat-quick" });
		this.quickBtns = QUICK_PROMPTS.map(([label, prompt]) => {
			const b = quick.createEl("button", {
				cls: "nxyz-chat-quick-btn",
				text: label,
			});
			b.addEventListener("click", () => void this.send(prompt));
			return b;
		});

		const inputRow = root.createDiv({ cls: "nxyz-chat-input-row" });
		this.inputEl = inputRow.createEl("textarea", { cls: "nxyz-chat-input" });
		this.inputEl.placeholder =
			"Ask about this project…  (Enter to send, Shift+Enter for newline)";
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				void this.send();
			}
		});
		this.sendBtn = inputRow.createEl("button", {
			cls: "nxyz-chat-send mod-cta",
			text: "Send",
		});
		this.sendBtn.addEventListener("click", () => void this.send());

		this.renderMessages();
	}

	private updateContextLabel(): void {
		if (!this.contextEl) return;
		const { provider, model } = effectiveProviderModel(
			this.plugin.settings,
			this.override
		);
		const pm = `${providerLabel(provider)} · ${model}`;
		let ctx: string;
		if (this.projectName && this.activeNoteName) {
			ctx = `${this.projectName} + ${this.activeNoteName}`;
		} else if (this.projectName) {
			ctx = this.projectName;
		} else if (this.activeNoteName) {
			ctx = `note: ${this.activeNoteName}`;
		} else {
			ctx = "no note/project open";
		}
		this.contextEl.setText(`Context: ${ctx} · ${pm}`);
	}

	/** Fresh child component so previous Markdown renders are unloaded. */
	private resetRenderChild(): void {
		if (this.renderChild) this.removeChild(this.renderChild);
		this.renderChild = new Component();
		this.addChild(this.renderChild);
	}

	/** Append one message bubble; returns its content element. */
	private addMessageEl(m: ChatMessage, plain = false): HTMLElement {
		const bubble = this.logEl.createDiv({
			cls: `nxyz-chat-msg nxyz-chat-${m.role}`,
		});
		bubble.createDiv({
			cls: "nxyz-chat-role",
			text: m.role === "user" ? "You" : "Agent",
		});
		const content = bubble.createDiv({ cls: "nxyz-chat-content" });
		if (m.role === "assistant" && !plain && m.content !== "") {
			void MarkdownRenderer.render(
				this.app,
				sanitizeReplyMarkdown(m.content),
				content,
				this.sourcePath,
				this.renderChild ?? this
			);
		} else {
			content.setText(m.content);
		}
		// No actions on the still-streaming placeholder (plain); they appear when
		// the final reply is re-rendered.
		if (!plain) this.addMessageActions(bubble, m);
		return content;
	}

	private addMessageActions(bubble: HTMLElement, m: ChatMessage): void {
		const actions = bubble.createDiv({ cls: "nxyz-chat-actions" });
		const copy = actions.createEl("button", {
			cls: "nxyz-chat-action",
			text: "Copy",
		});
		copy.addEventListener("click", async () => {
			const ok = await copyToClipboard(m.content);
			new Notice(ok ? "Copied." : "Clipboard unavailable.");
		});
		// Saving to the work log only makes sense with a real project.
		if (m.role === "assistant" && this.projectName) {
			const save = actions.createEl("button", {
				cls: "nxyz-chat-action",
				text: "Save to log",
			});
			save.addEventListener("click", () => void this.saveToLog(m));
		}
	}

	private async saveToLog(m: ChatMessage): Promise<void> {
		if (m.content.trim() === "") return;
		try {
			const file = await appendWorkLogEntry(
				this.app,
				this.plugin.settings,
				this.currentKey,
				demoteMarkdownHeadings(m.content)
			);
			new Notice(`Saved to ${file.path}`);
		} catch (e) {
			new Notice(
				`Could not save: ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}

	private renderMessages(): void {
		this.resetRenderChild();
		this.logEl.empty();
		if (this.messages.length === 0) {
			this.logEl.createDiv({
				cls: "nxyz-chat-empty",
				text: "Start a conversation. The current project's context is sent as background.",
			});
			return;
		}
		for (const m of this.messages) this.addMessageEl(m);
		this.logEl.scrollTop = this.logEl.scrollHeight;
	}

	private setSending(sending: boolean): void {
		this.sending = sending;
		// Only the streaming path is cancellable (requestUrl can't abort).
		const cancellable = this.plugin.settings.aiStream;
		this.sendBtn.setText(
			sending ? (cancellable ? "Stop" : "Working…") : "Send"
		);
		this.sendBtn.toggleClass("mod-warning", sending && cancellable);
		this.sendBtn.disabled = sending && !cancellable;
		// Prevent swapping the conversation out from under an in-flight request.
		this.reloadBtn.disabled = sending;
		this.clearBtn.disabled = sending;
		this.continueBtn.disabled = sending;
		this.quickBtns.forEach((b) => (b.disabled = sending));
	}

	/** Show the Continue button only when the last reply was length-truncated. */
	private updateContinueVisibility(): void {
		if (this.lastTruncated) this.continueBtn.show();
		else this.continueBtn.hide();
	}

	private async clear(): Promise<void> {
		if (this.sending) return;
		this.messages = [];
		this.lastTruncated = false;
		this.updateContinueVisibility();
		await this.plugin.setChat(this.currentKey, this.messages);
		this.renderMessages();
	}

	private async send(preset?: string): Promise<void> {
		// A second click while streaming acts as Stop.
		if (this.sending) {
			this.abortController?.abort();
			return;
		}
		const text = (preset ?? this.inputEl.value).trim();
		if (text === "") return;

		// Re-read the open note so the reply reflects the current document.
		await this.refreshContext();

		const resolved = resolveProvider(this.plugin.settings, this.override);
		if (!resolved.ok) {
			new Notice(resolved.error);
			return;
		}

		// Capture the conversation + key so completion always lands here, even if
		// the view closes mid-flight.
		const key = this.currentKey;
		const conversation = this.messages;

		conversation.push({ role: "user", content: text });
		if (preset === undefined) this.inputEl.value = "";
		this.setSending(true);
		this.renderMessages();

		// Payload = system + history (the user turn just pushed), before placeholder.
		const payload: ChatMessage[] = [];
		if (this.systemContext) {
			payload.push({ role: "system", content: this.systemContext });
		}
		payload.push(...conversation);

		// Streaming placeholder rendered as plain text (re-rendered as Markdown
		// only when complete, to avoid re-parsing Markdown on every token).
		const assistant: ChatMessage = { role: "assistant", content: "" };
		conversation.push(assistant);
		const contentEl = this.addMessageEl(assistant, true);
		contentEl.setText("…");
		this.logEl.scrollTop = this.logEl.scrollHeight;

		this.abortController = new AbortController();
		let truncated = false;
		let errored = false;
		try {
			let first = true;
			const result = await streamOrComplete(resolved.config, payload, {
				stream: this.plugin.settings.aiStream,
				temperature: this.plugin.settings.aiTemperature,
				onDelta: (delta) => {
					if (first) {
						contentEl.setText("");
						first = false;
					}
					assistant.content += delta;
					contentEl.setText(assistant.content);
					this.logEl.scrollTop = this.logEl.scrollHeight;
				},
				signal: this.abortController.signal,
			});
			// `result.text` is authoritative (covers the stream→complete fallback).
			assistant.content = result.text;
			truncated = result.truncated;
		} catch (e) {
			if (!this.abortController.signal.aborted) {
				errored = true;
				new Notice(errorMessage(e));
			}
		} finally {
			this.abortController = undefined;
			// Drop turns that produced nothing or errored — errors are surfaced via
			// Notice and never persisted or re-sent to the provider.
			if (errored || assistant.content.trim() === "") {
				const idx = conversation.indexOf(assistant);
				if (idx >= 0) conversation.splice(idx, 1);
				truncated = false;
			}
			this.lastTruncated = truncated;
			if (!this.closed) {
				this.setSending(false);
				this.updateContinueVisibility();
				this.renderMessages();
			}
			await this.plugin.setChat(key, conversation);
		}
	}
}
