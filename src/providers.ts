import { requestUrl } from "obsidian";
import type { AiProvider, NxyzAgentSettings } from "./types";

/**
 * Bring-your-own-key chat layer. DeepSeek, OpenRouter and OpenAI all expose the
 * same OpenAI-compatible `/chat/completions` endpoint, so a single client with
 * a configurable base URL + key + model covers all three. Requests go through
 * Obsidian's `requestUrl` to avoid CORS and work on mobile.
 */

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

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

type ResolveResult =
	| { ok: true; config: ResolvedProvider }
	| { ok: false; error: string };

/** Resolve the active provider's base URL, key and model from settings. */
export function resolveProvider(settings: NxyzAgentSettings): ResolveResult {
	const provider = settings.aiProvider;
	const key =
		provider === "deepseek"
			? settings.deepseekApiKey
			: provider === "openrouter"
				? settings.openrouterApiKey
				: settings.openaiApiKey;
	const model =
		provider === "deepseek"
			? settings.deepseekModel
			: provider === "openrouter"
				? settings.openrouterModel
				: settings.openaiModel;

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

/** Send a chat completion and return the assistant's text. Throws on failure. */
export async function chatComplete(
	config: ResolvedProvider,
	messages: ChatMessage[],
	temperature = 0.3
): Promise<string> {
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

	const content = (
		data as {
			choices?: { message?: { content?: unknown } }[];
		}
	)?.choices?.[0]?.message?.content;

	if (typeof content !== "string" || content.trim() === "") {
		throw new Error(`${providerLabel(config.provider)} returned an empty response.`);
	}
	return content;
}
