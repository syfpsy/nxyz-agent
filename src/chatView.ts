import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type NxyzAgentPlugin from "./main";
import { resolveProjectNonInteractive } from "./projectRegistry";
import { assembleContext, buildHandoffPrompt } from "./contextPack";
import {
	ChatMessage,
	chatComplete,
	providerLabel,
	resolveProvider,
} from "./providers";

export const NXYZ_CHAT_VIEW_TYPE = "nxyz-agent-chat-view";

/**
 * AI chat panel. The current project's handoff prompt (constraints + condensed
 * context) is sent as the system message, so the model answers grounded in the
 * project. Bring-your-own-key; non-streaming via Obsidian's requestUrl.
 */
export class NxyzAgentChatView extends ItemView {
	private messages: ChatMessage[] = [];
	private systemContext = "";
	private projectName: string | null = null;
	private sending = false;

	private logEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private contextEl!: HTMLElement;

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

	/** Rebuild the system context from the current project (if any). */
	private async loadContext(): Promise<void> {
		const project = resolveProjectNonInteractive(
			this.app,
			this.plugin.settings
		);
		if (project) {
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
				this.projectName = project.name;
			} catch {
				this.systemContext = "";
				this.projectName = null;
			}
		} else {
			this.systemContext = "";
			this.projectName = null;
		}
		this.updateContextLabel();
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
		clear.addEventListener("click", () => {
			this.messages = [];
			this.renderMessages();
		});

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
		const sendBtn = inputRow.createEl("button", {
			cls: "nxyz-chat-send mod-cta",
			text: "Send",
		});
		sendBtn.addEventListener("click", () => void this.send());

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

	private async send(): Promise<void> {
		if (this.sending) return;
		const text = this.inputEl.value.trim();
		if (text === "") return;

		const resolved = resolveProvider(this.plugin.settings);
		if (!resolved.ok) {
			new Notice(resolved.error);
			return;
		}

		this.messages.push({ role: "user", content: text });
		this.inputEl.value = "";
		this.sending = true;
		this.renderMessages();

		const thinking = this.logEl.createDiv({
			cls: "nxyz-chat-thinking",
			text: `${providerLabel(this.plugin.settings.aiProvider)} is thinking…`,
		});
		this.logEl.scrollTop = this.logEl.scrollHeight;

		try {
			const payload: ChatMessage[] = [];
			if (this.systemContext) {
				payload.push({ role: "system", content: this.systemContext });
			}
			payload.push(...this.messages);
			const reply = await chatComplete(resolved.config, payload);
			this.messages.push({ role: "assistant", content: reply });
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			this.messages.push({ role: "assistant", content: `⚠️ ${msg}` });
			new Notice(msg);
		} finally {
			this.sending = false;
			thinking.remove();
			this.renderMessages();
		}
	}
}
