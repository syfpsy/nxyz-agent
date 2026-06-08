import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type NxyzAgentPlugin from "./main";
import type { ChatMessage } from "./types";
import { resolveProjectNonInteractive } from "./projectRegistry";
import { assembleContext, buildHandoffPrompt } from "./contextPack";
import {
	chatComplete,
	chatStream,
	providerLabel,
	resolveProvider,
} from "./providers";

export const NXYZ_CHAT_VIEW_TYPE = "nxyz-agent-chat-view";

const GENERAL_KEY = "_general";

/**
 * AI chat panel. The current project's handoff prompt (constraints + condensed
 * context) is sent as the system message, so the model answers grounded in the
 * project. Bring-your-own-key; streaming via `fetch`/SSE with a non-streaming
 * fallback. History is persisted per project in the plugin's data.json.
 */
export class NxyzAgentChatView extends ItemView {
	private messages: ChatMessage[] = [];
	private systemContext = "";
	private projectName: string | null = null;
	private currentKey = GENERAL_KEY;
	private sending = false;
	private abortController?: AbortController;

	private logEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private contextEl!: HTMLElement;
	private sendBtn!: HTMLButtonElement;

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

	/** Rebuild the system context and load history for the current project. */
	private async loadContext(): Promise<void> {
		const project = resolveProjectNonInteractive(
			this.app,
			this.plugin.settings
		);
		if (project) {
			this.projectName = project.name;
			this.currentKey = project.slug;
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
		const reload = header.createEl("button", {
			cls: "nxyz-chat-btn",
			text: "Reload context",
		});
		reload.addEventListener("click", () => void this.loadContext());
		const clear = header.createEl("button", {
			cls: "nxyz-chat-btn",
			text: "Clear",
		});
		clear.addEventListener("click", () => void this.clear());

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
		const provider = providerLabel(this.plugin.settings.aiProvider);
		this.contextEl.setText(
			this.projectName
				? `Context: ${this.projectName} · ${provider}`
				: `No project context · ${provider}`
		);
	}

	private renderMessages(): void {
		this.logEl.empty();
		if (this.messages.length === 0) {
			this.logEl.createDiv({
				cls: "nxyz-chat-empty",
				text: "Start a conversation. The current project's context is sent as background.",
			});
			return;
		}
		for (const m of this.messages) {
			const bubble = this.logEl.createDiv({
				cls: `nxyz-chat-msg nxyz-chat-${m.role}`,
			});
			bubble.createDiv({
				cls: "nxyz-chat-role",
				text: m.role === "user" ? "You" : "Agent",
			});
			bubble.createDiv({ cls: "nxyz-chat-content", text: m.content });
		}
		this.logEl.scrollTop = this.logEl.scrollHeight;
	}

	/** The content element of the last rendered message (for live updates). */
	private lastContentEl(): HTMLElement | null {
		const nodes = this.logEl.querySelectorAll(".nxyz-chat-content");
		return (nodes.item(nodes.length - 1) as HTMLElement) ?? null;
	}

	private setSending(sending: boolean): void {
		this.sending = sending;
		this.sendBtn.setText(sending ? "Stop" : "Send");
		this.sendBtn.toggleClass("mod-warning", sending);
	}

	private async clear(): Promise<void> {
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

		const resolved = resolveProvider(this.plugin.settings);
		if (!resolved.ok) {
			new Notice(resolved.error);
			return;
		}

		this.messages.push({ role: "user", content: text });
		this.inputEl.value = "";
		this.setSending(true);
		this.renderMessages();

		// Build the request payload (system + history) before the placeholder.
		const payload: ChatMessage[] = [];
		if (this.systemContext) {
			payload.push({ role: "system", content: this.systemContext });
		}
		payload.push(...this.messages);

		const assistant: ChatMessage = { role: "assistant", content: "" };
		this.messages.push(assistant);
		this.renderMessages();
		const contentEl = this.lastContentEl();
		contentEl?.setText("…");

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
								contentEl?.setText("");
								first = false;
							}
							assistant.content += delta;
							contentEl?.setText(assistant.content);
							this.logEl.scrollTop = this.logEl.scrollHeight;
						},
						this.abortController.signal
					);
				} catch (streamErr) {
					if (this.abortController.signal.aborted) throw streamErr;
					// Streaming failed (e.g. CORS) — fall back to a single response.
					const reply = await chatComplete(resolved.config, payload);
					assistant.content = reply;
					contentEl?.setText(reply);
				}
			} else {
				const reply = await chatComplete(resolved.config, payload);
				assistant.content = reply;
				contentEl?.setText(reply);
			}
		} catch (e) {
			const aborted = this.abortController.signal.aborted;
			if (!aborted) {
				const msg = e instanceof Error ? e.message : String(e);
				assistant.content = `⚠️ ${msg}`;
				contentEl?.setText(assistant.content);
				new Notice(msg);
			}
		} finally {
			this.abortController = undefined;
			this.setSending(false);
			// Drop an assistant turn that produced nothing (e.g. stopped early).
			if (assistant.content.trim() === "") {
				const idx = this.messages.indexOf(assistant);
				if (idx >= 0) this.messages.splice(idx, 1);
				this.renderMessages();
			}
			await this.plugin.setChat(this.currentKey, this.messages);
		}
	}
}
