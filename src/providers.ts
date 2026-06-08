import { requestUrl } from "obsidian";
import type { AiProvider, ChatMessage, NxyzAgentSettings } from "./types";

export type { ChatMessage } from "./types";

/**
 * Bring-your-own-key chat layer. DeepSeek, OpenRouter and OpenAI all expose the
 * same OpenAI-compatible `/chat/completions` endpoint, so a single client with
 * a configurable base URL + key + model covers all three. Non-streaming calls
 * use Obsidian's `requestUrl` (no CORS, mobile-safe); streaming uses `fetch`
 * with Server-Sent Events and falls back to the non-streaming path on failure.
 */

interface ResolvedProvider {
	provider: AiProvider;
	baseUrl: string;
	apiKey: string;
	model: string;
	headers: Record<string, string>;
}

const PROVIDER_META: Record<AiProvider, { label: string; baseUrl: string }> = {
	deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
	openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
	openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
};

export function providerLabel(provider: AiProvider): string {
	return PROVIDER_META[provider].label;
}

/** Optional per-project overrides (from project-card frontmatter). */
export interface ProviderOverride {
	provider?: string;
	model?: string;
}

/** Narrow an arbitrary string to a supported provider. */
export function isAiProvider(value: unknown): value is AiProvider {
	return value === "deepseek" || value === "openrouter" || value === "openai";
}

function defaultModelFor(
	settings: NxyzAgentSettings,
	provider: AiProvider
): string {
	return provider === "deepseek"
		? settings.deepseekModel
		: provider === "openrouter"
			? settings.openrouterModel
			: settings.openaiModel;
}

function keyFor(settings: NxyzAgentSettings, provider: AiProvider): string {
	return provider === "deepseek"
		? settings.deepseekApiKey
		: provider === "openrouter"
			? settings.openrouterApiKey
			: settings.openaiApiKey;
}

/**
 * The effective provider + model after applying an optional per-project
 * override. A valid `override.provider` switches provider (and its default
 * model); a non-empty `override.model` overrides the model. Invalid overrides
 * are ignored. Does not check keys — safe for display.
 */
export function effectiveProviderModel(
	settings: NxyzAgentSettings,
	override?: ProviderOverride
): { provider: AiProvider; model: string } {
	const provider = isAiProvider(override?.provider)
		? override.provider
		: settings.aiProvider;
	const overrideModel = override?.model?.trim();
	const model = overrideModel || defaultModelFor(settings, provider);
	return { provider, model };
}

type ResolveResult =
	| { ok: true; config: ResolvedProvider }
	| { ok: false; error: string };

/** Resolve the provider's base URL, key and model, applying any override. */
export function resolveProvider(
	settings: NxyzAgentSettings,
	override?: ProviderOverride
): ResolveResult {
	const { provider, model } = effectiveProviderModel(settings, override);
	const key = keyFor(settings, provider);

	if (!key || key.trim() === "") {
		return {
			ok: false,
			error: `No API key set for ${providerLabel(provider)}. Add it in nxyz agent settings.`,
		};
	}
	if (!model || model.trim() === "") {
		return {
			ok: false,
			error: `No model set for ${providerLabel(provider)}. Add it in nxyz agent settings.`,
		};
	}

	const headers: Record<string, string> = {};
	if (provider === "openrouter") {
		// OpenRouter asks for attribution headers; harmless elsewhere.
		headers["HTTP-Referer"] = "https://obsidian.md";
		headers["X-Title"] = "nxyz agent";
	}

	return {
		ok: true,
		config: {
			provider,
			baseUrl: PROVIDER_META[provider].baseUrl,
			apiKey: key.trim(),
			model: model.trim(),
			headers,
		},
	};
}

function parseErrorMessage(raw: string): string {
	try {
		const data = JSON.parse(raw);
		const msg = data?.error?.message ?? data?.message;
		if (typeof msg === "string" && msg.length > 0) return msg;
	} catch {
		// not JSON
	}
	return raw.slice(0, 300) || "unknown error";
}

export interface ChatResult {
	text: string;
	/** True when the model stopped because it hit the output length limit. */
	truncated: boolean;
}

/** Send a chat completion and return the assistant's text. Throws on failure. */
export async function chatComplete(
	config: ResolvedProvider,
	messages: ChatMessage[],
	temperature = 0.3
): Promise<ChatResult> {
	const res = await requestUrl({
		url: `${config.baseUrl}/chat/completions`,
		method: "POST",
		throw: false,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.apiKey}`,
			...config.headers,
		},
		body: JSON.stringify({
			model: config.model,
			messages,
			temperature,
			stream: false,
		}),
	});

	if (res.status < 200 || res.status >= 300) {
		throw new Error(
			`${providerLabel(config.provider)} error ${res.status}: ${parseErrorMessage(res.text)}`
		);
	}

	let data: unknown = null;
	try {
		data = JSON.parse(res.text);
	} catch {
		throw new Error(`${providerLabel(config.provider)} returned a non-JSON response.`);
	}

	const choice = (
		data as {
			choices?: {
				message?: { content?: unknown };
				finish_reason?: unknown;
			}[];
		}
	)?.choices?.[0];
	const content = choice?.message?.content;

	if (typeof content !== "string" || content.trim() === "") {
		throw new Error(`${providerLabel(config.provider)} returned an empty response.`);
	}
	return { text: content, truncated: choice?.finish_reason === "length" };
}

/**
 * Stream a chat completion via Server-Sent Events, invoking `onDelta` for each
 * token chunk. Returns the full text. Uses `fetch` (required for streaming);
 * throws on transport/HTTP failure so callers can fall back to `chatComplete`.
 */
export async function chatStream(
	config: ResolvedProvider,
	messages: ChatMessage[],
	onDelta: (text: string) => void,
	signal?: AbortSignal,
	temperature = 0.3
): Promise<ChatResult> {
	const res = await fetch(`${config.baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.apiKey}`,
			...config.headers,
		},
		body: JSON.stringify({
			model: config.model,
			messages,
			temperature,
			stream: true,
		}),
		signal,
	});

	if (!res.ok || !res.body) {
		const text = await res.text().catch(() => "");
		throw new Error(
			`${providerLabel(config.provider)} error ${res.status}: ${parseErrorMessage(text)}`
		);
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let full = "";
	let truncated = false;

	const processLine = (line: string): void => {
		const trimmed = line.trim();
		if (!trimmed.startsWith("data:")) return; // skip comments / blanks
		const payload = trimmed.slice(5).trim();
		if (payload === "" || payload === "[DONE]") return;
		try {
			const json = JSON.parse(payload) as {
				choices?: {
					delta?: { content?: unknown };
					finish_reason?: unknown;
				}[];
			};
			const choice = json.choices?.[0];
			const delta = choice?.delta?.content;
			if (typeof delta === "string" && delta.length > 0) {
				full += delta;
				onDelta(delta);
			}
			if (typeof choice?.finish_reason === "string") {
				truncated = choice.finish_reason === "length";
			}
		} catch {
			// ignore partial / non-JSON keep-alive lines
		}
	};

	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) processLine(line);
	}
	// A final SSE event may arrive without a trailing newline.
	if (buffer.trim() !== "") processLine(buffer);

	if (full.trim() === "") {
		throw new Error(`${providerLabel(config.provider)} returned an empty response.`);
	}
	return { text: full, truncated };
}

/**
 * Stream when enabled, transparently falling back to a single (non-streaming)
 * request if streaming fails for a non-abort reason. The returned `text` is the
 * authoritative full reply — callers should set their final content from it
 * (the `onDelta` updates are for live display only).
 */
export async function streamOrComplete(
	config: ResolvedProvider,
	messages: ChatMessage[],
	opts: { stream: boolean; onDelta: (text: string) => void; signal: AbortSignal }
): Promise<ChatResult> {
	if (opts.stream) {
		try {
			return await chatStream(config, messages, opts.onDelta, opts.signal);
		} catch (e) {
			if (opts.signal.aborted) throw e;
			// Streaming failed (e.g. CORS) — fall back to a single response.
			return await chatComplete(config, messages);
		}
	}
	return await chatComplete(config, messages);
}
