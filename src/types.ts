import type { TFile } from "obsidian";

/**
 * Shared types and constants for nxyz agent.
 * This module is the dependency floor: it holds no logic and imports nothing
 * local, so every other module can depend on it without creating a cycle.
 */

export type ProjectStatus = "active" | "paused" | "archived" | "done";

/** Supported bring-your-own-key chat providers (all OpenAI-compatible). */
export type AiProvider = "deepseek" | "openrouter" | "openai";

/** A single chat turn (system messages are regenerated, not persisted). */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface NxyzAgentSettings {
	/** Folder that holds project cards. */
	projectRegistryFolder: string;
	/** Folder where generated context packs are written. */
	contextPackFolder: string;
	/** Folder that holds per-project work logs, tasks, decisions and build notes. */
	workLogFolder: string;
	/** Status stamped into a freshly created project card. */
	defaultProjectStatus: ProjectStatus;
	/** Path fragments that are skipped when reading linked notes / backlinks. */
	ignoredFolders: string[];
	/** Hard ceiling on the assembled context size, in characters. */
	maxContextChars: number;
	/** Include notes the project card links out to. */
	includeLinkedNotes: boolean;
	/** Include notes that link back to the project card. */
	includeBacklinks: boolean;
	/** Include the currently active note. */
	includeActiveNote: boolean;
	/** Include the project work log (log.md) in the assembled context. */
	includeWorkLog: boolean;

	// --- AI (bring your own key) ---------------------------------------------
	/** Which provider the chat panel talks to. */
	aiProvider: AiProvider;
	/** API keys, stored locally in the plugin's data.json. */
	deepseekApiKey: string;
	openrouterApiKey: string;
	openaiApiKey: string;
	/** Model id per provider. */
	deepseekModel: string;
	openrouterModel: string;
	openaiModel: string;
	/** Stream chat responses token-by-token (falls back to a single response). */
	aiStream: boolean;
	/** LLM temperature (0 = deterministic/focused, 1 = creative). Default 0.3. */
	aiTemperature: number;
}

export const DEFAULT_SETTINGS: NxyzAgentSettings = {
	projectRegistryFolder: "nxyz agent",
	contextPackFolder: "nxyz agent/Context Packs",
	workLogFolder: "nxyz agent/Work Logs",
	defaultProjectStatus: "active",
	ignoredFolders: [".obsidian", ".git", "node_modules", "dist", "build"],
	maxContextChars: 24000,
	includeLinkedNotes: true,
	includeBacklinks: false,
	includeActiveNote: true,
	includeWorkLog: true,
	aiProvider: "deepseek",
	deepseekApiKey: "",
	openrouterApiKey: "",
	openaiApiKey: "",
	deepseekModel: "deepseek-chat",
	openrouterModel: "openai/gpt-4o-mini",
	openaiModel: "gpt-4o-mini",
	aiStream: true,
	aiTemperature: 0.3,
};

/**
 * Parsed frontmatter of a project card. Every field is optional because cards
 * are plain Markdown that the user may hand-edit.
 */
export interface ProjectCardMeta {
	type?: string;
	status?: ProjectStatus | string;
	repo?: string;
	domain?: string;
	stack?: string | string[];
	tags?: string[];
	last_reviewed?: string;
	agent_scope?: string;
	/** Optional per-project AI overrides (fall back to global settings). */
	ai_provider?: string;
	ai_model?: string;
	[key: string]: unknown;
}

/**
 * The single reusable handle to "the current project", produced by
 * resolveCurrentProject and consumed by most commands.
 */
export interface ResolvedProject {
	/** The project card file in the registry folder. */
	file: TFile;
	/** Stable slug = card basename. Used for work logs, tasks, decisions. */
	slug: string;
	/** Parsed frontmatter (never null; empty object when absent). */
	meta: ProjectCardMeta;
	/** Human display name = card basename. */
	name: string;
}

/** A note plus its content, used for linked notes and backlinks. */
export interface LinkedNote {
	file: TFile;
	content: string;
}

/** Everything gathered for a context pack / handoff prompt. */
export interface ContextAssembly {
	project: ResolvedProject;
	generatedAt: string;
	cardContent: string;
	activeNote: LinkedNote | null;
	linkedNotes: LinkedNote[];
	backlinks: LinkedNote[];
	/** The project work log (log.md), if enabled and present. */
	workLog: LinkedNote | null;
	settingsSummary: string;
	constraints: string[];
	/** True if any section was cut to honour maxContextChars. */
	truncated: boolean;
}
