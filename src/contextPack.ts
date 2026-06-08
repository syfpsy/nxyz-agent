import { App, TFile, normalizePath } from "obsidian";
import { ContextAssembly, NxyzAgentSettings, ResolvedProject } from "./types";
import {
	collectBacklinks,
	createFileIfMissing,
	getCurrentDateTimeString,
	isIgnored,
	readLinkedNotes,
	truncateToLimit,
} from "./fileUtils";
import {
	CONTEXT_CONSTRAINTS,
	agentPromptTemplate,
	contextPackTemplate,
} from "./templates";

/**
 * The single home of context assembly. Both "Build context pack" and "Copy
 * agent handoff prompt" call assembleContext + one of the build* helpers, so
 * the gathering logic lives in exactly one place.
 */

/** Compact, human-readable summary of the settings that shaped this pack. */
function renderSettingsSummary(s: NxyzAgentSettings): string {
	return [
		`- Include active note: ${s.includeActiveNote}`,
		`- Include linked notes: ${s.includeLinkedNotes}`,
		`- Include backlinks: ${s.includeBacklinks}`,
		`- Max context characters: ${s.maxContextChars}`,
		`- Ignored folders: ${s.ignoredFolders.join(", ") || "(none)"}`,
	].join("\n");
}

/**
 * Gather the project card plus optional active note, linked notes and
 * backlinks. Reads only the card and its resolved links — never the whole vault.
 */
export async function assembleContext(
	app: App,
	settings: NxyzAgentSettings,
	project: ResolvedProject
): Promise<ContextAssembly> {
	const cardContent = await app.vault.cachedRead(project.file);

	let activeNote: ContextAssembly["activeNote"] = null;
	if (settings.includeActiveNote) {
		const active = app.workspace.getActiveFile();
		if (
			active &&
			active.path !== project.file.path &&
			!isIgnored(active.path, settings.ignoredFolders)
		) {
			try {
				activeNote = {
					file: active,
					content: await app.vault.cachedRead(active),
				};
			} catch {
				activeNote = null;
			}
		}
	}

	const linkedNotes = settings.includeLinkedNotes
		? await readLinkedNotes(app, project.file, settings.ignoredFolders)
		: [];
	const backlinks = settings.includeBacklinks
		? await collectBacklinks(app, project.file, settings.ignoredFolders)
		: [];

	return {
		project,
		generatedAt: getCurrentDateTimeString(),
		cardContent,
		activeNote,
		linkedNotes,
		backlinks,
		settingsSummary: renderSettingsSummary(settings),
		constraints: CONTEXT_CONSTRAINTS,
		truncated: false,
	};
}

/** Concatenate the gathered pieces in priority order, then enforce the limit. */
function condenseContext(
	a: ContextAssembly,
	maxChars: number
): { text: string; truncated: boolean } {
	const parts: string[] = [
		`[Project card — ${a.project.name}]\n${a.cardContent.trim()}`,
	];
	if (a.activeNote) {
		parts.push(
			`[Current note — ${a.activeNote.file.basename}]\n${a.activeNote.content.trim()}`
		);
	}
	for (const n of a.linkedNotes) {
		parts.push(`[Linked — ${n.file.basename}]\n${n.content.trim()}`);
	}
	for (const n of a.backlinks) {
		parts.push(`[Backlink — ${n.file.basename}]\n${n.content.trim()}`);
	}
	return truncateToLimit(parts.join("\n\n---\n\n"), maxChars);
}

/**
 * Build both the full context pack document and the copy-ready agent prompt.
 * Sets `a.truncated` as a side effect so the document can note it.
 */
export function buildContextPack(
	a: ContextAssembly,
	maxChars: number
): { doc: string; prompt: string; truncated: boolean } {
	const condensed = condenseContext(a, maxChars);
	a.truncated = condensed.truncated;
	return {
		doc: contextPackTemplate(a, condensed.text),
		prompt: agentPromptTemplate(condensed.text),
		truncated: condensed.truncated,
	};
}

/** A minimal system prompt grounded in just the active note (no project). */
export function buildActiveNotePrompt(
	name: string,
	content: string,
	maxChars: number
): string {
	const condensed = truncateToLimit(
		`[Current note — ${name}]\n${content.trim()}`,
		maxChars
	).text;
	return agentPromptTemplate(condensed);
}

/** Build only the agent handoff prompt (no document). */
export function buildHandoffPrompt(
	a: ContextAssembly,
	maxChars: number
): { prompt: string; truncated: boolean } {
	const condensed = condenseContext(a, maxChars);
	a.truncated = condensed.truncated;
	return {
		prompt: agentPromptTemplate(condensed.text),
		truncated: condensed.truncated,
	};
}

/** Write the context pack to a uniquely named file in the output folder. */
export async function saveContextPack(
	app: App,
	settings: NxyzAgentSettings,
	project: ResolvedProject,
	doc: string
): Promise<TFile> {
	const stamp = getCurrentDateTimeString().replace(/[: ]/g, "-");
	const basePath = normalizePath(
		`${settings.contextPackFolder}/${project.slug}-${stamp}.md`
	);

	// Resolve a non-colliding path (datetime makes clashes rare).
	let candidate = basePath;
	let n = 1;
	while (app.vault.getAbstractFileByPath(candidate)) {
		n++;
		candidate = basePath.replace(/\.md$/, `-${n}.md`);
	}

	const { file } = await createFileIfMissing(app, candidate, doc);
	return file;
}
