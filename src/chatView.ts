import {
	Component,
	ItemView,
	MarkdownRenderer,
	Notice,
	WorkspaceLeaf,
} from "obsidian";
import type NxyzAgentPlugin from "./main";
import type { ChatMessage } from "./types";
import {
	appendWorkLogEntry,
	resolveProjectNonInteractive,
} from "./projectRegistry";
import { assembleContext, buildHandoffPrompt } from "./contextPack";
import { copyToClipboard } from "./fileUtils";
import { demoteMarkdownHeadings, sanitizeReplyMarkdown } from "./templates";
import {
	ProviderOverride,
	chatComplete,
	chatStream,
	effectiveProviderModel,
	providerLabel,
	resolveProvider,
} from "./providers";

export const NXYZ_CHAT_VIEW_TYPE = "nxyz-agent-chat-view";

const GENERAL_KEY = "_general";

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
	private projectName: string | null = null;
	private currentKey = GENERAL_KEY;
	private sourcePath = "";
	private override: ProviderOverride = {};
	private sending = false;
	private closed = false;
	private abortController?: AbortController;

	/** Child component that owns the Markdown renders (unloaded on re-render). */
	private renderChild?: Component;

	private logEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private contextEl!: HTMLElement;
	private sendBtn!: HTMLButtonElement;
	private reloadBtn!: HTMLButtonElement;
	private clearBtn!: HTMLButtonElement;

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
		await this.loadContext();
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.abortController?.abort();
	}

	/** Rebuild the system context and load history for the current project. */
	private async loadContext(): Promise<void> {
		if (this.sending) {
			new Notice("Stop or finish the current reply first.");
			return;
		}
		const project = resolveProjectNonInteractive(
			this.app,
			this.plugin.settings
		);
		if (project) {
			this.projectName = project.name;
			this.currentKey = project.slug;
			this.sourcePath = project.file.path;
			this.override = {
				provider: project.meta.ai_provider,
				model: project.meta.ai_model,
			};
			try {
				const assembly = await assembleContext(
					this.app,
					this.plugin.settings,
					project
				);
				this.systemContext = buildHandoffPrompt(
					assembly,
					this.plugin.settings.maxContextChars
				).prompt;
			} catch {
				this.systemContext = "";
			}
		} else {
			this.projectName = null;
			this.currentKey = GENERAL_KEY;
			this.sourcePath = "";
			this.override = {};
			this.systemContext = "";
		}
		this.messages = this.plugin.getChat(this.currentKey).slice();
		this.updateContextLabel();
		this.renderMessages();
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

		this.logEl = root.createDiv({ cls: "nxyz-chat-log" });

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
		const label = `${providerLabel(provider)} · ${model}`;
		this.contextEl.setText(
			this.projectName
				? `Context: ${this.projectName} · ${label}`
				: `No project context · ${label}`
		);
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
		this.sendBtn.setText(sending ? "Stop" : "Send");
		this.sendBtn.toggleClass("mod-warning", sending);
		// Prevent swapping the conversation out from under an in-flight request.
		this.reloadBtn.disabled = sending;
		this.clearBtn.disabled = sending;
	}

	private async clear(): Promise<void> {
		if (this.sending) return;
		this.messages = [];
		await this.plugin.setChat(this.currentKey, this.messages);
		this.renderMessages();
	}

	private async send(): Promise<void> {
		// A second click while streaming acts as Stop.
		if (this.sending) {
			this.abortController?.abort();
			return;
		}
		const text = this.inputEl.value.trim();
		if (text === "") return;

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
		this.inputEl.value = "";
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
		try {
			if (this.plugin.settings.aiStream) {
				try {
					let first = true;
					await chatStream(
						resolved.config,
						payload,
						(delta) => {
							if (first) {
								contentEl.setText("");
								first = false;
							}
							assistant.content += delta;
							contentEl.setText(assistant.content);
							this.logEl.scrollTop = this.logEl.scrollHeight;
						},
						this.abortController.signal
					);
				} catch (streamErr) {
					if (this.abortController.signal.aborted) throw streamErr;
					// Streaming failed (e.g. CORS) — fall back to a single response.
					assistant.content = await chatComplete(resolved.config, payload);
				}
			} else {
				assistant.content = await chatComplete(resolved.config, payload);
			}
		} catch (e) {
			if (!this.abortController.signal.aborted) {
				const msg = e instanceof Error ? e.message : String(e);
				assistant.content = `⚠️ ${msg}`;
				new Notice(msg);
			}
		} finally {
			this.abortController = undefined;
			// Drop an assistant turn that produced nothing (e.g. stopped early).
			if (assistant.content.trim() === "") {
				const idx = conversation.indexOf(assistant);
				if (idx >= 0) conversation.splice(idx, 1);
			}
			if (!this.closed) {
				this.setSending(false);
				this.renderMessages();
			}
			await this.plugin.setChat(key, conversation);
		}
	}
}
